#!/usr/bin/env bash
# Re-sync all full-depth repositories (or the seed list if DB is unreachable).
# Example cron (daily 03:15): 15 3 * * * cd /path/to/Project && ./scripts/resync_full.sh >> /tmp/osint-resync.log 2>&1
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source "$ROOT/scripts/load_env.sh"
load_dotenv "$ROOT/.env" 2>/dev/null || true

LIMIT="${LIMIT:-50}"
PYTHON="${PYTHON:-}"
if [[ -z "$PYTHON" ]]; then
  if [[ -x /tmp/github-osint-venv/bin/python ]]; then
    PYTHON=/tmp/github-osint-venv/bin/python
  elif [[ -x "$ROOT/backend/.venv/bin/python" ]]; then
    PYTHON="$ROOT/backend/.venv/bin/python"
  else
    PYTHON=python3
  fi
fi

export DATABASE_URL="${DATABASE_URL:-postgresql://osint:osint@localhost:5432/github_osint}"

REPOS_FILE="$(mktemp)"
trap 'rm -f "$REPOS_FILE"' EXIT

if command -v psql >/dev/null 2>&1; then
  psql "$DATABASE_URL" -Atc \
    "SELECT full_name FROM repositories WHERE COALESCE(sync_depth,'full')='full' ORDER BY stars DESC LIMIT ${LIMIT}" \
    > "$REPOS_FILE" || true
fi

# Docker fallback
if [[ ! -s "$REPOS_FILE" ]] && docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^github_osint_db$'; then
  docker exec github_osint_db psql -U osint -d github_osint -Atc \
    "SELECT full_name FROM repositories WHERE COALESCE(sync_depth,'full')='full' ORDER BY stars DESC LIMIT ${LIMIT}" \
    > "$REPOS_FILE" || true
fi

ARGS=(--no-seed --limit "$LIMIT")
if [[ -s "$REPOS_FILE" ]]; then
  while IFS= read -r repo; do
    [[ -n "$repo" ]] && ARGS+=(--repo "$repo")
  done < "$REPOS_FILE"
  echo "==> Re-syncing $(wc -l < "$REPOS_FILE" | tr -d ' ') full-depth repos…"
else
  echo "==> No full-depth rows found — falling back to seed list"
  ARGS=(--seed --limit "$LIMIT")
fi

cd "$ROOT/backend"
exec "$PYTHON" -m app.ingest "${ARGS[@]}"
