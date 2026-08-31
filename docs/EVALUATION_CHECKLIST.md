# Evaluation checklist (5–10 minute demo)

## Setup (1 min)

- [ ] Postgres up; `./scripts/apply_sql.sh --with-seed` (or Docker first boot)
- [ ] API on `:8000`, UI on `:5173`

## SQL (3–4 min)

- [ ] Open [sql/demo_queries.sql](../sql/demo_queries.sql) — run joins, windows, recursive CTE, `CALL sp_refresh_analytics()`
- [ ] Show `EXPLAIN (ANALYZE, BUFFERS)` section (indexes)
- [ ] Point to triggers writing `audit_log`; ingest transaction in `ingest.py`

## Product UI (3–4 min)

- [ ] **Explore** — marketplace KPIs, language chips, collections
- [ ] **Repositories** — filter/sort; select 2–3 → **Compare** radar
- [ ] **Repo detail** — Insights tab health factors + monthly MoM table; Forks tab tree
- [ ] **Organizations** — org rank → drill into repos
- [ ] **People / Good first issues / Unmaintained / Insights**
- [ ] Toggle light/dark theme

## Docs handoff

- [ ] [SQL_FEATURES.md](SQL_FEATURES.md) checklist
- [ ] [HEALTH_SCORE.md](HEALTH_SCORE.md) weights
- [ ] [ARCHITECTURE.md](ARCHITECTURE.md) + [ER_DIAGRAM.md](ER_DIAGRAM.md)
