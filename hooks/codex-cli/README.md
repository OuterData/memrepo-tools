# Codex CLI — memrepo hooks recipe

**Nothing to install beyond cloning this repo once.**

## Setup

1. Copy [`hooks.json.example`](./hooks.json.example) to `~/.codex/hooks.json` (user) or `<repo>/.codex/hooks.json` (project). Adjust `MEMREPO_TOOLS`/`MEMREPO_PATH` if you didn't use the defaults. (You can also inline these as a `[hooks]` table in `config.toml` instead — same event names, TOML syntax.)
2. Codex requires reviewing and trusting new/changed hooks before they run non-managed commands — run `/hooks` inside Codex once after adding this config and approve it.

## What each hook does

- **SessionStart** — pulls your memrepo, injects the current project's briefing + skills.
- **UserPromptSubmit** — same injection, per-prompt.
- **Stop** — writes a session-note capture to `inbox/`, commits, pushes (best-effort).

Codex also supports `PreToolUse` with real blocking (`exit 2` or `permissionDecision: "deny"`) — useful later for the Adherence Engine's gate runner (P9.4), not used by this delivery-only recipe.
