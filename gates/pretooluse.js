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
// Those tools don't have "pending file content" to check a rule against
// — the thing a rule needs to see is the COMMAND ITSELF (Bash) or the
// PATH BEING READ (Read), not any file's contents, evaluated before the
// tool runs, never by inspecting output after the fact. No new
// rules.yaml schema: the pending command text or read path is treated as
// the content of a reserved virtual file
// (.claude-hooks/pending-bash-command.txt /
// .claude-hooks/pending-read-path.txt), scoped exactly like any other
// file-scoped gate.
//
// Stage 3 item 4 — the actual gate-matching/evaluation logic (scope
// matching, scratch-copy simulation, check: command execution) now lives
// in evaluate.js, so outer.bot's own server-side agent loop
// (api/src/tool-executor.ts) can reuse the identical logic instead of
// reimplementing it. This file is now a thin CLI wrapper: Claude Code's
// specific stdin/hook envelope and exit-code contract, nothing else.

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { loadGateRules, checkGates, BASH_COMMAND_VIRTUAL_PATH, READ_PATH_VIRTUAL_PATH } from './evaluate.js'
import { incrementBlocked } from './session-state.js'
import { appendDriftEntry, bumpAdherenceStats, commitDriftLedger } from './drift-ledger.js'

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

  const { pending, violations } = checkGates(gates, toolName, toolInput, cwd)
  if (pending === null) process.exit(0) // not a tool type this runner evaluates, or couldn't resolve what's pending
  if (violations.length === 0) process.exit(0)

  const { gate, detail } = violations[0]
  incrementBlocked(sessionId)
  process.stderr.write(`Blocked by memrepo gate "${gate.id}": ${gate.rule}\n`)
  if (detail) process.stderr.write(`Check failed: ${detail}\n`)

  // Bash/Read command-pattern gates have no persistent artifact for
  // stop.js's real-state re-check to find later (a blocked command ran
  // nowhere, unlike a blocked Write/Edit, which leaves a real file for
  // Stop to re-examine on retry) — recorded immediately, synchronously,
  // right here — best-effort, never let a ledger-write failure change
  // whether the tool call itself gets blocked.
  const isVirtualPathGate = pending.relPath === BASH_COMMAND_VIRTUAL_PATH || pending.relPath === READ_PATH_VIRTUAL_PATH
  if (isVirtualPathGate) {
    try {
      appendDriftEntry(memrepoPath, projectSlug, {
        timestamp: new Date().toISOString(),
        ruleId: gate.id,
        ruleText: gate.rule,
        tier: 'gate',
        evidence: `Blocked before execution — pending ${toolName} content: ${pending.content.slice(0, 200)}`,
        attempts: 1,
      })
      bumpAdherenceStats(memrepoPath, projectSlug, { blocks: 1 })
      commitDriftLedger(memrepoPath, projectSlug)
    } catch {
      // best-effort — never let a ledger write failure change the block outcome
    }
  }

  process.exit(2)
}

main()
