# Runbook

## Prerequisites

- PostgreSQL 16 (Docker via `docker compose up -d` **or** local Homebrew Postgres)
- Python 3.12+
- Node.js 18+
- Optional: GitHub PAT in `.env` as `GITHUB_TOKEN` (5,000 req/hr)

## Fast path

```bash
# Set GITHUB_TOKEN in .env first for real GitHub data
./scripts/start.sh       # empty DB + token → live ingest; else SQL seed fallback
./scripts/sync_github.sh # re-sync anytime
./scripts/stop.sh
```

UI ingest: http://127.0.0.1:5173/ingest (admin token default `changeme`; status shows token OK + login).

Full Docker stack: `docker compose up --build` → UI http://localhost:8080

## Database

```bash
# Docker DB only (first boot applies sql/*.sql + seed)
docker compose up -d db

# Or local DB already created as github_osint / osint:osint
./scripts/apply_sql.sh --with-seed
```

Connection string (default):

```text
postgresql://osint:osint@localhost:5432/github_osint
```

## Backend

```bash
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env   # set GITHUB_TOKEN if using live ingest

# Offline demo data
psql "$DATABASE_URL" -f ../sql/seed_demo.sql

# Or live ingest
python -m app.ingest --seed --limit 12

uvicorn app.main:app --reload --port 8000
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 (proxies `/api` → `:8000`).

## Common failures

| Symptom | Fix |
|---|---|
| `v_health_factors` missing | Re-run `./scripts/apply_sql.sh` |
| Rate limit during ingest | Set `GITHUB_TOKEN`; or use seed only |
| `dependabot[bot]` unique login conflict | Fixed in ingest upsert; re-run sync |
| USB/`._*` venv UTF-8 errors | Create venv off the USB volume |
| View column rename error | Script drops `v_dashboard_kpis` before recreate |

## Evaluator SQL walkthrough

```bash
psql postgresql://osint:osint@localhost:5432/github_osint -f sql/demo_queries.sql
```
