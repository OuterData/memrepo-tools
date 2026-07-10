#!/usr/bin/env node
// memrepo-engine — the portable extraction/folding/lifecycle runner.
//
// PLACEHOLDER (P9.2 scope): this CLI's job in P9.2 is to prove the
// scheduling plumbing works identically whether invoked from GitHub
// Actions, GitLab CI, or a bare cron job — same engine everywhere, CI is
// just a scheduler. The actual extraction/folding logic (reading
// /inbox/, producing briefing/rules.yaml/skills updates) is P9.3/P9.4's
// scope and lands here later. Right now this does the minimum real work
// that's still deterministic and commit-worthy: validate the memrepo and
// record a run timestamp, so "produces identical commits across
// invocation methods" is genuinely testable now rather than faked.
//
// Usage: node run.js <path-to-memrepo-clone>

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function main() {
  const repoPath = process.argv[2]
  if (!repoPath) {
    console.error('Usage: memrepo-engine <path-to-memrepo-clone>')
    process.exit(1)
  }

  const validateScript = path.join(__dirname, '..', 'validate', 'cli.js')
  try {
    execFileSync('node', [validateScript, repoPath], { stdio: 'inherit' })
  } catch {
    console.error('[memrepo-engine] Refusing to run against an invalid memrepo — fix the errors above first.')
    process.exit(1)
  }

  const runLogPath = path.join(repoPath, '.memrepo-engine-runs.log')
  const timestamp = process.env.MEMREPO_ENGINE_FIXED_TIMESTAMP || new Date().toISOString()
  fs.appendFileSync(runLogPath, `${timestamp} engine run (placeholder — no folding logic yet)\n`)

  console.log(`[memrepo-engine] Ran against ${repoPath} at ${timestamp}`)
}

main()
