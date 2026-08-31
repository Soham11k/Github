#!/usr/bin/env bash
# One-command local start: DB + API + UI (with seed if empty)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RUN_DIR="$ROOT/.run"
cd "$ROOT"
mkdir -p "$RUN_DIR"

if [[ ! -f "$ROOT/.env" ]]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
  echo "Created .env from .env.example — set GITHUB_TOKEN for live ingest."
fi

set -a
# shellcheck disable=SC1091
source <(sed 's/\r$//' "$ROOT/.env" | grep -E '^[A-Za-z_][A-Za-z0-9_]*=' || true)
set +a

DATABASE_URL="${DATABASE_URL:-postgresql://osint:osint@localhost:5432/github_osint}"
export DATABASE_URL
cp "$ROOT/.env" "$ROOT/backend/.env"

bash "$ROOT/scripts/stop.sh" >/dev/null 2>&1 || true

echo "==> Ensuring PostgreSQL…"
if pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
  echo "    Local Postgres is accepting connections."
elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  echo "    Starting Postgres via docker compose…"
  docker compose -f "$ROOT/docker-compose.yml" up -d db
  for _ in $(seq 1 40); do
    if docker compose -f "$ROOT/docker-compose.yml" exec -T db pg_isready -U osint -d github_osint >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
else
  echo "ERROR: PostgreSQL is not running and Docker is unavailable."
  exit 1
fi

if command -v psql >/dev/null 2>&1; then
  psql -h localhost -d postgres -v ON_ERROR_STOP=0 <<'SQL' >/dev/null 2>&1 || true
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'osint') THEN
    CREATE ROLE osint LOGIN PASSWORD 'osint';
  END IF;
END $$;
SQL
  if ! psql -h localhost -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname='github_osint'" | grep -q 1; then
    psql -h localhost -d postgres -c "CREATE DATABASE github_osint OWNER osint;" >/dev/null
  fi
  psql -h localhost -d github_osint -c "GRANT ALL ON SCHEMA public TO osint;" >/dev/null 2>&1 || true
fi

echo "==> Applying SQL…"
for f in schema indexes triggers views procedures grants; do
  psql -h localhost -d github_osint -v ON_ERROR_STOP=1 -f "$ROOT/sql/${f}.sql" >/dev/null
done
psql "$DATABASE_URL" -c "SELECT 1" >/dev/null 2>&1 || true

REPO_COUNT="$(psql -h localhost -d github_osint -Atc "SELECT COUNT(*) FROM repositories;" 2>/dev/null || echo 0)"
if [[ "${REPO_COUNT:-0}" -eq 0 ]]; then
  echo "==> Empty database — loading demo seed…"
  psql -h localhost -d github_osint -v ON_ERROR_STOP=1 -f "$ROOT/sql/seed_demo.sql" >/dev/null
fi
psql -h localhost -d github_osint -f "$ROOT/sql/grants.sql" >/dev/null 2>&1 || true

echo "==> Backend venv…"
if command -v python3.12 >/dev/null 2>&1; then PY=python3.12; else PY=python3; fi
VENV_DIR="/tmp/github-osint-venv"
if [[ ! -x "$VENV_DIR/bin/uvicorn" ]]; then
  "$PY" -m venv "$VENV_DIR"
  "$VENV_DIR/bin/pip" install -q -r "$ROOT/backend/requirements.txt"
fi
ln -sfn "$VENV_DIR" "$ROOT/backend/.venv"

echo "==> Frontend deps…"
if [[ ! -d "$ROOT/frontend/node_modules" ]]; then
  (cd "$ROOT/frontend" && npm install)
fi

echo "==> Starting API on :8000…"
cd "$ROOT/backend"
nohup "$VENV_DIR/bin/uvicorn" app.main:app --host 127.0.0.1 --port 8000 \
  >"$RUN_DIR/api.log" 2>&1 &
echo $! >"$RUN_DIR/api.pid"

echo "==> Starting UI on :5173…"
cd "$ROOT/frontend"
# strictPort: fail clearly instead of silently binding another port
nohup npm run dev -- --host 127.0.0.1 --port 5173 --strictPort \
  >"$RUN_DIR/ui.log" 2>&1 &
echo $! >"$RUN_DIR/ui.pid"

echo "==> Waiting for health…"
API_OK=0
UI_OK=0
for _ in $(seq 1 60); do
  if curl -sf --max-time 2 http://127.0.0.1:8000/api/health >/dev/null 2>&1; then API_OK=1; fi
  if curl -sf --max-time 2 http://127.0.0.1:5173/ >/dev/null 2>&1; then UI_OK=1; fi
  if [[ "$API_OK" -eq 1 && "$UI_OK" -eq 1 ]]; then break; fi
  sleep 1
done

if [[ "$API_OK" -ne 1 ]]; then
  echo "ERROR: API did not become healthy. See $RUN_DIR/api.log"
  tail -40 "$RUN_DIR/api.log" || true
  exit 1
fi
if [[ "$UI_OK" -ne 1 ]]; then
  echo "ERROR: UI did not become healthy. See $RUN_DIR/ui.log"
  tail -40 "$RUN_DIR/ui.log" || true
  exit 1
fi

echo ""
echo "GitHub OSINT is running."
echo "  UI:      http://127.0.0.1:5173/"
echo "  API:     http://127.0.0.1:8000/docs"
echo "  Ingest:  http://127.0.0.1:5173/ingest"
echo "  Stop:    ./scripts/stop.sh"
if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo ""
  echo "Note: GITHUB_TOKEN is empty — seed data works offline; set token in .env for live ingest."
fi
