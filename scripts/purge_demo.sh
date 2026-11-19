#!/usr/bin/env bash
# Remove offline sql/seed_demo.sql rows when present (fixed demo IDs / org logins only).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DATABASE_URL="${DATABASE_URL:-postgresql://osint:osint@localhost:5432/github_osint}"

DEMO_N="$(psql "$DATABASE_URL" -Atc "
  SELECT COUNT(*)::INT
  FROM repositories
  WHERE repo_id BETWEEN 920001 AND 920099
     OR owner_login IN ('demo-org', 'acme-labs', 'northwind-oss', 'alice-dev', 'diego-go');
" 2>/dev/null || echo 0)"

if [[ "${DEMO_N:-0}" -eq 0 ]]; then
  echo "No offline demo repositories found — nothing to purge."
  exit 0
fi

echo "==> Purging $DEMO_N offline demo repository row(s)…"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/sql/purge_demo.sql"
echo "    Demo seed removed."
