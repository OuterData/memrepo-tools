# Codex CLI — memrepo hooks recipe

**Nothing to install beyond cloning this repo once.**

## Setup

1. Copy [`hooks.json.example`](./hooks.json.example) to `~/.codex/hooks.json` (user) or `<repo>/.codex/hooks.json` (project). Adjust `MEMREPO_TOOLS`/`MEMREPO_PATH` if you didn't use the defaults. (You can also inline these as a `[hooks]` table in `config.toml` instead — same event names, TOML syntax.)
2. Codex requires reviewing and trusting new/changed hooks before they run non-managed commands — run `/hooks` inside Codex once after adding this config and approve it.

## What each hook does

- **SessionStart** — pulls your memrepo, injects the current project's briefing + skills.
- **UserPromptSubmit** — same injection, per-prompt.
- **PreToolUse** — runs `gates/pretooluse.js`: blocks a write/edit that violates a `tier: gate` rule (`exit 2`) before it lands; a no-op if there's no `rules.yaml` or no gate-tier rules.
- **Stop** — two hooks fire here: `gates/stop.js` re-checks gate rules against the real applied state and refuses completion until green or `MEMREPO_GATE_MAX_PASSES` attempts, escalating to `drift-ledger.md` on non-convergence; then the existing session-note capture writes to `inbox/`, commits, pushes (best-effort).

Delivers all three capabilities: inject, capture, and gate. **Two distinct confidence levels here, be precise about which:** `PreToolUse` blocking is explicitly confirmed in `docs/TOOL_COVERAGE.md` (`exit 2` or `permissionDecision: "deny"`, identical to Claude Code's contract) — the pre-write half of gating should just work. `Stop`'s blocking behavior is **not** explicitly confirmed either way in the coverage doc (unlike Cursor's `sessionEnd`/Copilot's session-end events, which are explicitly documented as non-blocking) — it's wired here on the strength of Codex's hook event vocabulary closely mirroring Claude Code's throughout (same event names end to end), not a direct confirmation. If `Stop` turns out not to block for real, the same failure mode applies as the Cursor/Copilot caveats: a first failure would exit 2 into the void and never reach `drift-ledger.md`. Only the Claude Code recipe has been live-verified end to end (see `../claude-code/README.md`) — please open an issue/PR here with what you find running this for real, especially on the `Stop` question.
