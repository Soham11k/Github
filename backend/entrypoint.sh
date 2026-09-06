#!/usr/bin/env bash
# Docker API entrypoint: live-ingest when token set and DB empty, then start uvicorn
set -euo pipefail

echo "==> Waiting for database…"
python - <<'PY'
import os, time
import psycopg

url = os.environ.get("DATABASE_URL", "postgresql://osint:osint@db:5432/github_osint")
for i in range(60):
    try:
        with psycopg.connect(url) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        print("    database ready")
        break
    except Exception as exc:
        if i == 59:
            raise SystemExit(f"Database not ready: {exc}") from exc
        time.sleep(1)
PY

TOKEN="$(echo -n "${GITHUB_TOKEN:-}" | tr -d '[:space:]')"
if [[ -n "$TOKEN" ]]; then
  COUNT="$(python - <<'PY'
import os
import psycopg
url = os.environ.get("DATABASE_URL", "postgresql://osint:osint@db:5432/github_osint")
with psycopg.connect(url) as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM repositories")
        print(cur.fetchone()[0])
PY
)"
  if [[ "${COUNT:-0}" -eq 0 ]]; then
    echo "==> Empty DB + GITHUB_TOKEN — live ingest (seed list, limit 50)…"
    python -m app.ingest --seed --limit 50 || echo "WARNING: live ingest failed; continuing with existing/seed data"
  else
    echo "==> Database already has ${COUNT} repos — skipping bootstrap ingest"
  fi
else
  echo "==> No GITHUB_TOKEN — using SQL seed from DB init (if any)"
fi

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
