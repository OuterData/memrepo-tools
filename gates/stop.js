#!/usr/bin/env node
// P9.4 — the Stop-gate runner. Fires when Claude finishes responding
// (Claude Code's Stop event): runs every gate-tier check: command
// against the REAL current state of the repo (unlike PreToolUse, which
// simulates a pending change before it happens — by Stop time, whatever
// changed is already on disk for real). Refuses completion (exit 2,
// failing checks fed back as context) until everything passes or
// max_passes is reached, matching the spec's "converges by pass <=3."
//
// On non-convergence: writes a drift-ledger entry rather than silently
// letting the session end — "zero unflagged drift" per the SLO. Still
// allows completion at that point (can't block forever), but the
// violation is now on record, not swallowed.

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'
import { tmpdir } from 'node:os'
import yaml from 'js-yaml'
import { appendDriftEntry, commitDriftLedger } from './drift-ledger.js'

const MAX_PASSES = Number(process.env.MEMREPO_GATE_MAX_PASSES || 3)

function readStdin() {
  try { return readFileSync(0, 'utf8') } catch { return '' }
}

function slugify(input) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project'
}

function loadGateRules(memrepoPath, projectSlug) {
  const rulesPath = path.join(memrepoPath, 'projects', projectSlug, 'rules.yaml')
  if (!existsSync(rulesPath)) return []
  try {
    const doc = yaml.load(readFileSync(rulesPath, 'utf8'))
    return Array.isArray(doc) ? doc.filter(r => r && r.tier === 'gate' && r.check) : []
  } catch {
    return []
  }
}

function runCheck(rule, cwd) {
  try {
    execSync(rule.check, { cwd, stdio: 'pipe', shell: 'bash' }) // see pretooluse.js's note — POSIX shell required
    return { pass: true }
  } catch (e) {
    // A "! grep ..." style check's actual diagnostic content is on
    // stdout (grep's own match output) — the failure itself is just an
    // inverted exit code, so stderr alone is often empty. Prefer
    // whichever stream has content, falling back to the error message.
    const stdout = e.stdout ? e.stdout.toString().trim() : ''
    const stderr = e.stderr ? e.stderr.toString().trim() : ''
    const detail = stderr || stdout || e.message
    return { pass: false, detail }
  }
}

// Per-session attempt counter — Stop can fire multiple times as Claude
// retries after a block; state needs to persist across those separate
// process invocations, hence a file rather than an in-memory counter.
function statePath(sessionId) {
  const dir = path.join(tmpdir(), 'memrepo-gate-state')
  mkdirSync(dir, { recursive: true })
  return path.join(dir, `${sessionId}.json`)
}

function getAttempts(sessionId) {
  const p = statePath(sessionId)
  if (!existsSync(p)) return 0
  try { return JSON.parse(readFileSync(p, 'utf8')).attempts || 0 } catch { return 0 }
}

function incrementAttempts(sessionId) {
  const n = getAttempts(sessionId) + 1
  writeFileSync(statePath(sessionId), JSON.stringify({ attempts: n }))
  return n
}

function resetAttempts(sessionId) {
  writeFileSync(statePath(sessionId), JSON.stringify({ attempts: 0 }))
}

function main() {
  const raw = readStdin()
  if (!raw) process.exit(0)

  let payload
  try { payload = JSON.parse(raw) } catch { process.exit(0) }

  const sessionId = payload.session_id || 'unknown-session'
  const cwd = payload.cwd || process.cwd()
  const memrepoPath = process.env.MEMREPO_PATH || path.join(process.env.HOME || '', '.outerbot', 'memrepo')
  if (!existsSync(memrepoPath)) process.exit(0)

  const projectSlug = process.env.PROJECT_SLUG || slugify(path.basename(cwd))
  const gates = loadGateRules(memrepoPath, projectSlug)
  if (gates.length === 0) { resetAttempts(sessionId); process.exit(0) }

  const failures = gates.map(g => ({ rule: g, result: runCheck(g, cwd) })).filter(r => !r.result.pass)

  if (failures.length === 0) {
    resetAttempts(sessionId)
    process.exit(0)
  }

  const attempts = incrementAttempts(sessionId)

  if (attempts < MAX_PASSES) {
    const lines = failures.map(f => `- "${f.rule.id}": ${f.rule.rule}\n  Check failed: ${f.result.detail.trim().split('\n')[0]}`)
    process.stderr.write(`Gate check(s) failing (attempt ${attempts}/${MAX_PASSES}):\n${lines.join('\n')}\n`)
    process.exit(2)
  }

  // Non-convergence — escalate rather than loop forever or pass silently.
  for (const f of failures) {
    appendDriftEntry(memrepoPath, projectSlug, {
      timestamp: new Date().toISOString(),
      ruleId: f.rule.id,
      ruleText: f.rule.rule,
      tier: 'gate',
      evidence: f.result.detail.trim().split('\n')[0],
      attempts,
    })
  }
  commitDriftLedger(memrepoPath, projectSlug)
  resetAttempts(sessionId)
  process.stderr.write(`Gate check(s) still failing after ${MAX_PASSES} attempts — escalated to drift-ledger.md, allowing completion.\n`)
  process.exit(0)
}

main()
