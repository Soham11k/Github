# Architecture

## System overview

```mermaid
flowchart LR
  GitHubAPI["GitHub REST API"]
  Ingest["Python ingest CLI"]
  PG["PostgreSQL 16"]
  API["FastAPI"]
  UI["React + Primer + Chart.js"]

  GitHubAPI --> Ingest
  Ingest -->|"per-repo transactions"| PG
  PG -->|"views / procedures / CTEs"| API
  API --> UI
```

## Layers

1. **Ingest** ([backend/app/services/ingest.py](../backend/app/services/ingest.py)) — fetches repo metadata, contributors, commits, issues, PRs, languages; writes inside `conn.transaction()` so a failed repo rolls back cleanly.
2. **Database** (`sql/`) — normalized schema, indexes, triggers (audit + denormalized caches), views for dashboards, stored procedures for health/abandoned refresh, recursive functions for fork trees and commit ancestry.
3. **API** ([backend/app/routers/api.py](../backend/app/routers/api.py)) — thin FastAPI layer that `SELECT`s from views / calls SQL functions. Analytics are not reimplemented in Python.
4. **UI** (`frontend/`) — GitHub-like Primer React shell: Explore marketplace, search, compare, orgs, people, insights.

## Data flow (one repository sync)

```mermaid
sequenceDiagram
  participant CLI as Ingest CLI
  participant GH as GitHub API
  participant DB as PostgreSQL

  CLI->>GH: GET /repos/{owner}/{repo}
  CLI->>GH: contributors, commits, issues, pulls, languages
  CLI->>DB: BEGIN
  CLI->>DB: upsert org, contributors, repo, children
  Note over DB: triggers update audit_log and caches
  CLI->>DB: COMMIT
  CLI->>DB: CALL sp_refresh_analytics()
```

## Why SQL stays central

Course requirements (joins, windows, recursive CTEs, procedures, triggers, transactions, indexes) are exercised on real GitHub-shaped data and exposed through stable view contracts so the frontend never embeds scoring logic.
