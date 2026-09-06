#!/usr/bin/env bash
# Snapshot the OSINT database for demos (pg_dump custom format).
# Usage: ./scripts/snapshot_db.sh [output.dump]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/snapshots/github_osint_$(date +%Y%m%d_%H%M%S).dump}"
mkdir -p "$(dirname "$OUT")"

if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^github_osint_db$'; then
  echo "==> Dumping via Docker container github_osint_db → $OUT"
  docker exec github_osint_db pg_dump -U osint -d github_osint -Fc -f /tmp/osint.dump
  docker cp github_osint_db:/tmp/osint.dump "$OUT"
  docker exec github_osint_db rm -f /tmp/osint.dump
else
  # shellcheck disable=SC1091
  source "$ROOT/scripts/load_env.sh"
  load_dotenv "$ROOT/.env" 2>/dev/null || true
  URL="${DATABASE_URL:-postgresql://osint:osint@localhost:5432/github_osint}"
  echo "==> Dumping via local pg_dump → $OUT"
  pg_dump "$URL" -Fc -f "$OUT"
fi

echo "Snapshot written: $OUT"
ls -lh "$OUT"
