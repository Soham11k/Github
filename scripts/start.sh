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

# shellcheck disable=SC1091
source "$ROOT/scripts/load_env.sh"
load_dotenv "$ROOT/.env"

DATABASE_URL="${DATABASE_URL:-postgresql://osint:osint@localhost:5432/github_osint}"
# Local start always needs a reachable Postgres. Keep cloud URI in .env for deploy,
# but point the API at localhost unless USE_REMOTE_DB=1.
if [[ "$DATABASE_URL" != *"localhost"* && "$DATABASE_URL" != *"127.0.0.1"* ]]; then
  if [[ "${USE_REMOTE_DB:-}" == "1" ]]; then
    echo "    Using remote DATABASE_URL (USE_REMOTE_DB=1)."
  else
    echo "    .env DATABASE_URL is remote; local start uses localhost Postgres."
    echo "    (Set USE_REMOTE_DB=1 to force the remote URL for the API.)"
    DATABASE_URL="postgresql://osint:osint@localhost:5432/github_osint"
  fi
fi
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

echo "==> Backend venv…"
if command -v python3.12 >/dev/null 2>&1; then PY=python3.12; else PY=python3; fi
VENV_DIR="/tmp/github-osint-venv"
if [[ ! -x "$VENV_DIR/bin/uvicorn" ]]; then
  "$PY" -m venv "$VENV_DIR"
  "$VENV_DIR/bin/pip" install -q -r "$ROOT/backend/requirements.txt"
fi
ln -sfn "$VENV_DIR" "$ROOT/backend/.venv"

REPO_COUNT="$(psql -h localhost -d github_osint -Atc "SELECT COUNT(*) FROM repositories;" 2>/dev/null || echo 0)"
DEMO_COUNT="$(psql -h localhost -d github_osint -Atc "
  SELECT COUNT(*)::INT FROM repositories
  WHERE repo_id BETWEEN 920001 AND 920099
     OR owner_login IN ('demo-org', 'acme-labs', 'northwind-oss', 'alice-dev', 'diego-go');
" 2>/dev/null || echo 0)"
TOKEN_TRIMMED="$(echo -n "${GITHUB_TOKEN:-}" | tr -d '[:space:]')"

# Live bootstrap when empty, or when the only rows are the offline demo seed
if [[ -n "$TOKEN_TRIMMED" ]] && { [[ "${REPO_COUNT:-0}" -eq 0 ]] || { [[ "${DEMO_COUNT:-0}" -gt 0 ]] && [[ "${DEMO_COUNT}" -eq "${REPO_COUNT}" ]]; }; }; then
  if [[ "${DEMO_COUNT:-0}" -gt 0 ]]; then
    echo "==> Demo-only database — purging offline seed before live ingest…"
    DATABASE_URL="postgresql://osint:osint@localhost:5432/github_osint" bash "$ROOT/scripts/purge_demo.sh"
  fi
  echo "==> Live ingest from GitHub (showcase seed list, limit 12)…"
  INGEST_OUT="$RUN_DIR/bootstrap_ingest.json"
  set +e
  (
    cd "$ROOT/backend"
    "$VENV_DIR/bin/python" -m app.ingest --seed --limit 12
  ) >"$INGEST_OUT" 2>"$RUN_DIR/bootstrap_ingest.log"
  INGEST_RC=$?
  set -e
  if [[ -f "$INGEST_OUT" ]]; then
    echo "    Ingest result:"
    cat "$INGEST_OUT" || true
  fi
  SYNCED="$(psql -h localhost -d github_osint -Atc "SELECT COUNT(*) FROM repositories;" 2>/dev/null || echo 0)"
  if [[ "$INGEST_RC" -ne 0 || "${SYNCED:-0}" -eq 0 ]]; then
    echo "ERROR: Live GitHub ingest failed or synced 0 repos."
    echo "       Check GITHUB_TOKEN in .env (expired/invalid?) and $RUN_DIR/bootstrap_ingest.log"
    tail -40 "$RUN_DIR/bootstrap_ingest.log" || true
    exit 1
  fi
  echo "    Synced $SYNCED repositories from GitHub."
elif [[ "${REPO_COUNT:-0}" -eq 0 ]]; then
  echo "==> Empty database — no GITHUB_TOKEN; loading offline demo seed…"
  psql -h localhost -d github_osint -v ON_ERROR_STOP=1 -f "$ROOT/sql/seed_demo.sql" >/dev/null
fi
psql -h localhost -d github_osint -f "$ROOT/sql/grants.sql" >/dev/null 2>&1 || true

echo "==> Frontend deps…"
if [[ ! -d "$ROOT/frontend/node_modules" ]]; then
  (cd "$ROOT/frontend" && npm install)
fi

echo "==> Starting API on :8000…"
cd "$ROOT/backend"
nohup "$VENV_DIR/bin/uvicorn" app.main:app --host 127.0.0.1 --port 8000 \
  >"$RUN_DIR/api.log" 2>&1 &
echo $! >"$RUN_DIR/api.pid"

echo "==> Starting worker (drain ingest requests)…"
cd "$ROOT/backend"
nohup "$VENV_DIR/bin/python" -m app.worker --loop \
  >"$RUN_DIR/worker.log" 2>&1 &
echo $! >"$RUN_DIR/worker.pid"

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
echo "  Worker:  draining /requests queue (see .run/worker.log)"
echo "  Stop:    ./scripts/stop.sh"
if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo ""
  echo "Note: GITHUB_TOKEN is empty — seed data works offline; set token in .env for live ingest."
fi
