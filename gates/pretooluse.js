#!/usr/bin/env node
// P9.4 — the PreToolUse gate runner. Reads a pending Write/Edit tool call
// from stdin (Claude Code's hook JSON shape), finds gate-tier rules in the
// current project's rules.yaml whose scope matches the file being
// touched, simulates the pending change in a scratch copy, runs the
// gate's check: command against that scratch copy, and blocks (exit 2)
// if it fails — before the real write ever happens.
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

import { readFileSync, existsSync, mkdtempSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { tmpdir } from 'node:os'
import yaml from 'js-yaml'
import { minimatch } from 'minimatch'
import { incrementBlocked } from './session-state.js'

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
  const filePath = toolInput.file_path
  if (!filePath || (toolName !== 'Write' && toolName !== 'Edit')) process.exit(0)

  const memrepoPath = process.env.MEMREPO_PATH || path.join(process.env.HOME || '', '.outerbot', 'memrepo')
  if (!existsSync(memrepoPath)) process.exit(0) // no memrepo — nothing to gate against

  const projectSlug = process.env.PROJECT_SLUG || slugify(path.basename(cwd))
  const gates = loadGateRules(memrepoPath, projectSlug)
  if (gates.length === 0) process.exit(0)

  const relPath = relativeToRepoRoot(filePath, cwd)
  const matchingGates = gates.filter(g => g.scope.some(pattern => minimatch(relPath, pattern)))
  if (matchingGates.length === 0) process.exit(0)

  const newContent = resolveNewContent(toolName, toolInput, filePath)
  if (newContent === null) process.exit(0) // couldn't determine the pending content — fail open, don't block on a guess

  for (const gate of matchingGates) {
    const result = evaluateGate(gate, cwd, relPath, newContent)
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
