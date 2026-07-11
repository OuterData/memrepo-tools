// P9.4 — shared by the Stop-gate runner and the (proxy-side) verifier:
// writes an entry to the project's drift-ledger.md when something
// couldn't be auto-corrected within max_passes. The SLO this exists for:
// "zero unflagged drift" — every violation is blocked, corrected, or
// escalated here; nothing passes silently.

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

/** Commits and pushes the drift-ledger change — best-effort, matching
 *  the other hook scripts' "never block the user's session over a failed
 *  push" convention. */
export function commitDriftLedger(memrepoPath, projectSlug) {
  try {
    execFileSync('git', ['-C', memrepoPath, 'add', `projects/${projectSlug}/drift-ledger.md`], { stdio: 'pipe' })
    execFileSync('git', ['-C', memrepoPath, '-c', 'user.email=memrepo@outer.bot', '-c', 'user.name=outer.bot memrepo (drift)',
      'commit', '-q', '-m', 'outer.bot: drift escalation'], { stdio: 'pipe' })
    execFileSync('git', ['-C', memrepoPath, 'push', '-q', 'origin', 'HEAD'], { stdio: 'pipe' })
    return true
  } catch {
    return false // best-effort — caller shouldn't fail over this
  }
}
