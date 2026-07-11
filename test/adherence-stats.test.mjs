// Real end-to-end drive of pretooluse.js + stop.js as actual child
// processes against a real git repo (bare remote + local memrepo clone),
// proving the new adherence-stats.json counters land correctly for:
// (1) a PreToolUse block folded into a Stop-time still-failing attempt,
// (2) eventual convergence (passes+1),
// (3) forced non-convergence (drifts+1, drift-ledger.md entry).
// Not a unit test file (this repo has no test framework wired up yet) —
// a disposable driver script, run once, output inspected by hand, same
// pattern used earlier this session to find the Windows execSync bug.

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

function run(script, payload, env) {
  const res = spawnSync('node', [script], {
    input: JSON.stringify(payload),
    env: { ...process.env, ...env },
  })
  return { code: res.status, stdout: res.stdout?.toString() || '', stderr: res.stderr?.toString() || '' }
}

function assert(cond, label) {
  if (!cond) { console.error(`FAIL: ${label}`); process.exitCode = 1 } else { console.log(`ok: ${label}`) }
}

const work = mkdtempSync(path.join(tmpdir(), 'memrepo-stats-test-'))
const bareRepo = path.join(work, 'remote.git')
const memrepoClone = path.join(work, 'memrepo')
const projectDir = path.join(work, 'kds-app')

execFileSync('git', ['init', '-q', '--bare', bareRepo])

// Seed the memrepo with a single gate matching src/display/**
mkdirSync(memrepoClone, { recursive: true })
execFileSync('git', ['init', '-q', '-b', 'master', memrepoClone])
execFileSync('git', ['-C', memrepoClone, 'config', 'user.email', 't@t.com'])
execFileSync('git', ['-C', memrepoClone, 'config', 'user.name', 't'])
mkdirSync(path.join(memrepoClone, 'projects', 'kds-app'), { recursive: true })
writeFileSync(path.join(memrepoClone, 'projects', 'kds-app', 'rules.yaml'),
  `- id: no-websocket-push\n  rule: "Order updates via polling, not WebSocket."\n  tier: gate\n  check: "! grep -rn 'new WebSocket' src/display/"\n  scope: ["src/display/**"]\n  origin: briefing#v1\n  on_fail: block\n`)
execFileSync('git', ['-C', memrepoClone, 'add', '-A'])
execFileSync('git', ['-C', memrepoClone, 'commit', '-q', '-m', 'seed'])
execFileSync('git', ['-C', memrepoClone, 'remote', 'add', 'origin', bareRepo])
execFileSync('git', ['-C', memrepoClone, 'push', '-q', 'origin', 'master'])

// The "user's project" the gates evaluate against.
mkdirSync(path.join(projectDir, 'src', 'display'), { recursive: true })
const displayFile = path.join(projectDir, 'src', 'display', 'order.js')
writeFileSync(displayFile, '// polling order fetcher\n')

const env = { MEMREPO_PATH: memrepoClone, PROJECT_SLUG: 'kds-app', MEMREPO_GATE_MAX_PASSES: '3' }
const sessionId = 'test-session-1'
const pretooluse = path.join(process.cwd(), 'gates', 'pretooluse.js')
const stop = path.join(process.cwd(), 'gates', 'stop.js')

function statsFile() {
  const p = path.join(memrepoClone, 'projects', 'kds-app', 'adherence-stats.json')
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null
}

// --- Scenario A: PreToolUse blocks a violating write, Stop still fails,
// then the file is fixed and the turn converges. ---

const violatingWrite = { tool_name: 'Write', tool_input: { file_path: displayFile, content: "const ws = new WebSocket('wss://x')\n" }, cwd: projectDir, session_id: sessionId }
const r1 = run(pretooluse, violatingWrite, env)
assert(r1.code === 2, 'PreToolUse blocks the violating write (exit 2)')
assert(/Blocked by memrepo gate/.test(r1.stderr), 'PreToolUse stderr names the gate')

// The write never actually happened (PreToolUse blocked it) - file on disk
// still has the original, compliant content, so Stop's real-state check
// should currently PASS. To exercise "still failing" realistically, write
// the violation directly (simulating Claude ignoring the block once, or a
// second tool call outside Write/Edit) before calling stop.js.
writeFileSync(displayFile, "const ws = new WebSocket('wss://x')\n")

const stopPayload = { cwd: projectDir, session_id: sessionId }
const r2 = run(stop, stopPayload, env)
assert(r2.code === 2, 'Stop refuses completion while the check still fails (exit 2)')

let stats = statsFile()
assert(stats !== null, 'adherence-stats.json exists after first Stop failure')
assert(stats.blocks === 2, `blocks folded PreToolUse(1) + Stop-failure(1) = 2 (got ${stats?.blocks})`)
assert(stats.passes === 0, `passes still 0 (got ${stats?.passes})`)

// Now fix it for real and let Stop converge.
writeFileSync(displayFile, '// polling order fetcher, fixed\n')
const r3 = run(stop, stopPayload, env)
assert(r3.code === 0, 'Stop allows completion once the check passes (exit 0)')

stats = statsFile()
assert(stats.passes === 1, `passes incremented to 1 on convergence (got ${stats?.passes})`)
assert(stats.blocks === 2, `blocks unchanged on a clean pass (got ${stats?.blocks})`)
assert(stats.drifts === 0, `drifts still 0 (got ${stats?.drifts})`)

// Critical: verify the PUSH actually landed on the remote at this point,
// before drift-ledger.md has ever been created by anything. This exact
// spot caught a real bug: commitDriftLedger() unconditionally `git add`ed
// drift-ledger.md even when it didn't exist yet, which makes `git add`
// fail *entirely* (not just skip that path) and silently drop the push -
// stats would locally look right but never reach the remote until the
// first real drift happened to create the missing file. A check placed
// only after scenario B (which does escalate) would never have caught
// this, since the eventual escalation papers over every earlier failure.
const earlyCheckClone = path.join(work, 'check-early')
execFileSync('git', ['clone', '-q', bareRepo, earlyCheckClone])
const earlyStatsPath = path.join(earlyCheckClone, 'projects', 'kds-app', 'adherence-stats.json')
assert(existsSync(earlyStatsPath), 'adherence-stats.json reached the remote before any drift-ledger.md ever existed')
if (existsSync(earlyStatsPath)) {
  const earlyRemoteStats = JSON.parse(readFileSync(earlyStatsPath, 'utf8'))
  assert(earlyRemoteStats.passes === 1 && earlyRemoteStats.blocks === 2, `remote stats correct pre-drift (got ${JSON.stringify(earlyRemoteStats)})`)
}
rmSync(earlyCheckClone, { recursive: true, force: true })

// --- Scenario B: forced non-convergence escalates to drift-ledger.md and
// bumps drifts. Fresh session so attempt counters start clean. ---

const sessionId2 = 'test-session-2'
const stopPayload2 = { cwd: projectDir, session_id: sessionId2 }
writeFileSync(displayFile, "const ws = new WebSocket('wss://x')\n") // persistently violating

let last
for (let i = 1; i <= 3; i++) {
  last = run(stop, stopPayload2, env)
}
assert(last.code === 0, 'Stop allows completion after max_passes reached, even though non-convergent (exit 0)')
assert(/escalated to drift-ledger/.test(last.stderr), 'Stop stderr reports escalation on the final attempt')

stats = statsFile()
assert(stats.drifts === 1, `drifts incremented to 1 on escalation (got ${stats?.drifts})`)

const ledgerPath = path.join(memrepoClone, 'projects', 'kds-app', 'drift-ledger.md')
assert(existsSync(ledgerPath), 'drift-ledger.md was created')
const ledger = readFileSync(ledgerPath, 'utf8')
assert(ledger.includes('no-websocket-push'), 'drift-ledger.md names the violated rule')

// --- Verify everything committed to the bare remote, not just local disk. ---
const checkClone = path.join(work, 'check')
execFileSync('git', ['clone', '-q', bareRepo, checkClone])
const remoteStats = JSON.parse(readFileSync(path.join(checkClone, 'projects', 'kds-app', 'adherence-stats.json'), 'utf8'))
// blocks = 2 from scenario A (1 PreToolUse + 1 Stop-failure) + 2 from
// scenario B's two non-final failing Stop attempts (i=1, i=2) — the third
// (final, non-converging) attempt escalates to drifts instead of blocks.
assert(remoteStats.passes === 1 && remoteStats.blocks === 4 && remoteStats.drifts === 1, `remote adherence-stats.json matches local (got ${JSON.stringify(remoteStats)})`)
assert(existsSync(path.join(checkClone, 'projects', 'kds-app', 'drift-ledger.md')), 'drift-ledger.md pushed to remote')

rmSync(work, { recursive: true, force: true })
console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED')
