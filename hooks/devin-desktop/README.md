# Devin Desktop — not currently supported

Per `docs/TOOL_COVERAGE.md` (P9.0): Devin Desktop (formerly Windsurf, renamed 2026-06-02) exposes no lifecycle hooks to third parties — confirmed directly from its own FAQ. Its only extensibility points are MCP servers and static workspace rules files (`.devin/rules/`).

Unlike Continue and Aider, we could **not** confirm Devin Desktop supports pointing at a custom LLM base URL either — the only endpoint documentation surfaced was for MCP tool servers, which is a different thing from model routing. If its model calls are hardwired to Cognition's own backend, there may be no integration surface at all today, not just "no hooks."

**This is flagged as an open escalation, not a decided gap.** If you have a live Devin Desktop instance and can confirm one way or the other whether a custom model endpoint works, that directly resolves the open question in `docs/TOOL_COVERAGE.md` — please report back rather than assume either answer.

No recipe exists here because there's nothing yet to write one against.
