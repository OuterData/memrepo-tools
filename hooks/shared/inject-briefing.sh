#!/bin/bash
# Shared by every tool's session-start hook recipe: pulls the local
# memrepo clone, finds the current project's briefing + skills, and
# prints them to stdout. Each tool's own recipe wraps this script's
# output in whatever JSON/stdout contract that tool's hook expects — the
# actual memrepo-reading logic lives here once, not duplicated per tool.
#
# Env vars:
#   MEMREPO_PATH   - path to your local memrepo clone (default: ~/.outerbot/memrepo)
#   PROJECT_SLUG   - override auto-detection (default: current dir's basename, slugified)
set -uo pipefail

MEMREPO_PATH="${MEMREPO_PATH:-$HOME/.outerbot/memrepo}"

if [ ! -d "$MEMREPO_PATH/.git" ]; then
  # Not an error — a tool without a provisioned memrepo yet should just
  # inject nothing, not fail the session-start hook.
  exit 0
fi

# host-agnostic primary path: git pull, not a host API call.
git -C "$MEMREPO_PATH" pull --ff-only -q 2>/dev/null || true

slugify() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g'
}

PROJECT_SLUG="${PROJECT_SLUG:-$(slugify "$(basename "$PWD")")}"
BRIEFING_PATH="$MEMREPO_PATH/projects/$PROJECT_SLUG/briefing.md"

if [ -f "$BRIEFING_PATH" ]; then
  echo "## Project Briefing (from your memrepo)"
  echo
  # Strip the YAML frontmatter block (--- ... ---) at the top, print the rest.
  awk 'BEGIN{fm=0} /^---$/{fm++; next} fm!=1{print}' "$BRIEFING_PATH"
  echo
fi

USER_SKILLS_DIR="$MEMREPO_PATH/skills/user"
PROJECT_SKILLS_DIR="$MEMREPO_PATH/skills/project/$PROJECT_SLUG"

for dir in "$USER_SKILLS_DIR" "$PROJECT_SKILLS_DIR"; do
  [ -d "$dir" ] || continue
  for f in "$dir"/*.md; do
    [ -f "$f" ] || continue
    echo "## Skill: $(basename "$f" .md)"
    echo
    awk 'BEGIN{fm=0} /^---$/{fm++; next} fm!=1{print}' "$f"
    echo
  done
done
