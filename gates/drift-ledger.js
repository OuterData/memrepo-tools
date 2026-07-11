// P9.4 — shared by the Stop-gate runner and the (proxy-side) verifier:
// writes an entry to the project's drift-ledger.md when something
// couldn't be auto-corrected within max_passes. The SLO this exists for:
// "zero unflagged drift" — every violation is blocked, corrected, or
// escalated here; nothing passes silently.
//
// Also owns adherence-stats.json — the counters behind the Workspace
// dashboard tile ("passes verified, drifts caught, gates blocked"). This
// file didn't exist until the tile needed real numbers: drift-ledger.md
// only ever recorded non-convergent escalations, so "passes verified" and
// "gates blocked" (which normally converge and are otherwise discarded)
// had no durable record anywhere. Counters are bumped in-memory during a
// turn and committed once per Stop-hook invocation — not per gate check —
// so a chatty session with several PreToolUse blocks doesn't turn into a
// commit per block.

import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const LEDGER_HEADER = `# Drift Ledger

> STATUS: active

Every gate violation and assertion drift for this project that reached
max_passes without converging. Nothing in this file was silently allowed
through — each entry here is something a human should look at.
`

export function appendDriftEntry(memrepoPath, projectSlug, entry) {
  const projectDir = path.join(memrepoPath, 'projects', projectSlug)
  mkdirSync(projectDir, { recursive: true })
  const ledgerPath = path.join(projectDir, 'drift-ledger.md')

  if (!existsSync(ledgerPath)) {
    writeFileSync(ledgerPath, LEDGER_HEADER)
  }

  const block = [
    '',
    `## ${entry.timestamp}`,
    '',
    `- **Rule:** ${entry.ruleId} — ${entry.ruleText}`,
    `- **Tier:** ${entry.tier}`,
    `- **Evidence:** ${entry.evidence}`,
    `- **Attempts:** ${entry.attempts}`,
    `- **Outcome:** not auto-corrected within max_passes — needs human review`,
    '',
  ].join('\n')

  appendFileSync(ledgerPath, block)
  return ledgerPath
}

/** Adds to (never replaces) the project's adherence-stats.json counters.
 *  Any of passes/blocks/drifts may be omitted (defaults to 0 added). */
export function bumpAdherenceStats(memrepoPath, projectSlug, { passes = 0, blocks = 0, drifts = 0 } = {}) {
  const projectDir = path.join(memrepoPath, 'projects', projectSlug)
  mkdirSync(projectDir, { recursive: true })
  const statsPath = path.join(projectDir, 'adherence-stats.json')

  let current = { passes: 0, blocks: 0, drifts: 0 }
  if (existsSync(statsPath)) {
    try { current = { ...current, ...JSON.parse(readFileSync(statsPath, 'utf8')) } } catch { /* corrupt file — start fresh rather than block the session */ }
  }

  const next = {
    passes: current.passes + passes,
    blocks: current.blocks + blocks,
    drifts: current.drifts + drifts,
    updated: new Date().toISOString(),
  }
  writeFileSync(statsPath, JSON.stringify(next, null, 2) + '\n')
  return next
}

/** Commits and pushes whichever of drift-ledger.md / adherence-stats.json
 *  actually changed — best-effort, matching the other hook scripts'
 *  "never block the user's session over a failed push" convention. */
export function commitDriftLedger(memrepoPath, projectSlug) {
  try {
    const projectDir = path.join(memrepoPath, 'projects', projectSlug)
    const addPaths = [`projects/${projectSlug}/adherence-stats.json`]
    // drift-ledger.md is only created on an actual escalation - unconditionally
    // adding a pathspec that doesn't exist yet makes `git add` fail *entirely*
    // (exit 128, nothing staged, not just that one path), which silently
    // dropped every stats-only commit (a converged pass, a resolved block)
    // until the first real drift ever happened to create the file.
    if (existsSync(path.join(projectDir, 'drift-ledger.md'))) addPaths.push(`projects/${projectSlug}/drift-ledger.md`)
    execFileSync('git', ['-C', memrepoPath, 'add', ...addPaths], { stdio: 'pipe' })
    const status = execFileSync('git', ['-C', memrepoPath, 'status', '--porcelain'], { stdio: 'pipe' }).toString()
    if (!status.trim()) return true // nothing staged (e.g., stats bump was a no-op — shouldn't happen, but harmless)
    execFileSync('git', ['-C', memrepoPath, '-c', 'user.email=memrepo@outer.bot', '-c', 'user.name=outer.bot memrepo (drift)',
      'commit', '-q', '-m', 'outer.bot: adherence update'], { stdio: 'pipe' })
    execFileSync('git', ['-C', memrepoPath, 'push', '-q', 'origin', 'HEAD'], { stdio: 'pipe' })
    return true
  } catch {
    return false // best-effort — caller shouldn't fail over this
  }
}
