# memrepo hooks recipes

Zero-touch delivery: your AI tool's own hooks read your local memrepo clone directly, inject context, and enforce `rules.yaml` gates — no proxy in the loop, outer.bot's servers see nothing. Every recipe here is copy-paste config that references the shared scripts in [`shared/`](./shared/) and the gate runners in [`../gates/`](../gates/); nothing to install beyond cloning this repo once and having `bash`/`node` available (already required for the recipes that existed before gates were wired in — gates add no new runtime dependency).

Coverage below matches `docs/TOOL_COVERAGE.md` (P9.0) exactly — a tool is listed here only if it actually has the hook events this needs, verified against current official docs, not assumed. **"Gate" is split into two independently-real capabilities** because several tools support one but not the other: pre-write blocking (`PreToolUse`) and post-write convergence/escalation (`Stop`). A tool with a working `Stop`-block gets both; a tool with only a working `PreToolUse` block gets pre-write protection with no retry loop or ledger record if a violation is only caught after the fact — see that tool's own README for why before assuming "gate: yes" means the full ladder.

| Tool | Inject | Capture | Gate — pre-write block | Gate — stop/converge | Status |
|---|---|---|---|---|---|
| [Claude Code](./claude-code/) | Yes | Yes | Yes | Yes | **Live-verified end to end** — real session, real block, real ledger entry (see repo checkpoint) |
| [Cursor](./cursor/) | Yes (unconfirmed contract) | Yes | Yes (unconfirmed field names — fails open on mismatch) | **No** — `sessionEnd` doesn't block per docs; not wired | Not live-tested |
| [Cline](./cline/) | Yes | Yes | Yes (unverified — relies on Cline's own "100% Claude-compatible" claim) | Yes (same basis) | Not live-tested |
| [Codex CLI](./codex-cli/) | Yes | Yes | Yes (confirmed contract) | Yes (contract not explicitly confirmed either way) | Not live-tested |
| [GitHub Copilot](./github-copilot/) | Yes (least-confirmed injection contract) | Yes | Yes (unconfirmed field names — fails open on mismatch) | **No** — session-end events don't block per docs; not wired | Not live-tested |
| [Continue / Aider](./generic-proxy-only/) | No | Manual only | No | No | No hook system exists — use proxy mode instead |
| [Devin Desktop](./devin-desktop/) | No | No | No | No | No confirmed integration surface at all — open escalation |

## Shared scripts

- [`shared/inject-briefing.sh`](./shared/inject-briefing.sh) — pulls your memrepo, prints the current project's briefing + relevant skills.
- [`shared/capture-session-end.sh`](./shared/capture-session-end.sh) — writes a session-note capture to `inbox/`, commits, pushes.
- [`../gates/pretooluse.js`](../gates/pretooluse.js) / [`../gates/stop.js`](../gates/stop.js) — the gate runners, shared unmodified across every tool that wires them; the boundary that varies per tool is only whether that tool's hook payload matches the Claude-Code-shaped stdin these scripts read, and whether that tool's exit-2 convention actually blocks at the event it's wired to.

Every tool recipe above is a thin config wrapper around these scripts — the actual memrepo-reading/writing/gate-checking logic lives here once, tested here once (against Claude Code — see [`../gates/README.md`](../gates/README.md)), not duplicated per tool.
