#!/usr/bin/env bash
# One-command live re-sync from GitHub into Postgres
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f "$ROOT/.env" ]]; then
  echo "ERROR: Missing .env — copy .env.example and set GITHUB_TOKEN."
  exit 1
fi

# shellcheck disable=SC1091
source "$ROOT/scripts/load_env.sh"
load_dotenv "$ROOT/.env"

TOKEN_TRIMMED="$(echo -n "${GITHUB_TOKEN:-}" | tr -d '[:space:]')"
if [[ -z "$TOKEN_TRIMMED" ]]; then
  echo "ERROR: GITHUB_TOKEN is empty in .env. Set a GitHub PAT first."
  exit 1
fi

export DATABASE_URL="${DATABASE_URL:-postgresql://osint:osint@localhost:5432/github_osint}"
cp "$ROOT/.env" "$ROOT/backend/.env"

if command -v python3.12 >/dev/null 2>&1; then PY=python3.12; else PY=python3; fi
VENV_DIR="/tmp/github-osint-venv"
if [[ ! -x "$VENV_DIR/bin/python" ]]; then
  "$PY" -m venv "$VENV_DIR"
  "$VENV_DIR/bin/pip" install -q -r "$ROOT/backend/requirements.txt"
fi
ln -sfn "$VENV_DIR" "$ROOT/backend/.venv"

LIMIT="${LIMIT:-12}"
QUERY="${QUERY:-}"
# REPOS: space-separated owner/repo list, e.g. REPOS="pallets/flask facebook/react"
REPOS="${REPOS:-}"

ARGS=(--limit "$LIMIT")
if [[ -n "$QUERY" ]]; then
  ARGS+=(--query "$QUERY" --no-seed)
elif [[ -n "$REPOS" ]]; then
  ARGS+=(--no-seed)
  # shellcheck disable=SC2206
  for r in $REPOS; do
    ARGS+=(--repo "$r")
  done
else
  ARGS+=(--seed)
fi

# Extra CLI args pass through (e.g. ./scripts/sync_github.sh --repo torvalds/linux)
EXTRA=("$@")
if [[ ${#EXTRA[@]} -gt 0 ]]; then
  ARGS=("${EXTRA[@]}")
fi

echo "==> Syncing from GitHub…"
cd "$ROOT/backend"
"$VENV_DIR/bin/python" -m app.ingest "${ARGS[@]}"
echo "Done. Refresh Explore / Insights, or inspect with:"
echo '  psql "$DATABASE_URL" -c "SELECT full_name, stars FROM repositories ORDER BY stars DESC LIMIT 10;"'
