// P9.4 — tiny shared per-session scratch state, used by pretooluse.js and
// stop.js. Both are separate process invocations (Claude Code spawns a
// fresh process per hook event), so anything that needs to survive across
// them within one session goes here rather than in-memory. This is
// intentionally NOT committed to the memrepo — it's local, ephemeral
// bookkeeping (attempt counts, blocked-tool-call counts within the
// current turn); only stop.js's own commit of drift-ledger.md /
// adherence-stats.json is durable.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'

function statePath(sessionId) {
  const dir = path.join(tmpdir(), 'memrepo-gate-state')
  mkdirSync(dir, { recursive: true })
  return path.join(dir, `${sessionId}.json`)
}

function readState(sessionId) {
  const p = statePath(sessionId)
  if (!existsSync(p)) return { attempts: 0, blocked: 0 }
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8'))
    return { attempts: parsed.attempts || 0, blocked: parsed.blocked || 0 }
  } catch {
    return { attempts: 0, blocked: 0 }
  }
}

function writeState(sessionId, state) {
  writeFileSync(statePath(sessionId), JSON.stringify(state))
}

export function getAttempts(sessionId) { return readState(sessionId).attempts }

export function incrementAttempts(sessionId) {
  const state = readState(sessionId)
  state.attempts += 1
  writeState(sessionId, state)
  return state.attempts
}

/** Called by pretooluse.js every time it blocks a tool call (exit 2). */
export function incrementBlocked(sessionId) {
  const state = readState(sessionId)
  state.blocked += 1
  writeState(sessionId, state)
  return state.blocked
}

/** Reads and zeroes the blocked count — stop.js calls this once per turn
 *  to fold the count into the adherence-stats.json commit, then the
 *  counter starts fresh for the next turn. */
export function takeBlocked(sessionId) {
  const state = readState(sessionId)
  writeState(sessionId, { ...state, blocked: 0 })
  return state.blocked
}

export function resetAttempts(sessionId) {
  const state = readState(sessionId)
  writeState(sessionId, { ...state, attempts: 0 })
}
