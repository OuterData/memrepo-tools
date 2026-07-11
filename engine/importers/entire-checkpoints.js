#!/usr/bin/env node
// P9.3b — one-way import from Entire's checkpoint branch into memrepo
// briefing sources. "Interop, not competition" per the brief: this reads
// whatever Entire already captured in a user's code repo and folds it in
// as reference material, never writes back to Entire's branch, never
// competes with Entire's own tooling.
//
// HONEST LIMITATION: Entire's on-disk checkpoint format (entire/
// checkpoints/v1 branch) is not publicly documented beyond the high-level
// concept ("transcripts, prompts, files touched, token usage, tool calls
// captured alongside every commit") - their README describes the concept,
// not a schema, and the parts of their Go source reachable without deeper
// repo access didn't reveal the serialization format either. Rather than
// fabricate a schema and silently produce wrong output, this importer is
// deliberately generic and defensive: it lists whatever text-readable
// files exist on the branch and extracts their raw content as unverified
// reference material, clearly labeled as such. If Entire publishes (or
// someone reverse-engineers) the real schema, this should be replaced
// with a proper structured parser - this is the honest interim.
//
// Usage: node entire-checkpoints.js <path-to-user-code-repo>
// Output: JSON array of { source: 'entire-checkpoint', file, content } on stdout

import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const CHECKPOINT_BRANCH = 'entire/checkpoints/v1'
const MAX_FILE_BYTES = 50_000 // don't ingest huge/binary files as "text"

function git(repoPath, args) {
  // stdio[2]='pipe' (not the default 'inherit') so a branch-doesn't-exist
  // probe's expected "fatal: Needed a single revision" doesn't print to
  // the user's terminal on every normal run without Entire installed —
  // that's the common case, not an error worth alarming anyone about.
  return execFileSync('git', ['-C', repoPath, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function branchExists(repoPath, branch) {
  try {
    git(repoPath, ['rev-parse', '--verify', `refs/heads/${branch}`])
    return true
  } catch {
    try {
      git(repoPath, ['rev-parse', '--verify', `refs/remotes/origin/${branch}`])
      return true
    } catch {
      return false
    }
  }
}

function listFiles(repoPath, branch) {
  const out = git(repoPath, ['ls-tree', '-r', '--name-only', branch])
  return out.split('\n').map(l => l.trim()).filter(Boolean)
}

function looksLikeText(buf) {
  // Cheap binary-detection: a NUL byte in the first 8KB is a strong signal
  // this isn't text worth ingesting as "reference material."
  const slice = buf.subarray(0, 8192)
  return !slice.includes(0)
}

export function importEntireCheckpoints(repoPath) {
  if (!branchExists(repoPath, CHECKPOINT_BRANCH)) {
    return { available: false, entries: [] }
  }

  const branchRef = (() => {
    try { git(repoPath, ['rev-parse', '--verify', `refs/heads/${CHECKPOINT_BRANCH}`]); return CHECKPOINT_BRANCH }
    catch { return `origin/${CHECKPOINT_BRANCH}` }
  })()

  const files = listFiles(repoPath, branchRef)
  const entries = []

  for (const file of files) {
    let content
    try {
      content = execFileSync('git', ['-C', repoPath, 'show', `${branchRef}:${file}`], { maxBuffer: MAX_FILE_BYTES * 2 })
    } catch {
      continue // unreadable — skip, don't fail the whole import over one file
    }
    if (content.length > MAX_FILE_BYTES) continue
    if (!looksLikeText(content)) continue

    entries.push({
      source: 'entire-checkpoint',
      file,
      content: content.toString('utf8'),
      note: 'Unverified format — Entire\'s on-disk checkpoint schema is not publicly documented; this is raw file content, not structured extraction.',
    })
  }

  return { available: true, entries }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const repoPath = process.argv[2]
  if (!repoPath) {
    console.error('Usage: entire-checkpoints.js <path-to-user-code-repo>')
    process.exit(1)
  }
  const result = importEntireCheckpoints(repoPath)
  console.log(JSON.stringify(result, null, 2))
}
