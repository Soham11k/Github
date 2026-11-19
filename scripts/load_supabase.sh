#!/usr/bin/env bash
# Apply schema to DATABASE_URL (Supabase) and load demo or live data.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/load_env.sh"
load_dotenv "$ROOT/.env" || true
load_dotenv "$ROOT/backend/.env" || true

PYTHON=""
for candidate in \
  "$ROOT/backend/.venv/bin/python" \
  "/tmp/github-osint-venv/bin/python" \
  python3.12 python3 python
do
  if [[ -x "$candidate" ]] || command -v "$candidate" >/dev/null 2>&1; then
    PYTHON="$candidate"
    break
  fi
done
if [[ -z "$PYTHON" ]]; then
  echo "No Python found. Install Python 3.12+ or use: /usr/local/bin/python3.12" >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Set DATABASE_URL to your Supabase Postgres URI first (in .env or backend/.env)." >&2
  exit 1
fi

if [[ "$DATABASE_URL" == *"localhost"* ]] || [[ "$DATABASE_URL" == *"127.0.0.1"* ]]; then
  echo "ERROR: DATABASE_URL is still local ($DATABASE_URL)." >&2
  echo "In Supabase: Project Settings → Database → Connection string (URI)." >&2
  echo "Paste it into backend/.env (or .env) as DATABASE_URL=postgresql://..." >&2
  exit 1
fi

echo "==> Migrating schema with ${PYTHON}"
(
  cd "$ROOT/backend"
  PYTHONPATH=. "$PYTHON" -m app.migrate
)

MODE="${1:-auto}"  # auto | demo | live
TOKEN="$(echo -n "${GITHUB_TOKEN:-}" | tr -d '[:space:]')"

if [[ "$MODE" == "demo" ]] || { [[ "$MODE" == "auto" ]] && [[ -z "$TOKEN" ]]; }; then
  echo "==> Loading sql/seed_demo.sql (offline demo)…"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/sql/seed_demo.sql"
  echo "==> Refreshing analytics…"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "CALL sp_refresh_analytics();"
else
  if [[ -z "$TOKEN" ]]; then
    echo "ERROR: live mode needs GITHUB_TOKEN in .env" >&2
    exit 1
  fi
  echo "==> Live ingest seed list (limit ${LIMIT:-50})…"
  (
    cd "$ROOT/backend"
    PYTHONPATH=. "$PYTHON" -m app.ingest --seed --limit "${LIMIT:-50}"
    PYTHONPATH=. "$PYTHON" - <<'PY'
from app.db import execute
execute("CALL sp_refresh_analytics()")
print("analytics refreshed")
PY
  )
fi

echo "==> Counts"
psql "$DATABASE_URL" -c "SELECT COUNT(*) AS repos FROM repositories; SELECT COUNT(*) AS commits FROM commits;"
echo "Done. Point Render DATABASE_URL at this Supabase project, then deploy the frontend to Vercel."
