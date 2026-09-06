-- ============================================================
-- GitHub OSINT — Evaluator demo script (Advanced SQL checklist)
-- Run after seed/ingest:  psql $DATABASE_URL -f sql/demo_queries.sql
-- ============================================================

\echo '=== 1. JOINS: repos + org + top language ==='
SELECT
    r.full_name,
    o.login AS org_login,
    l.name AS top_language,
    rl.share_pct,
    r.stars,
    r.health_score
FROM repositories r
LEFT JOIN organizations o ON o.org_id = r.org_id
LEFT JOIN repo_languages rl ON rl.repo_id = r.repo_id
LEFT JOIN languages l ON l.language_id = rl.language_id
WHERE rl.share_pct = (
    SELECT MAX(rl2.share_pct) FROM repo_languages rl2 WHERE rl2.repo_id = r.repo_id
)
ORDER BY r.stars DESC
LIMIT 15;

\echo '=== 2. WINDOW FUNCTIONS: RANK / LAG on health + monthly MoM ==='
SELECT full_name, health_score, health_rank, peer_commits_30d
FROM v_repo_health
ORDER BY health_rank
LIMIT 10;

SELECT full_name, activity_month, commit_count, commits_mom_delta
FROM v_repo_monthly_activity
WHERE repo_id = (SELECT repo_id FROM repositories ORDER BY stars DESC LIMIT 1)
ORDER BY activity_month;

\echo '=== 3. VIEWS: beginner-friendly / contributor rankings / languages ==='
SELECT full_name, beginner_label_count, health_score FROM v_beginner_friendly LIMIT 10;
SELECT login, contribution_rank, total_contributions FROM v_contributor_rankings LIMIT 10;
SELECT language_name, popularity_rank, total_bytes FROM v_language_popularity LIMIT 10;

\echo '=== 4. RECURSIVE CTE: fork tree + commit ancestry ==='
SELECT * FROM fn_repo_fork_tree(
    (SELECT repo_id FROM repositories WHERE parent_repo_id IS NULL ORDER BY stars DESC LIMIT 1)
);

SELECT * FROM fn_commit_ancestry(
    (SELECT repo_id FROM commits ORDER BY committed_at DESC LIMIT 1),
    (SELECT sha FROM commits ORDER BY committed_at DESC LIMIT 1),
    10
);

\echo '=== 5. STORED PROCEDURES: refresh analytics ==='
CALL sp_refresh_analytics();
SELECT full_name, health_score, is_abandoned FROM repositories ORDER BY health_score DESC LIMIT 8;

\echo '=== 6. HEALTH FACTORS + COMPARE FUNCTION ==='
SELECT full_name, health_score, factor_commit_velocity, factor_contributors, factor_issue_resolution
FROM v_health_factors ORDER BY health_score DESC LIMIT 5;

SELECT * FROM fn_compare_repos(
    ARRAY(SELECT repo_id FROM repositories ORDER BY health_score DESC LIMIT 3)
);

\echo '=== 7. ORG ANALYTICS + SYNC HISTORY ==='
SELECT org_login, repo_count, total_stars, avg_health_score, top_language, org_rank
FROM v_org_analytics ORDER BY org_rank LIMIT 10;

SELECT sync_id, status, repos_synced, duration_seconds, audit_events_during_run
FROM v_sync_history LIMIT 5;

\echo '=== 8. INDEXING: EXPLAIN before/after dropping stars index ==='
\echo '--- BEFORE (with idx_repositories_stars_pushed) ---'
EXPLAIN (ANALYZE, BUFFERS)
SELECT full_name, stars, health_score, pushed_at
FROM repositories
ORDER BY stars DESC, pushed_at DESC NULLS LAST
LIMIT 20;

DROP INDEX IF EXISTS idx_repositories_stars_pushed;

\echo '--- AFTER (index dropped) ---'
EXPLAIN (ANALYZE, BUFFERS)
SELECT full_name, stars, health_score, pushed_at
FROM repositories
ORDER BY stars DESC, pushed_at DESC NULLS LAST
LIMIT 20;

CREATE INDEX IF NOT EXISTS idx_repositories_stars_pushed
    ON repositories (stars DESC, pushed_at DESC);

\echo '=== 8b. MATERIALIZED VIEW: mv_repo_health_summary ==='
SELECT full_name, stars, health_score
FROM mv_repo_health_summary
ORDER BY health_score DESC
LIMIT 10;

\echo '=== 9. TRIGGERS: recent audit_log sample ==='
SELECT table_name, action, record_id, changed_at
FROM audit_log
ORDER BY changed_at DESC
LIMIT 15;

\echo '=== 10. TRANSACTIONS: demonstrated by ingest (per-repo BEGIN/COMMIT) ==='
\echo 'See backend/app/services/ingest.py sync_repository() — conn.transaction()'

\echo '=== 11. READ-ONLY ROLE: osint_ro (SELECT only — grader demo) ==='
\echo 'Connect as: psql -h localhost -d github_osint -U osint_ro  (password osint_ro)'
\echo 'Should succeed: SELECT COUNT(*) FROM repositories;'
\echo 'Should fail:    INSERT INTO languages(name) VALUES (''x'');'
\echo 'Demo script complete.'
