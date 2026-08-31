#!/usr/bin/env bash
# Re-apply SQL files to an existing database (idempotent where possible).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATABASE_URL="${DATABASE_URL:-postgresql://osint:osint@localhost:5432/github_osint}"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/sql/schema.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/sql/indexes.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/sql/triggers.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/sql/views.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/sql/procedures.sql"
# Grants only work when connected as a superuser / owner; ignore failures for osint self-apply
psql "$DATABASE_URL" -f "$ROOT/sql/grants.sql" || true
if [[ "${1:-}" == "--with-seed" ]]; then
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT/sql/seed_demo.sql"
  echo "Demo seed loaded."
fi
echo "SQL applied successfully."
