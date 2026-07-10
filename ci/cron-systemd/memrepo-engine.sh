#!/bin/bash
# memrepo-engine — plain cron/systemd recipe for self-hosted memrepos.
# Same engine as the GitHub Actions / GitLab CI templates -- this script
# is only a scheduler wrapper, same as those are.
#
# Usage: set MEMREPO_PATH to your local memrepo clone, then either:
#   crontab: 0 * * * * /path/to/memrepo-engine.sh
#   systemd: pair with the .timer unit in this same directory
set -euo pipefail

MEMREPO_PATH="${MEMREPO_PATH:?Set MEMREPO_PATH to your local memrepo clone}"

cd "$MEMREPO_PATH"
git pull --ff-only

memrepo-engine "$MEMREPO_PATH"

git config user.email "memrepo@outer.bot"
git config user.name "outer.bot memrepo engine"
git add -A
if ! git diff --staged --quiet; then
  git commit -m "outer.bot: engine run $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  git push
fi
