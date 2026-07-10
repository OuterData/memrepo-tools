# Claude Code — memrepo hooks recipe

**Nothing to install beyond cloning this repo once.** Verified against Claude Code's hooks reference as of `docs/TOOL_COVERAGE.md`'s last check.

## Setup

1. Clone `memrepo-tools` somewhere stable, e.g. `~/.outerbot/memrepo-tools`.
2. Make sure your memrepo is cloned at `~/.outerbot/memrepo` (or set `MEMREPO_PATH` in the commands below to wherever you cloned it).
3. Copy the relevant block(s) from [`settings.json.example`](./settings.json.example) into `~/.claude/settings.json` (all projects) or `.claude/settings.json` (this project only). Adjust the `MEMREPO_TOOLS`/`MEMREPO_PATH` paths if you didn't use the defaults above.

## What each hook does

- **SessionStart** (`startup`, `resume`, `compact` matcher) — pulls your memrepo, reads the current project's `briefing.md` and any relevant skills, prints them as context. Fires once per session/resume, and again after a compaction — matching P2.2's briefing-survives-compaction behavior on the proxy side.
- **UserPromptSubmit** — same injection, per the brief's spec. Note: unlike proxy mode, this hooks setup doesn't currently pin content across a session the way the proxy does (see the design note in the P9.3 commit) — a memrepo change mid-session can appear on a later turn here. Flagged for the planner, not silently resolved.
- **SessionEnd** — writes a session-note capture to `inbox/`, commits, pushes. Best-effort: a failed push here never blocks or errors your Claude Code session.

## Verify it's working

Start a session in a project with a memrepo briefing — the briefing content should be visible in Claude's context from turn 1. Check `$MEMREPO_PATH/inbox/` after ending the session; a new capture file should be there (and pushed, if your deploy key has write access).
