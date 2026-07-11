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
