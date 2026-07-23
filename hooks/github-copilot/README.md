# GitHub Copilot — memrepo hooks recipe

**Nothing to install beyond cloning this repo once.**

## Setup

Copy [`sessionStart.json.example`](./sessionStart.json.example) to `.github/hooks/memrepo.json` (repo-level) or `~/.copilot/hooks/memrepo.json` (personal, CLI only). Adjust `MEMREPO_TOOLS`/`MEMREPO_PATH` if you didn't use the defaults.

## What each hook does

- **sessionStart** — pulls your memrepo, injects the current project's briefing + skills (see the injection-contract caveat below).
- **preToolUse** — runs `gates/pretooluse.js`: blocks a violating write/edit before it lands (`exit 2`/`permissionDecision: "deny"`), a no-op with no `rules.yaml`/gate rules.
- **sessionEnd** — writes a session-note capture to `inbox/`, commits, pushes (best-effort).

## Gate coverage here is partial by design — read this before relying on it

Copilot delivers **inject + capture + gate (PreToolUse only)** — not the full ladder. `preToolUse` is confirmed real and blocking (`docs/TOOL_COVERAGE.md`), so a violating write is genuinely stopped before it lands, same as Claude Code.

`gates/stop.js` (the retry-until-green convergence loop, escalating to `drift-ledger.md` on non-convergence) is **deliberately not wired here.** `docs/TOOL_COVERAGE.md` lists Copilot's turn/session-end events (`sessionEnd`, `agentStop`, `subagentStop`) as **not supporting blocking**. `stop.js` is written assuming its `exit 2` actually refuses completion — without that, a first failing check would exit 2 into the void (Copilot ignores it, the session just ends), and since escalation to `drift-ledger.md` only happens once `MEMREPO_GATE_MAX_PASSES` attempts are exhausted, a violation caught this way would never reach that threshold and would **disappear with no record at all** — worse than not running it, and a direct violation of "zero unflagged drift." So: this recipe relies on `preToolUse` alone for enforcement here, which is real and sufficient for the block itself; it just can't offer the same "model gets to see the failure and retry" loop, or a durable record of a stop-time violation, that Claude Code/Cline/Codex CLI's recipes do.

## Important caveat — please verify and report back

`docs/TOOL_COVERAGE.md` (P9.0) confirmed `sessionStart` and `sessionEnd` exist and run a script, but GitHub's own docs describe `sessionStart`/`userPromptSubmitted` primarily as **audit-logging** hooks — unlike Claude Code, where "print to stdout" is a documented, confirmed context-injection contract, Copilot's docs don't clearly confirm that a `sessionStart` script's stdout becomes model context the same way. This recipe is written to the same pattern as the others on the reasonable assumption it works the same way, but **this is the least-confirmed recipe in this repo** for injection — if briefing content doesn't actually show up in Copilot's context after setup, that's the likely reason.

`preToolUse`'s exact JSON field names for the pending file/content also aren't confirmed identical to Claude Code's (`gates/pretooluse.js` was written and tested against Claude Code's shape) — same fail-open caveat as the Cursor recipe: a field-name mismatch means the gate silently allows everything rather than blocking anything, not the other way around. Only the Claude Code recipe (`../claude-code/`) has been end-to-end live-verified; please open an issue/PR here with what you find running this for real.
