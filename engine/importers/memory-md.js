#!/usr/bin/env node
// P9.3b — one-way import from the common MEMORY.md convention (a plain
// markdown file some tools/workflows use as a simple persistent-memory
// mirror) into memrepo briefing sources. Much simpler than the Entire
// importer: MEMORY.md is just a markdown file, not an undocumented binary
// format, so there's no schema uncertainty here — checks a short list of
// conventional locations and reads whichever exists.
//
// Usage: node memory-md.js <path-to-user-code-repo>
// Output: JSON { available, entries: [{ source, file, content }] } on stdout

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const CANDIDATE_PATHS = [
  'MEMORY.md',
  '.agentmemory/MEMORY.md',
  '.memory/MEMORY.md',
]

export function importMemoryMd(repoPath) {
  const entries = []

  for (const candidate of CANDIDATE_PATHS) {
    const fullPath = path.join(repoPath, candidate)
    if (!existsSync(fullPath)) continue

    const content = readFileSync(fullPath, 'utf8')
    entries.push({ source: 'memory-md', file: candidate, content })
  }

  return { available: entries.length > 0, entries }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repoPath = process.argv[2]
  if (!repoPath) {
    console.error('Usage: memory-md.js <path-to-user-code-repo>')
    process.exit(1)
  }
  console.log(JSON.stringify(importMemoryMd(repoPath), null, 2))
}
