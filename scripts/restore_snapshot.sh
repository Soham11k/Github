#!/usr/bin/env bash
# Restore a demo snapshot created by snapshot_db.sh
# Usage: ./scripts/restore_snapshot.sh path/to/file.dump
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DUMP="${1:-}"
if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "Usage: $0 path/to/snapshot.dump" >&2
  exit 1
fi

if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^github_osint_db$'; then
  echo "==> Restoring into Docker DB github_osint_db from $DUMP"
  docker cp "$DUMP" github_osint_db:/tmp/osint_restore.dump
  docker exec github_osint_db pg_restore -U osint -d github_osint --clean --if-exists /tmp/osint_restore.dump \
    || echo "WARNING: pg_restore reported errors (often OK for ownership/extension noise)"
  docker exec github_osint_db rm -f /tmp/osint_restore.dump
else
  # shellcheck disable=SC1091
  source "$ROOT/scripts/load_env.sh"
  load_dotenv "$ROOT/.env" 2>/dev/null || true
  URL="${DATABASE_URL:-postgresql://osint:osint@localhost:5432/github_osint}"
  echo "==> Restoring into local DB from $DUMP"
  pg_restore -d "$URL" --clean --if-exists "$DUMP" \
    || echo "WARNING: pg_restore reported errors (often OK for ownership/extension noise)"
fi

echo "Restore finished. Refresh analytics if needed: CALL sp_refresh_analytics();"
