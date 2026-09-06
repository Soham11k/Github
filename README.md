# GitHub Open Source Intelligence Database

Advanced SQL analytics platform that collects public GitHub repository data via the GitHub REST API, stores it in a normalized **PostgreSQL** database, and exposes health scores, contributor rankings, language trends, and beginner-friendly discovery through a **FastAPI** backend and **React + Chart.js** dashboards.

## Architecture

```
GitHub REST API → Python ingest (transactions)
                → PostgreSQL (views, procedures, triggers, CTEs)
                → FastAPI REST API
                → React + Chart.js UI
```

## Prerequisites

- Docker (for PostgreSQL 16) **or** local PostgreSQL 16
- Python **3.12+**
- Node.js 18+
- A GitHub Personal Access Token (optional but strongly recommended — 5,000 req/hr vs 60)

### Create a GitHub token

1. GitHub → Settings → Developer settings → Personal access tokens
2. Create a classic token with **public_repo** (or no scopes for public read-only on many endpoints)
3. Put it in `.env` as `GITHUB_TOKEN=...`

## Quick start

### Option A — one command (recommended on this machine)

```bash
cp .env.example .env   # first time only
# set GITHUB_TOKEN=ghp_…  (required for real GitHub data on first start)

chmod +x scripts/*.sh
./scripts/start.sh
```

When `GITHUB_TOKEN` is set and the DB is empty, `start.sh` **live-ingests** well-known repos from the GitHub API (not SQL demo rows). Without a token, it falls back to offline `sql/seed_demo.sql`.

Opens:

| URL | What |
|---|---|
| http://127.0.0.1:5173/ | UI (Explore + live or seed data) |
| http://127.0.0.1:5173/ingest | Live ingest form |
| http://127.0.0.1:8000/docs | API docs |

Stop with `./scripts/stop.sh`.

### Re-sync real GitHub data

```bash
./scripts/sync_github.sh                 # built-in seed list, limit 12
LIMIT=20 ./scripts/sync_github.sh
REPOS="pallets/flask facebook/react" ./scripts/sync_github.sh
QUERY="stars:>30000 language:python" LIMIT=10 ./scripts/sync_github.sh
./scripts/sync_github.sh --repo torvalds/linux --limit 1 --no-seed
```

### Option B — full Docker Compose (portable)

```bash
cp .env.example .env
# set GITHUB_TOKEN (recommended) and change ADMIN_TOKEN for any shared demo

docker compose up --build
```

| URL | What |
|---|---|
| http://localhost:8080/ | UI (nginx → API) |
| http://localhost:8000/docs | API |

First DB boot loads schema + offline SQL seed. If `GITHUB_TOKEN` is set and the DB still has **0** repos when `api` starts, the container **live-ingests** the seed list (limit 8) before serving.

Postgres is **not** published on host `:5432` by default (internal Docker network only). To expose it for host `psql`, uncomment the `ports` block under `db` in `docker-compose.yml`.

**Local-only credentials:** `osint` / `osint`, `ADMIN_TOKEN=changeme`, and `osint_ro` / `osint_ro` (read-only). Change before any shared deploy.

### Live ingest (UI)

1. Set `GITHUB_TOKEN` in `.env` and restart (`./scripts/stop.sh && ./scripts/start.sh`).
2. Open **Ingest** — status should show token OK + your GitHub login.
3. Keep seed list and/or add `owner/repo` lines, admin token `changeme`, run sync.
4. Explore / Insights update from Postgres.

Without a token, offline **SQL seed** still works on empty DB; live API sync will be rate-limited or fail.

### Manual / legacy steps

```bash
# Backend only
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Frontend only
cd frontend && npm run dev

# CLI ingest
cd backend && python -m app.ingest --seed --limit 12
```

API docs: http://localhost:8000/docs

## Documentation

| Doc | Purpose |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System + ingest sequence diagrams |
| [docs/ER_DIAGRAM.md](docs/ER_DIAGRAM.md) | Full entity relationship diagram |
| [docs/SQL_FEATURES.md](docs/SQL_FEATURES.md) | Advanced SQL → file mapping |
| [docs/HEALTH_SCORE.md](docs/HEALTH_SCORE.md) | Exact health weight formula |
| [docs/RUNBOOK.md](docs/RUNBOOK.md) | Ops / troubleshooting |
| [docs/SAMPLE_REPORT.md](docs/SAMPLE_REPORT.md) | Sample findings write-up |
| [docs/EVALUATION_CHECKLIST.md](docs/EVALUATION_CHECKLIST.md) | Grader demo script |

### 5-minute demo script

1. `./scripts/start.sh` (with `GITHUB_TOKEN` set → live GitHub data on empty DB)
2. SQL: `psql … -f sql/demo_queries.sql` (joins, windows, recursive CTE, procedures, EXPLAIN)
3. UI Explore → pick a healthy repo → Insights tab (factors + monthly MoM)
4. Repositories → select 2–3 → Compare radar
5. Organizations → drill into an org; toggle light/dark
6. Optional: `./scripts/sync_github.sh` or Ingest UI for more repos

## Project layout

```
sql/                 schema, indexes, triggers, views, procedures, demo queries, seed_demo.sql
backend/             FastAPI app + GitHub ingest CLI (+ Dockerfile)
frontend/            React (Vite) + Primer + Chart.js (+ Dockerfile / nginx)
docs/                Course / evaluation documentation
docker-compose.yml   Postgres + API + web (full stack)
scripts/start.sh     one-command local stack (live ingest when token + empty DB)
scripts/stop.sh      stop API/UI from start.sh
scripts/sync_github.sh  re-sync real GitHub data into Postgres
scripts/apply_sql.sh re-apply SQL (`--with-seed` loads demo data)
```

## Advanced SQL features

| Feature | Location | Use |
|---|---|---|
| Normalized schema + FKs | `sql/schema.sql` | Orgs, repos, commits, issues, PRs, languages |
| Indexes | `sql/indexes.sql` | Dashboard query performance |
| Triggers | `sql/triggers.sql` | Audit log, `last_activity_at`, denormalized counts |
| Views | `sql/views.sql` | Health, beginner-friendly, rankings, languages, inactive |
| Window functions | views + `demo_queries.sql` | `RANK`, `LAG`, `PERCENT_RANK`, rolling counts |
| Recursive CTEs | `sql/procedures.sql` | `fn_repo_fork_tree`, `fn_commit_ancestry` |
| Stored procedures | `sql/procedures.sql` | `sp_refresh_health_scores`, `sp_mark_abandoned_repos` |
| Transactions | ingest + procedures | Per-repo sync atomicity |

### Health score (`sp_refresh_health_scores`)

Weighted 0–100 composite from sampled commits/issues/PRs **plus** GitHub `pushed_at` floors so mega-repos are not falsely marked abandoned (see [docs/HEALTH_SCORE.md](docs/HEALTH_SCORE.md)):

- Commit velocity (90d sample, or recent-push floor)
- Unique contributors
- Issue close rate + median days-to-close
- PR merge rate
- Recency of last push (with archived penalty)

### Key API routes

- `GET /api/dashboard` — KPIs, language chart, activity sparkline
- `GET /api/repos` — filter/sort (`health`, `stars`, `beginner`, `abandoned`)
- `GET /api/repos/{id}` — detail + health breakdown
- `GET /api/repos/{id}/fork-tree` — recursive CTE
- `GET /api/contributors` — ranked leaderboard
- `GET /api/languages` — popularity
- `GET /api/beginner-friendly` / `GET /api/inactive`
- `GET /api/ingest/status` — whether `GITHUB_TOKEN` is set + last sync (never returns the token)
- `POST /api/ingest` — starts background sync; header `X-Admin-Token`; poll `GET /api/sync-runs/{id}`
- `GET /api/sync-runs` / `GET /api/sync-runs/{id}` — sync history and live progress

### Sample ingest

```bash
# Offline demo data (always works — no GitHub token)
psql postgresql://osint:osint@localhost:5432/github_osint -f sql/seed_demo.sql

# Live GitHub API (recommended with GITHUB_TOKEN set)
cd backend
source .venv/bin/activate   # requires Python 3.12+
python -m app.ingest --repo facebook/react --repo microsoft/vscode --repo pallets/flask --limit 10
python -m app.ingest --seed --limit 15
```

After ingest, procedures recalculate health scores and abandoned flags automatically.

## Re-applying SQL

If you change SQL files after the first Docker volume init:

```bash
chmod +x scripts/apply_sql.sh
./scripts/apply_sql.sh
```

Or reset the database volume entirely (re-seeds on first boot):

```bash
docker compose down -v
docker compose up --build
```

## Societal impact

- Students find active, beginner-friendly open-source projects
- Developers compare library health before adopting dependencies
- Organizations assess maintenance risk (abandoned / inactive detection)
- Recruiters explore contributor activity rankings

## License

Educational / course project — use publicly available GitHub API data only and respect [GitHub API terms](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service).
