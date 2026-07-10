# Continue / Aider — proxy mode is the real answer

Per `docs/TOOL_COVERAGE.md` (P9.0): neither Continue nor Aider has a hook system at all today — Continue only has static, always-loaded rule files (no dynamic events); Aider's only extensibility points run *after* a change (lint/test commands), not before a prompt. There's no automation path for these two the way there is for Claude Code, Cursor, Cline, Codex CLI, or Copilot.

**Recommended: use proxy mode instead.** Both tools support a custom OpenAI-compatible base URL (`apiBase` in Continue's `config.yaml`, `--openai-api-base`/`OPENAI_API_BASE` for Aider) — point that at outer.bot and you get full delivery with zero manual steps, the same as any proxy-mode setup.

## `capture.sh` — manual supplement, not automation

If you're using either tool purely locally against a memrepo with no proxy involved, [`capture.sh`](./capture.sh) is a one-line manual command for jotting a note into `inbox/` yourself, since there's no hook to do it for you:

```bash
./capture.sh "fixed the retry logic" my-project-slug
```

This is not a replacement for real delivery — it's a fallback for the specific case of "no proxy, no hooks, want *something*."

## Continue's sunset status

Continue was acquired by Cursor in June 2026; the open-source repo is now read-only, v2.0.0 (2026-06-19) is the final release. Not a reason to avoid proxy mode with it today, but not worth further hook-recipe investment either way.
