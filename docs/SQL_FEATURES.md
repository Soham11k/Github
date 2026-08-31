# Advanced SQL feature map

Use this checklist during evaluation. Run [sql/demo_queries.sql](../sql/demo_queries.sql) for a guided walkthrough.

| Requirement | Where | Example |
|---|---|---|
| **Normalized schema + FKs** | [sql/schema.sql](../sql/schema.sql) | `repositories.parent_repo_id → repositories.repo_id` |
| **Indexes** | [sql/indexes.sql](../sql/indexes.sql) | `idx_repositories_stars_pushed`, `idx_commits_repo_committed` |
| **Joins** | Views + demo §1 | repos ⋈ orgs ⋈ languages |
| **Views** | [sql/views.sql](../sql/views.sql) | `v_repo_health`, `v_beginner_friendly`, `v_health_factors`, `v_org_analytics` |
| **Window functions** | Views + demo §2 | `RANK()`, `LAG()`, `PERCENT_RANK()`, MoM deltas on `v_repo_monthly_activity` |
| **Recursive CTEs** | [sql/procedures.sql](../sql/procedures.sql) | `fn_repo_fork_tree`, `fn_commit_ancestry` |
| **Stored procedures** | [sql/procedures.sql](../sql/procedures.sql) | `sp_refresh_health_scores`, `sp_mark_abandoned_repos`, `sp_refresh_analytics` |
| **Functions returning tables/JSON** | procedures | `fn_compare_repos`, `fn_generate_repo_report` |
| **Triggers** | [sql/triggers.sql](../sql/triggers.sql) | audit log; bump `last_activity_at`; contributor/commit caches |
| **Transactions** | ingest | `with conn.transaction()` per repo in `ingest.py` |
| **EXPLAIN / indexing** | demo §8 | `EXPLAIN (ANALYZE, BUFFERS)` on stars/health ordering |

## Key views for the UI

- `v_repo_health` — composite score context for search/detail
- `v_health_factors` — per-weight breakdown for charts
- `v_repo_monthly_activity` — 12-month series + MoM `LAG`
- `v_org_analytics` — org leaderboard
- `v_sync_history` — ingest transparency
- `v_beginner_friendly` / `v_inactive_repos` / `v_contributor_rankings` / `v_language_popularity`
