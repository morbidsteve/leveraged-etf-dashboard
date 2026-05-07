#!/usr/bin/env bash
# Debounced auto-rebuild of the docker container after a git commit.
#
# - Multiple rapid commits collapse into one rebuild (the rebuild picks
#   up whatever HEAD is at sleep-end, not at hook-fire time).
# - If a rebuild is already queued, this exits silently.
# - Runs in background; the post-commit hook returns immediately.
# - Old container keeps running if the build fails.
#
# Override the debounce window with: ETF_REBUILD_DEBOUNCE=30 git commit ...
# Watch progress: tail -f .auto-rebuild.log

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG="$REPO_ROOT/.auto-rebuild.log"
LOCK="/tmp/etf-dashboard-rebuild.lock"
DEBOUNCE_SECS="${ETF_REBUILD_DEBOUNCE:-15}"
HEALTH_PORT="${ETF_HEALTH_PORT:-3000}"
HEALTH_TIMEOUT_SECS=30

ts() { date -Iseconds; }

# Trim log if it exceeds 1MB (keep last 500 lines)
if [[ -f "$LOG" ]] && [[ $(stat -c%s "$LOG" 2>/dev/null || echo 0) -gt 1048576 ]]; then
  tail -500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

# Non-blocking lock — if a rebuild is already pending, exit.
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "[$(ts)] rebuild already pending, skipping" >> "$LOG"
  exit 0
fi

echo "[$(ts)] commit detected, debouncing ${DEBOUNCE_SECS}s before rebuild" >> "$LOG"
sleep "$DEBOUNCE_SECS"

cd "$REPO_ROOT"
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
SUBJECT="$(git log -1 --pretty=%s 2>/dev/null || echo '')"
echo "[$(ts)] rebuilding @ $COMMIT — $SUBJECT" >> "$LOG"

if docker compose up -d --build >> "$LOG" 2>&1; then
  echo "[$(ts)] ✓ docker build + up succeeded ($COMMIT)" >> "$LOG"

  # Wait for the container to respond on the health port.
  for ((i=1; i<=HEALTH_TIMEOUT_SECS; i++)); do
    if curl -sf -o /dev/null -m 2 "http://localhost:${HEALTH_PORT}/"; then
      echo "[$(ts)] ✓ container healthy on :${HEALTH_PORT} (after ${i}s)" >> "$LOG"
      exit 0
    fi
    sleep 1
  done
  echo "[$(ts)] ⚠ container not responding on :${HEALTH_PORT} after ${HEALTH_TIMEOUT_SECS}s — check 'docker logs leveraged-etf-dashboard'" >> "$LOG"
else
  echo "[$(ts)] ✗ docker build FAILED — old container still running" >> "$LOG"
  exit 1
fi
