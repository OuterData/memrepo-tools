// Stage 3 item 4 — the gate-matching/evaluation core, extracted out of
// pretooluse.js so a second consumer (outer.bot's own server-side agent
// loop, in api/src/tool-executor.ts) can reuse the exact same logic
// instead of reimplementing it. pretooluse.js is now a thin CLI wrapper
// around these exports, reading Claude Code's specific stdin/hook
// contract and calling straight through to the same evaluateGate() a
// server-side caller uses directly, in-process, with no stdin/hook
// envelope at all.

import { readFileSync, existsSync, mkdtempSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { tmpdir } from 'node:os'
import yaml from 'js-yaml'
import { minimatch } from 'minimatch'

export const BASH_COMMAND_VIRTUAL_PATH = '.claude-hooks/pending-bash-command.txt'
export const READ_PATH_VIRTUAL_PATH = '.claude-hooks/pending-read-path.txt'

export function loadGateRules(memrepoPath, projectSlug) {
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

export function relativeToRepoRoot(filePath, repoRoot) {
  const rel = path.relative(repoRoot, filePath)
  return rel.split(path.sep).join('/') // glob patterns in rules.yaml are POSIX-style regardless of host OS
}

export function matchingGates(gates, relPath) {
  return gates.filter(g => g.scope.some(pattern => minimatch(relPath, pattern)))
}

/** Simulates the pending change in a scratch copy of repoRoot (never
 *  touches the real files) and runs the gate's check: command against
 *  that simulation. Returns { pass: true } or { pass: false, detail }. */
export function evaluateGate(rule, repoRoot, changedRelPath, newContent) {
  const scratchDir = mkdtempSync(path.join(tmpdir(), 'memrepo-gate-'))
  try {
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
    // this portable rather than silently wrong on Windows.
    execSync(rule.check, { cwd: scratchDir, stdio: 'pipe', shell: 'bash' })
    return { pass: true }
  } catch (e) {
    return { pass: false, detail: e.stderr ? e.stderr.toString() : e.message }
  } finally {
    rmSync(scratchDir, { recursive: true, force: true })
  }
}

/** Returns the pending file's new content after this tool call, or null
 *  if this isn't a Write/Edit we can evaluate. */
export function resolveNewContent(toolName, toolInput, currentFilePath) {
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

/** Resolves what to evaluate for a pending tool call, across every tool
 *  type this evaluator understands (Write/Edit content, Bash command
 *  text, Read file path — see pretooluse.js's header for the
 *  virtual-path convention). Returns { relPath, content } or null if
 *  this tool call isn't one this evaluator can check at all. */
export function resolvePendingChange(toolName, toolInput, cwd) {
  if (toolName === 'Write' || toolName === 'Edit') {
    const filePath = toolInput.file_path
    if (!filePath) return null
    const content = resolveNewContent(toolName, toolInput, filePath)
    if (content === null) return null
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

/** The single entry point a server-side caller (outer.bot's own agent
 *  loop) needs: given the rules already loaded for a project and one
 *  pending tool call, returns every violated gate (empty array if none).
 *  Pure function w.r.t. the ledger — callers decide what to do with a
 *  violation (pretooluse.js exits 2; a server-side caller can refuse the
 *  tool call and record it the same way, via drift-ledger.js). */
export function checkGates(gates, toolName, toolInput, cwd) {
  const pending = resolvePendingChange(toolName, toolInput, cwd)
  if (pending === null) return { pending: null, violations: [] }
  const candidates = matchingGates(gates, pending.relPath)
  const violations = []
  for (const gate of candidates) {
    const result = evaluateGate(gate, cwd, pending.relPath, pending.content)
    if (!result.pass) violations.push({ gate, detail: result.detail })
  }
  return { pending, violations }
}
