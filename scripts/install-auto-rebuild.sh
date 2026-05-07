#!/usr/bin/env bash
# One-time setup: tells git to use the in-repo hooks directory and makes
# the rebuild scripts executable. Safe to re-run.

set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

git config core.hooksPath scripts/git-hooks
chmod +x scripts/git-hooks/post-commit scripts/auto-rebuild.sh

echo "✓ Auto-rebuild installed."
echo
echo "  Every commit will fire a debounced 'docker compose up -d --build'"
echo "  in the background. The current container keeps running until the"
echo "  new build succeeds, so failed builds don't take the site down."
echo
echo "  Watch progress:    tail -f .auto-rebuild.log"
echo "  Skip a single commit:    ETF_NO_AUTO_REBUILD=1 git commit ..."
echo "  Tweak debounce:    ETF_REBUILD_DEBOUNCE=30 git commit ..."
