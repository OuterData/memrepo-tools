# GitHub Copilot — memrepo hooks recipe

**Nothing to install beyond cloning this repo once.**

## Setup

Copy [`sessionStart.json.example`](./sessionStart.json.example) to `.github/hooks/memrepo.json` (repo-level) or `~/.copilot/hooks/memrepo.json` (personal, CLI only). Adjust `MEMREPO_TOOLS`/`MEMREPO_PATH` if you didn't use the defaults.

## Important caveat — please verify and report back

`docs/TOOL_COVERAGE.md` (P9.0) confirmed `sessionStart` and `sessionEnd` exist and run a script, but GitHub's own docs describe `sessionStart`/`userPromptSubmitted` primarily as **audit-logging** hooks — unlike Claude Code, where "print to stdout" is a documented, confirmed context-injection contract, Copilot's docs don't clearly confirm that a `sessionStart` script's stdout becomes model context the same way. This recipe is written to the same pattern as the others on the reasonable assumption it works the same way, but **this is the least-confirmed recipe in this repo** — if briefing content doesn't actually show up in Copilot's context after setup, that's the likely reason. Copilot's `preToolUse` hook *is* confirmed to support real blocking, which P9.4's gate runner can use regardless of whether this delivery recipe pans out.
