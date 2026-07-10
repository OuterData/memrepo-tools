# Cline — memrepo hooks recipe

**Nothing to install beyond cloning this repo once, plus the Cline extension/CLI itself** (unlike a pure config-only tool, Cline is the thing you're configuring — this recipe doesn't add a second install).

## Setup

Copy [`settings.json.example`](./settings.json.example) to `.cline/settings.json` (this project) or `~/.cline/settings.json` (global). Adjust `MEMREPO_TOOLS`/`MEMREPO_PATH` if you didn't use the defaults.

## Why this looks identical to the Claude Code recipe

Cline's own hooks PR (`cline/cline#6440`) explicitly ships "100% compatibility with Claude's hook protocol" — same event names, same JSON contract. This recipe is the Claude Code one with the config path changed; if Claude Code's recipe is working for you, this one should too with no surprises.

## What each hook does

Same as the Claude Code recipe — SessionStart/UserPromptSubmit inject briefing+skills, SessionEnd captures a session note to `inbox/` and pushes (best-effort).
