# Adherence Engine gates (P9.4)

Open-source, hooks-mode implementations of the two gate runners the Adherence Engine needs. Proxy mode gets equivalent evaluations server-side where the proxy can see tool traffic — these are the client-side, hooks-mode versions.

## `pretooluse.js` — blocks a violating write before it happens

Reads a Claude Code `PreToolUse` hook payload from stdin, finds `tier: gate` rules in the current project's `rules.yaml` whose `scope` matches the file being written/edited, **simulates** the pending change in a scratch copy (never touches your real files), and runs the gate's `check:` command against that simulation. Exits `2` with the rule text if it fails — the real write never happens.

```bash
# In your hook config (see the memrepo-tools/hooks/ recipes):
MEMREPO_PATH="$HOME/.outerbot/memrepo" node "$MEMREPO_TOOLS/gates/pretooluse.js"
```

**Real, verified behavior** (not just written-to-spec): tested against the KDS example fixture's `no-websocket-push` gate — a `Write` introducing `new WebSocket(...)` into `src/display/` is blocked; the same write without that pattern is allowed; an `Edit` that introduces the pattern via `old_string`/`new_string` is also correctly blocked. Two real bugs were caught and fixed while proving this: a masked false-positive (a failed scratch-copy was silently treated as "the check failed," not a genuine violation), and `execSync`'s default shell being `cmd.exe` on Windows, which doesn't understand the bash `!` negation syntax `check:` commands use — every check would have "passed" by accident on Windows without this fix, or failed for the wrong reason.

## `stop.js` — refuses to finish while a check is red

Reads a `Stop` hook payload, runs **every** `tier: gate` check against the real, already-applied state of the repo (unlike `pretooluse.js`, nothing is simulated here — by Stop time the change already landed). Blocks completion (exit `2`, violations fed back as context) so the model can try to fix it, up to `MEMREPO_GATE_MAX_PASSES` (default `3`) attempts per session.

**On non-convergence:** rather than loop forever or silently let the session end with a known violation, it writes an entry to the project's `drift-ledger.md` (via [`drift-ledger.js`](./drift-ledger.js)), commits and pushes it (best-effort), and *then* allows completion — the SLO is "zero unflagged drift," not "zero drift." Every violation that reaches this runner is blocked, corrected, or on record — never silently passed.

Verified for real: a persistently-failing check blocks on attempts 1 and 2, escalates to `drift-ledger.md` on attempt 3 with the actual grep match as evidence, and a passing check never blocks or touches the ledger at all.

## `drift-ledger.js` — shared ledger + adherence-stats counters

Writes `drift-ledger.md` entries (above) and owns `adherence-stats.json` — the counters behind the Workspace dashboard tile ("passes verified, drifts caught, gates blocked"). Neither file existed as a durable record of *successful* passes or *converged* blocks before this — `drift-ledger.md` only ever recorded non-convergent escalations, so a clean pass or a block that got fixed on retry left no trace anywhere. `bumpAdherenceStats()` adds to three counters (`passes`, `blocks`, `drifts`) in `projects/{slug}/adherence-stats.json`, committed alongside `drift-ledger.md` in the same push.

`pretooluse.js` and `stop.js` are separate process invocations per hook event, so anything that needs to survive across them within one turn (attempt counts, blocked-tool-call counts) lives in [`session-state.js`](./session-state.js) — local scratch state under the OS tmp dir, never committed. `stop.js` folds that turn's blocked count into its own commit once per turn (not once per block), so a session with several PreToolUse blocks in a row doesn't turn into a commit per block.

Verified for real (`test/adherence-stats.test.mjs`, run against a real bare git remote + real child-process invocations of both gate scripts, not mocked): a PreToolUse block followed by a still-failing Stop attempt correctly folds into `blocks: 2`; fixing the file and re-running Stop converges to `passes: 1` without touching `blocks`; a persistently-failing check across 3 attempts lands `drifts: 1` and a `drift-ledger.md` entry; every number is confirmed present on the pushed remote, not just the local working copy. Run it yourself with `npm test`.
