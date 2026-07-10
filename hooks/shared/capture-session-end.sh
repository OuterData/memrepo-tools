#!/bin/bash
# Shared by every tool's session-end/stop hook recipe: writes a raw
# capture into inbox/ (per SPEC.md section 5 - inbox/ is the only write
# target for capture, the engine owns folding it into sessions/ later),
# commits, and pushes. Reads the hook's own JSON payload from stdin if
# present (works generically across tools whose hooks pass session
# metadata as JSON on stdin) and stores whatever it got, best-effort -
# this script's job is reliable capture, not parsing every tool's exact
# schema.
#
# Env vars:
#   MEMREPO_PATH   - path to your local memrepo clone (default: ~/.outerbot/memrepo)
#   PROJECT_SLUG   - override auto-detection (default: current dir's basename, slugified)
#   TOOL_NAME      - which tool triggered this (default: "unknown")
set -uo pipefail

MEMREPO_PATH="${MEMREPO_PATH:-$HOME/.outerbot/memrepo}"

if [ ! -d "$MEMREPO_PATH/.git" ]; then
  exit 0
fi

slugify() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g'
}

PROJECT_SLUG="${PROJECT_SLUG:-$(slugify "$(basename "$PWD")")}"
TOOL_NAME="${TOOL_NAME:-unknown}"

STDIN_PAYLOAD=""
if [ ! -t 0 ]; then
  STDIN_PAYLOAD=$(cat)
fi

mkdir -p "$MEMREPO_PATH/inbox"
TIMESTAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
CAPTURE_FILE="$MEMREPO_PATH/inbox/${TIMESTAMP}-${TOOL_NAME}-session-end.json"

# printf %s avoids re-interpreting backslashes/percent signs that might be
# in STDIN_PAYLOAD; captured_at/tool/project are always well-formed even
# if the tool's own payload isn't valid JSON (raw_payload just carries
# whatever text arrived).
{
  printf '{\n'
  printf '  "captured_at": "%s",\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '  "tool": "%s",\n' "$TOOL_NAME"
  printf '  "project_slug": "%s",\n' "$PROJECT_SLUG"
  printf '  "kind": "session-end"'
  if [ -n "$STDIN_PAYLOAD" ]; then
    ESCAPED=$(printf '%s' "$STDIN_PAYLOAD" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n' ' ')
    printf ',\n  "raw_payload": "%s"\n' "$ESCAPED"
  else
    printf '\n'
  fi
  printf '}\n'
} > "$CAPTURE_FILE"

cd "$MEMREPO_PATH"
git add "inbox/" >/dev/null 2>&1
if ! git diff --cached --quiet 2>/dev/null; then
  git -c user.email="memrepo@outer.bot" -c user.name="outer.bot memrepo (${TOOL_NAME})" \
    commit -q -m "outer.bot: session note from ${TOOL_NAME}" >/dev/null 2>&1
  git push -q origin HEAD 2>/dev/null || true # best-effort - a failed push here shouldn't fail the tool's session-end
fi
