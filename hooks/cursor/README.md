# Cursor — memrepo hooks recipe

**Nothing to install beyond cloning this repo once.**

## Setup

Copy [`hooks.json.example`](./hooks.json.example) to `.cursor/hooks.json` (this project) or `~/.cursor/hooks.json` (all projects). Adjust `MEMREPO_TOOLS`/`MEMREPO_PATH` if you didn't use the defaults.

## What each hook does

- **sessionStart** — pulls your memrepo, injects the current project's briefing + skills.
- **beforeSubmitPrompt** — same injection, per-prompt.
- **stop** — writes a session-note capture to `inbox/`, commits, pushes (best-effort — never blocks your session).

## Known limitation — please verify and report back

`docs/TOOL_COVERAGE.md` (P9.0) confirmed Cursor's `sessionStart`/`beforeSubmitPrompt` event names, blocking behavior, and config location against official docs. What it did **not** independently verify is the *exact* JSON/stdout contract Cursor expects back from a `sessionStart` hook for context injection specifically — Claude Code's "print text to stdout, it becomes context" contract was confirmed directly; Cursor's docs describe the use case but this recipe hasn't been run against a live Cursor session yet. If it doesn't inject as expected, check whether Cursor wants structured JSON (e.g. `{"context": "..."}`) rather than raw stdout, and open an issue/PR here with the fix.

## Cloud agents

Cursor's cloud agents run a reduced hook set that does **not** include `sessionStart`/`sessionEnd` (confirmed in `docs/TOOL_COVERAGE.md`). This recipe is for local/IDE Cursor sessions; a cloud-agent equivalent isn't possible with the same hooks today.
