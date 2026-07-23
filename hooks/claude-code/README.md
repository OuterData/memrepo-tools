# Claude Code — memrepo hooks recipe

**Nothing to install beyond cloning this repo once.** Verified against Claude Code's hooks reference as of `docs/TOOL_COVERAGE.md`'s last check. Delivers all three capabilities: inject, capture, and gate.

## Setup

1. Clone `memrepo-tools` somewhere stable, e.g. `~/.outerbot/memrepo-tools`.
2. Make sure your memrepo is cloned at `~/.outerbot/memrepo` (or set `MEMREPO_PATH` in the commands below to wherever you cloned it).
3. Copy the relevant block(s) from [`settings.json.example`](./settings.json.example) into `~/.claude/settings.json` (all projects) or `.claude/settings.json` (this project only). Adjust the `MEMREPO_TOOLS`/`MEMREPO_PATH` paths if you didn't use the defaults above.
4. If you want gate enforcement (the `PreToolUse`/`Stop` blocks below), add a `projects/{your-project-slug}/rules.yaml` to your memrepo with at least one `tier: gate` rule — see [`memrepo-spec`](https://github.com/OuterData/memrepo-spec)'s `SPEC.md` §3.2 for the schema. No rules.yaml, or no `gate`-tier entries in it, means these hooks are a no-op every time (both scripts exit 0 immediately when there's nothing to check) — you don't need to remove the hook entries if you're not using gates yet.

## What each hook does

- **SessionStart** (`startup`, `resume`, `compact` matcher) — pulls your memrepo, reads the current project's `briefing.md` and any relevant skills, prints them as context. Fires once per session/resume, and again after a compaction — matching P2.2's briefing-survives-compaction behavior on the proxy side.
- **UserPromptSubmit** — same injection, per the brief's spec. Note: unlike proxy mode, this hooks setup doesn't currently pin content across a session the way the proxy does (see the design note in the P9.3 commit) — a memrepo change mid-session can appear on a later turn here. Flagged for the planner, not silently resolved.
- **PreToolUse** (`Write|Edit` matcher) — runs [`gates/pretooluse.js`](../../gates/pretooluse.js): checks the pending write against `tier: gate` rules in `rules.yaml` scoped to that file, in a scratch copy, before the real write happens. Blocks (exit 2, rule text returned to your context) on a violation; allows (exit 0) otherwise, including when there's no `rules.yaml` or no gate rules at all.
- **Stop** — runs [`gates/stop.js`](../../gates/stop.js): re-checks every `tier: gate` rule against the real, now-applied state of the repo. Refuses completion (exit 2, failures fed back as context) until everything passes or `MEMREPO_GATE_MAX_PASSES` (default 3) attempts are used, then escalates any still-failing rule to `drift-ledger.md` and allows completion — nothing fails silently, nothing blocks forever.
- **SessionEnd** — writes a session-note capture to `inbox/`, commits, pushes. Best-effort: a failed push here never blocks or errors your Claude Code session.

## Verify it's working

Start a session in a project with a memrepo briefing — the briefing content should be visible in Claude's context from turn 1. Check `$MEMREPO_PATH/inbox/` after ending the session; a new capture file should be there (and pushed, if your deploy key has write access).

To verify gates specifically: add a `tier: gate` rule to `projects/{slug}/rules.yaml` with a `check:` command that fails on some pattern (e.g. `! grep -rn 'TODO' src/`), then ask Claude Code to write a file containing that pattern within the rule's `scope`. The write should be refused with the rule text shown, and Claude should be able to see why and try again.
