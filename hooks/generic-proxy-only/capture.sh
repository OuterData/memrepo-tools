#!/bin/bash
# For tools with no hook system at all (Continue, Aider per docs/TOOL_COVERAGE.md)
# — there's no session-end event to automate this, so this is a manual
# command you run yourself when you want to note something down. The
# primary, recommended path for these tools is proxy mode (point the
# tool's own base-URL config at outer.bot) — this script is a supplement
# for anyone using them purely locally with a memrepo and no proxy.
#
# Usage: capture.sh "note text" [project-slug]
set -uo pipefail

MEMREPO_PATH="${MEMREPO_PATH:-$HOME/.outerbot/memrepo}"
NOTE="${1:?Usage: capture.sh \"note text\" [project-slug]}"
PROJECT_SLUG="${2:-}"

if [ -z "$PROJECT_SLUG" ]; then
  PROJECT_SLUG=$(basename "$PWD" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g')
fi

if [ ! -d "$MEMREPO_PATH/.git" ]; then
  echo "No memrepo found at $MEMREPO_PATH — nothing to capture into." >&2
  exit 1
fi

mkdir -p "$MEMREPO_PATH/inbox"
TIMESTAMP=$(date -u +%Y-%m-%dT%H-%M-%SZ)
CAPTURE_FILE="$MEMREPO_PATH/inbox/${TIMESTAMP}-manual.json"

NOTE_ESCAPED=$(printf '%s' "$NOTE" | sed 's/\\/\\\\/g; s/"/\\"/g')
cat > "$CAPTURE_FILE" <<EOF
{
  "captured_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "tool": "manual",
  "project_slug": "$PROJECT_SLUG",
  "kind": "manual-capture",
  "note": "$NOTE_ESCAPED"
}
EOF

cd "$MEMREPO_PATH"
git add "inbox/" >/dev/null 2>&1
git -c user.email="memrepo@outer.bot" -c user.name="outer.bot memrepo (manual)" commit -q -m "outer.bot: manual capture" >/dev/null 2>&1
git push -q origin HEAD 2>/dev/null && echo "Captured and pushed." || echo "Captured locally — push failed, will retry next time you push manually."
