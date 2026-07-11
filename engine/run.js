#!/usr/bin/env node
// memrepo-engine — the portable extraction/folding/lifecycle runner.
//
// PLACEHOLDER for the core loop (P9.2 scope): this CLI's job in P9.2 was
// to prove the scheduling plumbing works identically whether invoked from
// GitHub Actions, GitLab CI, or a bare cron job — same engine everywhere,
// CI is just a scheduler. The actual extraction/folding logic (reading
// /inbox/, producing briefing/rules.yaml/skills updates) is P9.4's scope
// and lands here later.
//
// P9.3b addition: the two interop importers ARE real, working code (not
// placeholders) — when MEMREPO_SOURCE_REPO points at the user's actual
// code repo, both run for real and anything they find gets written to
// the memrepo's inbox/ as capture files, for a future engine run's
// folding logic to process. This is genuinely one-way and additive:
// neither importer writes back to the source repo or the tools that
// produced that data.
//
// Usage: node run.js <path-to-memrepo-clone>
// Env:   MEMREPO_SOURCE_REPO=<path-to-user-code-repo>  (optional)

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { importEntireCheckpoints } from './importers/entire-checkpoints.js'
import { importMemoryMd } from './importers/memory-md.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function runImporters(memrepoPath, sourceRepoPath) {
  if (!sourceRepoPath) return 0

  const results = [
    ...importEntireCheckpoints(sourceRepoPath).entries,
    ...importMemoryMd(sourceRepoPath).entries,
  ]
  if (results.length === 0) return 0

  const inboxDir = path.join(memrepoPath, 'inbox')
  fs.mkdirSync(inboxDir, { recursive: true })
  const timestamp = process.env.MEMREPO_ENGINE_FIXED_TIMESTAMP || new Date().toISOString()
  const filename = `${timestamp.replace(/[:.]/g, '-')}-interop-import.json`
  fs.writeFileSync(path.join(inboxDir, filename), JSON.stringify({ captured_at: timestamp, kind: 'interop-import', entries: results }, null, 2))
  return results.length
}

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

  const importedCount = runImporters(repoPath, process.env.MEMREPO_SOURCE_REPO)
  if (importedCount > 0) {
    console.log(`[memrepo-engine] Interop importers found ${importedCount} entr${importedCount === 1 ? 'y' : 'ies'}, staged to inbox/`)
  }

  const runLogPath = path.join(repoPath, '.memrepo-engine-runs.log')
  const timestamp = process.env.MEMREPO_ENGINE_FIXED_TIMESTAMP || new Date().toISOString()
  fs.appendFileSync(runLogPath, `${timestamp} engine run (folding logic: placeholder; interop importers: real, ${importedCount} entries this run)\n`)

  console.log(`[memrepo-engine] Ran against ${repoPath} at ${timestamp}`)
}

main()
