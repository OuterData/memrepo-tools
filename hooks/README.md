# memrepo hooks recipes

Zero-touch delivery: your AI tool's own hooks read your local memrepo clone directly and inject context — no proxy in the loop, outer.bot's servers see nothing. Every recipe here is copy-paste config that references the shared scripts in [`shared/`](./shared/); nothing to install beyond cloning this repo once.

Coverage below matches `docs/TOOL_COVERAGE.md` (P9.0) exactly — a tool is listed here only if it actually has the hook events this needs, verified against current official docs, not assumed.

| Tool | Recipe | Status |
|---|---|---|
| [Claude Code](./claude-code/) | Full: inject + capture | Verified against real hook execution during development |
| [Cursor](./cursor/) | Full: inject + capture | Event names/blocking confirmed; exact injection JSON contract not yet live-tested |
| [Cline](./cline/) | Full: inject + capture | Same protocol as Claude Code (Cline's own claim) — should just work |
| [Codex CLI](./codex-cli/) | Full: inject + capture | Event names/config confirmed against official docs |
| [GitHub Copilot](./github-copilot/) | Full: inject + capture | **Least confirmed** — see its README before relying on this |
| [Continue / Aider](./generic-proxy-only/) | Manual capture only | No hook system exists — use proxy mode instead |
| [Devin Desktop](./devin-desktop/) | None | No confirmed integration surface at all — open escalation |

## Shared scripts

- [`shared/inject-briefing.sh`](./shared/inject-briefing.sh) — pulls your memrepo, prints the current project's briefing + relevant skills.
- [`shared/capture-session-end.sh`](./shared/capture-session-end.sh) — writes a session-note capture to `inbox/`, commits, pushes.

Every tool recipe above is a thin config wrapper around these two scripts — the actual memrepo-reading/writing logic lives here once, tested here once, not duplicated per tool.
