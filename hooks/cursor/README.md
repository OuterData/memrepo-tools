# Cursor — memrepo hooks recipe

**Nothing to install beyond cloning this repo once.**

## Setup

Copy [`hooks.json.example`](./hooks.json.example) to `.cursor/hooks.json` (this project) or `~/.cursor/hooks.json` (all projects). Adjust `MEMREPO_TOOLS`/`MEMREPO_PATH` if you didn't use the defaults.

## What each hook does

- **sessionStart** — pulls your memrepo, injects the current project's briefing + skills.
- **beforeSubmitPrompt** — same injection, per-prompt.
- **preToolUse** — runs `gates/pretooluse.js`: blocks a violating write/edit before it lands, a no-op with no `rules.yaml`/gate rules.
- **stop** — writes a session-note capture to `inbox/`, commits, pushes (best-effort — never blocks your session).

Delivers **inject + capture + gate (PreToolUse only)** — not the full ladder. See "Gate coverage is partial" below for why `gates/stop.js` isn't wired to `stop` here, and the verification caveats after that before relying on inject in production.

## Gate coverage here is partial by design — read this before relying on it

`docs/TOOL_COVERAGE.md` lists Cursor's session-end-equivalent event (`sessionEnd`, which this recipe's existing `stop` hook maps to) as **not supporting blocking**. `gates/stop.js`'s whole design depends on its `exit 2` actually refusing completion — without that, a first failing check would exit 2 into the void, and because escalation to `drift-ledger.md` only happens once `MEMREPO_GATE_MAX_PASSES` attempts are exhausted, a violation caught only at stop-time would never reach that threshold and would disappear with no record at all. That's worse than not running it, so it's deliberately left out. `preToolUse` alone (confirmed real, blocking) is this recipe's actual enforcement — same shape and same reasoning as the GitHub Copilot recipe's caveat.

## Known limitations — please verify and report back

`docs/TOOL_COVERAGE.md` (P9.0) confirmed Cursor's `sessionStart`/`beforeSubmitPrompt`/`preToolUse` event names and blocking behavior (`permission: "deny"`) against official docs, and confirmed `preToolUse` itself is real and blocking. What it did **not** independently verify:

- The *exact* JSON/stdout contract Cursor expects back from a `sessionStart` hook for context injection specifically — Claude Code's "print text to stdout, it becomes context" contract was confirmed directly; Cursor's docs describe the use case but this recipe hasn't been run against a live Cursor session yet. If it doesn't inject as expected, check whether Cursor wants structured JSON (e.g. `{"context": "..."}`) rather than raw stdout.
- The *exact* field names Cursor's `preToolUse` payload uses for the pending file path and content — `gates/pretooluse.js` was written and tested against Claude Code's `tool_input.file_path`/`content`/`file_text`/`old_string`/`new_string` shape. If Cursor's payload uses different field names, the gate script will see `null` where it expects the pending content and fail open (allow, per its own "couldn't determine the pending content — don't block on a guess" rule) rather than actually gate anything. **This means an unverified mismatch here fails open, not closed — silently no protection, not a false block.** If you run this for real, please confirm which way it goes and open an issue/PR either way.

Neither of these has been run against a live Cursor session as of this writing. Only the Claude Code recipe (`../claude-code/`) has been end-to-end live-verified.

## Cloud agents

Cursor's cloud agents run a reduced hook set that does **not** include `sessionStart`/`sessionEnd` (confirmed in `docs/TOOL_COVERAGE.md`). This recipe is for local/IDE Cursor sessions; a cloud-agent equivalent isn't possible with the same hooks today.
