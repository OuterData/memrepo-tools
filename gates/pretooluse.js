#!/usr/bin/env node
// P9.4 — the PreToolUse gate runner. Reads a pending tool call from stdin
// (Claude Code's hook JSON shape), finds gate-tier rules in the current
// project's rules.yaml whose scope matches, evaluates the gate's check:
// command against the pending change, and blocks (exit 2) if it fails —
// before the real write/command/read ever happens.
//
// HONEST NOTE ON FIELD NAMES: Claude Code's docs and community examples
// disagree on the exact tool_input field name for Write's new content
// ("content" vs "file_text") - couldn't resolve this by testing live
// (hook config changes aren't picked up mid-session, and forcing a
// session restart to verify wasn't appropriate to do unilaterally). This
// checks both field names defensively rather than betting on one guess.
//
// Exit 0 = allow. Exit 2 + stderr = block (Claude Code's documented
// PreToolUse blocking contract).
//
// Stage 3 item 1 — extended beyond Write/Edit to cover Bash and Read.
// Those tools don't have "pending file content" to check a rule against —
// the thing a rule needs to see is the COMMAND ITSELF (Bash) or the PATH
// BEING READ (Read), not any file's contents, and it must be evaluated
// before the tool runs, never by inspecting output after the fact (by
// the time a command has run or a file has been read, a secret is
// already printed — checking output is checking too late). Rather than
// extend rules.yaml's schema with a new tool-specific shape, this reuses
// the exact existing check:-command machinery unchanged: the pending
// command text (Bash) or file path (Read) is treated as the "content" of
// a virtual file at a fixed, reserved path
// (`.claude-hooks/pending-bash-command.txt` /
// `.claude-hooks/pending-read-path.txt`), scoped in rules.yaml exactly
// like any other file-scoped gate. A rule author writes an ordinary
// check: command (e.g. `! grep -qE 'pattern' .claude-hooks/pending-bash-
// command.txt`) against that virtual path — no new rules.yaml fields, no
// new concepts, same evaluateGate() function, same scratch-copy
// simulation, same failure semantics as every other gate.

import { readFileSync, existsSync, mkdtempSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { tmpdir } from 'node:os'
import yaml from 'js-yaml'
import { minimatch } from 'minimatch'
import { incrementBlocked } from './session-state.js'

const BASH_COMMAND_VIRTUAL_PATH = '.claude-hooks/pending-bash-command.txt'
const READ_PATH_VIRTUAL_PATH = '.claude-hooks/pending-read-path.txt'

function readStdin() {
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

function slugify(input) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project'
}

/** Returns the pending file's new content after this tool call, or null
 *  if this isn't a Write/Edit we can evaluate (e.g. a brand-new file
 *  Edit would target, which Edit can't create anyway — Claude Code
 *  requires Write for new files). */
function resolveNewContent(toolName, toolInput, currentFilePath) {
  if (toolName === 'Write') {
    return toolInput.content ?? toolInput.file_text ?? null
  }
  if (toolName === 'Edit') {
    if (!existsSync(currentFilePath)) return null
    const current = readFileSync(currentFilePath, 'utf8')
    if (typeof toolInput.old_string !== 'string' || typeof toolInput.new_string !== 'string') return null
    if (!current.includes(toolInput.old_string)) return null // edit wouldn't apply cleanly — not this runner's problem to diagnose
    return current.replace(toolInput.old_string, toolInput.new_string)
  }
  return null
}

/** Stage 3 item 1 — resolves what to evaluate for a pending tool call,
 *  across every tool type this runner understands. Returns
 *  { relPath, content } to check gates against, or null if this tool
 *  call isn't one this runner evaluates at all. relPath is always
 *  forward-slash — real files go through relativeToRepoRoot(), virtual
 *  ones are already in that form by construction. */
function resolvePendingChange(toolName, toolInput, cwd) {
  if (toolName === 'Write' || toolName === 'Edit') {
    const filePath = toolInput.file_path
    if (!filePath) return null
    const content = resolveNewContent(toolName, toolInput, filePath)
    if (content === null) return null // couldn't determine pending content — fail open, don't block on a guess
    return { relPath: relativeToRepoRoot(filePath, cwd), content }
  }
  if (toolName === 'Bash') {
    if (typeof toolInput.command !== 'string') return null
    return { relPath: BASH_COMMAND_VIRTUAL_PATH, content: toolInput.command }
  }
  if (toolName === 'Read') {
    if (typeof toolInput.file_path !== 'string') return null
    return { relPath: READ_PATH_VIRTUAL_PATH, content: toolInput.file_path }
  }
  return null
}

function loadGateRules(memrepoPath, projectSlug) {
  const rulesPath = path.join(memrepoPath, 'projects', projectSlug, 'rules.yaml')
  if (!existsSync(rulesPath)) return []
  let doc
  try {
    doc = yaml.load(readFileSync(rulesPath, 'utf8'))
  } catch {
    return [] // malformed rules.yaml shouldn't block every tool call — memrepo validate is the place to catch this
  }
  if (!Array.isArray(doc)) return []
  return doc.filter(r => r && r.tier === 'gate' && r.check && Array.isArray(r.scope))
}

function relativeToRepoRoot(filePath, repoRoot) {
  const rel = path.relative(repoRoot, filePath)
  return rel.split(path.sep).join('/') // glob patterns in rules.yaml are POSIX-style regardless of host OS
}

function evaluateGate(rule, repoRoot, changedRelPath, newContent) {
  const scratchDir = mkdtempSync(path.join(tmpdir(), 'memrepo-gate-'))
  try {
    // Mirror only what's needed: copy repoRoot's tracked files into the
    // scratch dir (best-effort — a plain recursive copy, not git-aware;
    // fine for the check commands this format anticipates, which grep
    // over a subtree, not the full history).
    cpSync(repoRoot, scratchDir, {
      recursive: true,
      filter: (src) => !src.includes(`${path.sep}.git${path.sep}`) && !src.includes(`${path.sep}node_modules${path.sep}`),
    })

    const scratchFilePath = path.join(scratchDir, changedRelPath)
    mkdirSync(path.dirname(scratchFilePath), { recursive: true })
    writeFileSync(scratchFilePath, newContent)

    // check: commands are POSIX shell (SPEC.md's own examples use bash's
    // "!" negation) — execSync's default shell is cmd.exe on Windows,
    // which doesn't understand that syntax at all. Explicit bash makes
    // this portable rather than silently wrong on Windows (found by
    // testing for real: a bad check on Windows failed with "'!' is not
    // recognized," which this function's try/catch was treating as a
    // genuine rule violation — same wrong-block outcome as a real
    // violation, for a completely unrelated reason).
    execSync(rule.check, { cwd: scratchDir, stdio: 'pipe', shell: 'bash' })
    return { pass: true }
  } catch (e) {
    return { pass: false, detail: e.stderr ? e.stderr.toString() : e.message }
  } finally {
    rmSync(scratchDir, { recursive: true, force: true })
  }
}

function main() {
  const raw = readStdin()
  if (!raw) process.exit(0) // no payload — nothing to evaluate, allow

  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    process.exit(0) // malformed input shouldn't block the tool call
  }

  const toolName = payload.tool_name
  const toolInput = payload.tool_input || {}
  const cwd = payload.cwd || process.cwd()
  const sessionId = payload.session_id || 'unknown-session'

  const memrepoPath = process.env.MEMREPO_PATH || path.join(process.env.HOME || '', '.outerbot', 'memrepo')
  if (!existsSync(memrepoPath)) process.exit(0) // no memrepo — nothing to gate against

  const projectSlug = process.env.PROJECT_SLUG || slugify(path.basename(cwd))
  const gates = loadGateRules(memrepoPath, projectSlug)
  if (gates.length === 0) process.exit(0)

  const pending = resolvePendingChange(toolName, toolInput, cwd)
  if (pending === null) process.exit(0) // not a tool type this runner evaluates, or couldn't resolve what's pending

  const matchingGates = gates.filter(g => g.scope.some(pattern => minimatch(pending.relPath, pattern)))
  if (matchingGates.length === 0) process.exit(0)

  for (const gate of matchingGates) {
    const result = evaluateGate(gate, cwd, pending.relPath, pending.content)
    if (!result.pass) {
      incrementBlocked(sessionId)
      process.stderr.write(`Blocked by memrepo gate "${gate.id}": ${gate.rule}\n`)
      if (result.detail) process.stderr.write(`Check failed: ${result.detail}\n`)
      process.exit(2)
    }
  }

  process.exit(0)
}

main()
