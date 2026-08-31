#!/usr/bin/env bash
# Stop processes started by scripts/start.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN_DIR="$ROOT/.run"

kill_pidfile() {
  local file="$1"
  local name="$2"
  if [[ -f "$file" ]]; then
    local pid
    pid="$(cat "$file" 2>/dev/null || true)"
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
      # Kill process group children (npm/uvicorn trees)
      pkill -P "$pid" 2>/dev/null || true
      kill "$pid" 2>/dev/null || true
      sleep 0.5
      kill -9 "$pid" 2>/dev/null || true
      echo "Stopped $name (pid $pid)"
    fi
    rm -f "$file"
  fi
}

kill_pidfile "$RUN_DIR/api.pid" "API"
kill_pidfile "$RUN_DIR/ui.pid" "UI"

# Fallback: free ports if stale (vite orphans often survive npm kill)
if command -v lsof >/dev/null 2>&1; then
  for port in 8000 5173 5174; do
    pids="$(lsof -ti tcp:$port 2>/dev/null || true)"
    if [[ -n "$pids" ]]; then
      echo "$pids" | xargs kill -9 2>/dev/null || true
      echo "Freed port $port"
    fi
  done
  sleep 0.5
fi

echo "Stack stopped."
