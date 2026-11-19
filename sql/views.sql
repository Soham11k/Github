-- Analytics views using joins and window functions

DROP VIEW IF EXISTS v_beginner_friendly CASCADE;
DROP VIEW IF EXISTS v_inactive_repos CASCADE;
DROP VIEW IF EXISTS v_contributor_rankings CASCADE;
DROP VIEW IF EXISTS v_language_popularity CASCADE;
DROP VIEW IF EXISTS v_repo_health CASCADE;

-- Repository health breakdown + composite score context
CREATE OR REPLACE VIEW v_repo_health AS
WITH commit_stats AS (
    SELECT
        c.repo_id,
        COUNT(*) FILTER (WHERE c.committed_at >= NOW() - INTERVAL '90 days') AS commits_90d,
        COUNT(*) FILTER (WHERE c.committed_at >= NOW() - INTERVAL '30 days') AS commits_30d,
        COUNT(DISTINCT c.contributor_id) AS unique_committers
    FROM commits c
    GROUP BY c.repo_id
),
issue_stats AS (
    SELECT
        i.repo_id,
        COUNT(*) FILTER (WHERE NOT i.is_pull_request) AS total_issues,
        COUNT(*) FILTER (WHERE NOT i.is_pull_request AND i.state = 'closed') AS closed_issues,
        COUNT(*) FILTER (WHERE NOT i.is_pull_request AND i.state = 'open') AS open_issues,
        PERCENTILE_CONT(0.5) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (i.closed_at - i.created_at)) / 86400.0
        ) FILTER (WHERE NOT i.is_pull_request AND i.closed_at IS NOT NULL) AS median_days_to_close
    FROM issues i
    GROUP BY i.repo_id
),
pr_stats AS (
    SELECT
        p.repo_id,
        COUNT(*) AS total_prs,
        COUNT(*) FILTER (WHERE p.is_merged) AS merged_prs,
        COUNT(*) FILTER (WHERE p.state = 'open') AS open_prs
    FROM pull_requests p
    GROUP BY p.repo_id
),
scored AS (
    SELECT
        r.repo_id,
        r.full_name,
        r.owner_login,
        r.name,
        r.html_url,
        r.description,
        r.language_primary,
        r.stars,
        r.forks_count,
        r.is_archived,
        r.is_abandoned,
        r.pushed_at,
        r.last_activity_at,
        r.health_score,
        COALESCE(r.sync_depth, 'full') AS sync_depth,
        COALESCE(cs.commits_90d, 0) AS commits_90d,
        COALESCE(cs.commits_30d, 0) AS commits_30d,
        COALESCE(cs.unique_committers, r.contributor_count_cache, 0) AS unique_contributors,
        COALESCE(iss.total_issues, 0) AS total_issues,
        COALESCE(iss.closed_issues, 0) AS closed_issues,
        COALESCE(iss.open_issues, r.open_issues_count, 0) AS open_issues,
        COALESCE(iss.median_days_to_close, 0) AS median_days_to_close,
        CASE
            WHEN COALESCE(iss.total_issues, 0) = 0 THEN NULL
            ELSE ROUND(iss.closed_issues::NUMERIC / NULLIF(iss.total_issues, 0), 4)
        END AS issue_close_rate,
        COALESCE(pr.total_prs, 0) AS total_prs,
        COALESCE(pr.merged_prs, 0) AS merged_prs,
        CASE
            WHEN COALESCE(pr.total_prs, 0) = 0 THEN NULL
            ELSE ROUND(pr.merged_prs::NUMERIC / NULLIF(pr.total_prs, 0), 4)
        END AS pr_merge_rate,
        EXTRACT(EPOCH FROM (NOW() - COALESCE(r.pushed_at, r.created_at))) / 86400.0 AS days_since_push
    FROM repositories r
    LEFT JOIN commit_stats cs ON cs.repo_id = r.repo_id
    LEFT JOIN issue_stats iss ON iss.repo_id = r.repo_id
    LEFT JOIN pr_stats pr ON pr.repo_id = r.repo_id
    WHERE COALESCE(r.sync_depth, 'full') = 'full'
)
SELECT
    s.*,
    RANK() OVER (ORDER BY s.health_score DESC, s.stars DESC) AS health_rank,
    LAG(s.commits_30d) OVER (PARTITION BY s.language_primary ORDER BY s.stars DESC) AS peer_commits_30d
FROM scored s;

-- Beginner-friendly repositories
CREATE OR REPLACE VIEW v_beginner_friendly AS
SELECT
    h.repo_id,
    h.full_name,
    h.owner_login,
    h.name,
    h.html_url,
    h.description,
    h.language_primary,
    h.stars,
    h.health_score,
    h.commits_30d,
    h.open_issues,
    COUNT(DISTINCT il.issue_id) FILTER (
        WHERE LOWER(il.label) IN ('good first issue', 'good-first-issue', 'help wanted', 'help-wanted', 'beginner', 'easy')
    ) AS beginner_label_count,
    COUNT(DISTINCT i.issue_id) FILTER (
        WHERE i.state = 'open' AND NOT i.is_pull_request
    ) AS open_issue_count
FROM v_repo_health h
JOIN issues i ON i.repo_id = h.repo_id
LEFT JOIN issue_labels il ON il.issue_id = i.issue_id
WHERE h.is_archived = FALSE
  AND h.is_abandoned = FALSE
  AND h.pushed_at >= NOW() - INTERVAL '180 days'
  AND h.health_score >= 40
GROUP BY
    h.repo_id, h.full_name, h.owner_login, h.name, h.html_url, h.description,
    h.language_primary, h.stars, h.health_score, h.commits_30d, h.open_issues
HAVING COUNT(DISTINCT il.issue_id) FILTER (
        WHERE LOWER(il.label) IN ('good first issue', 'good-first-issue', 'help wanted', 'help-wanted', 'beginner', 'easy')
    ) > 0
ORDER BY beginner_label_count DESC, h.health_score DESC;

-- Contributor rankings with window functions
CREATE OR REPLACE VIEW v_contributor_rankings AS
WITH contrib_totals AS (
    SELECT
        contributor_id,
        SUM(contributions) AS total_contributions,
        COUNT(DISTINCT repo_id) AS repo_count
    FROM repo_contributors
    GROUP BY contributor_id
),
recent AS (
    SELECT
        contributor_id,
        COUNT(*) AS recent_commits
    FROM commits
    WHERE committed_at >= NOW() - INTERVAL '90 days'
    GROUP BY contributor_id
),
contrib AS (
    SELECT
        c.contributor_id,
        c.login,
        c.type,
        c.html_url,
        c.avatar_url,
        c.followers,
        COALESCE(ct.total_contributions, 0) AS total_contributions,
        COALESCE(ct.repo_count, 0) AS repo_count,
        COALESCE(r.recent_commits, 0) AS recent_commits
    FROM contributors c
    LEFT JOIN contrib_totals ct ON ct.contributor_id = c.contributor_id
    LEFT JOIN recent r ON r.contributor_id = c.contributor_id
    WHERE c.type <> 'Bot'
)
SELECT
    contributor_id,
    login,
    type,
    html_url,
    avatar_url,
    followers,
    total_contributions,
    repo_count,
    recent_commits,
    RANK() OVER (ORDER BY total_contributions DESC, recent_commits DESC, repo_count DESC) AS contribution_rank,
    PERCENT_RANK() OVER (ORDER BY total_contributions) AS contribution_percentile,
    DENSE_RANK() OVER (ORDER BY recent_commits DESC) AS recent_activity_rank
FROM contrib
WHERE total_contributions > 0 OR recent_commits > 0;

-- Language popularity with trend via LAG
CREATE OR REPLACE VIEW v_language_popularity AS
WITH lang_totals AS (
    SELECT
        l.language_id,
        l.name AS language_name,
        COUNT(DISTINCT rl.repo_id) AS repo_count,
        COALESCE(SUM(rl.bytes), 0) AS total_bytes,
        ROUND(AVG(rl.share_pct), 2) AS avg_share_pct
    FROM languages l
    JOIN repo_languages rl ON rl.language_id = l.language_id
    GROUP BY l.language_id, l.name
),
ranked AS (
    SELECT
        language_id,
        language_name,
        repo_count,
        total_bytes,
        avg_share_pct,
        RANK() OVER (ORDER BY total_bytes DESC) AS popularity_rank,
        LAG(total_bytes) OVER (ORDER BY total_bytes DESC) AS next_lower_bytes
    FROM lang_totals
)
SELECT
    language_id,
    language_name,
    repo_count,
    total_bytes,
    avg_share_pct,
    popularity_rank,
    next_lower_bytes,
    CASE
        WHEN next_lower_bytes IS NULL OR next_lower_bytes = 0 THEN NULL
        ELSE ROUND((total_bytes - next_lower_bytes)::NUMERIC / next_lower_bytes * 100, 2)
    END AS pct_above_next
FROM ranked;

-- Inactive / abandoned repositories
CREATE OR REPLACE VIEW v_inactive_repos AS
SELECT
    r.repo_id,
    r.full_name,
    r.owner_login,
    r.name,
    r.html_url,
    r.description,
    r.language_primary,
    r.stars,
    r.forks_count,
    r.open_issues_count,
    r.is_archived,
    r.is_abandoned,
    r.pushed_at,
    r.last_activity_at,
    r.health_score,
    EXTRACT(EPOCH FROM (NOW() - COALESCE(r.pushed_at, r.created_at))) / 86400.0 AS days_since_push,
    COALESCE((
        SELECT COUNT(*) FROM commits c
        WHERE c.repo_id = r.repo_id
          AND c.committed_at >= NOW() - INTERVAL '180 days'
    ), 0) AS commits_180d
FROM repositories r
WHERE COALESCE(r.sync_depth, 'full') = 'full'
  AND (
       r.is_archived = TRUE
    OR r.is_abandoned = TRUE
    OR COALESCE(r.pushed_at, r.created_at) < NOW() - INTERVAL '180 days'
  )
ORDER BY days_since_push DESC NULLS LAST;

-- Dashboard summary helpers
DROP VIEW IF EXISTS v_health_distribution CASCADE;
DROP VIEW IF EXISTS v_repo_health_position CASCADE;
DROP VIEW IF EXISTS v_repo_issue_flow CASCADE;
DROP VIEW IF EXISTS v_repo_commit_heatmap CASCADE;
DROP VIEW IF EXISTS v_sync_history CASCADE;
DROP VIEW IF EXISTS v_org_analytics CASCADE;
DROP VIEW IF EXISTS v_repo_monthly_activity CASCADE;
DROP VIEW IF EXISTS v_health_factors CASCADE;
DROP VIEW IF EXISTS v_dashboard_kpis CASCADE;
DROP VIEW IF EXISTS v_commit_activity_daily CASCADE;

CREATE OR REPLACE VIEW v_dashboard_kpis AS
SELECT
    (SELECT COUNT(*) FROM repositories WHERE COALESCE(sync_depth, 'full') = 'full') AS repo_count,
    (SELECT COUNT(*) FROM contributors WHERE type <> 'Bot') AS contributor_count,
    (SELECT COUNT(*) FROM commits) AS commit_count,
    (SELECT COUNT(*) FROM issues WHERE NOT is_pull_request) AS issue_count,
    (SELECT COUNT(*) FROM pull_requests) AS pr_count,
    (SELECT COUNT(*) FROM pull_requests WHERE state = 'open') AS open_pr_count,
    (SELECT COUNT(*) FROM languages) AS language_count,
    (SELECT COUNT(*) FROM organizations) AS org_count,
    (SELECT ROUND(AVG(health_score), 2) FROM repositories WHERE COALESCE(sync_depth, 'full') = 'full') AS avg_health_score,
    (SELECT ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY health_score)::NUMERIC, 2)
     FROM repositories WHERE COALESCE(sync_depth, 'full') = 'full') AS median_health_score,
    (SELECT COUNT(*) FROM repositories WHERE is_abandoned AND COALESCE(sync_depth, 'full') = 'full') AS abandoned_count,
    (SELECT COUNT(*) FROM v_beginner_friendly) AS beginner_friendly_count;

CREATE OR REPLACE VIEW v_commit_activity_daily AS
SELECT
    DATE_TRUNC('day', committed_at)::DATE AS activity_date,
    COUNT(*) AS commit_count,
    COUNT(DISTINCT repo_id) AS active_repos,
    COUNT(DISTINCT contributor_id) AS active_contributors
FROM commits
WHERE committed_at >= NOW() - INTERVAL '90 days'
GROUP BY DATE_TRUNC('day', committed_at)::DATE
ORDER BY activity_date;

-- Health factor breakdown (mirrors sp_refresh_health_scores weights)
-- Note: commit velocity uses a pushed_at floor when the ~100-commit ingest sample is empty.
CREATE OR REPLACE VIEW v_health_factors AS
SELECT
    r.repo_id,
    r.full_name,
    r.health_score,
    CASE
        WHEN COALESCE(cs.commits_90d, 0) > 0 THEN LEAST(25, cs.commits_90d * 1.5)
        WHEN r.pushed_at >= NOW() - INTERVAL '30 days' THEN 18
        WHEN r.pushed_at >= NOW() - INTERVAL '90 days' THEN 10
        ELSE 0
    END::NUMERIC(6, 2) AS factor_commit_velocity,
    LEAST(25, 25)::NUMERIC AS factor_commit_velocity_max,
    LEAST(20, COALESCE(NULLIF(cs.unique_committers, 0), r.contributor_count_cache, 0) * 2)::NUMERIC(6, 2) AS factor_contributors,
    LEAST(20, 20)::NUMERIC AS factor_contributors_max,
    CASE
        WHEN COALESCE(iss.total_issues, 0) = 0 THEN 12
        ELSE LEAST(25, (iss.closed_issues::NUMERIC / NULLIF(iss.total_issues, 0)) * 25)
    END::NUMERIC(6, 2) AS factor_issue_resolution,
    25::NUMERIC AS factor_issue_resolution_max,
    CASE
        WHEN iss.median_days_to_close IS NULL THEN 5
        WHEN iss.median_days_to_close <= 7 THEN 10
        WHEN iss.median_days_to_close <= 30 THEN 7
        WHEN iss.median_days_to_close <= 90 THEN 4
        ELSE 1
    END::NUMERIC(6, 2) AS factor_time_to_close,
    10::NUMERIC AS factor_time_to_close_max,
    CASE
        WHEN COALESCE(pr.total_prs, 0) = 0 THEN 7
        ELSE LEAST(15, (pr.merged_prs::NUMERIC / NULLIF(pr.total_prs, 0)) * 15)
    END::NUMERIC(6, 2) AS factor_pr_merge,
    15::NUMERIC AS factor_pr_merge_max,
    CASE
        WHEN r.pushed_at IS NULL THEN 0
        WHEN r.pushed_at >= NOW() - INTERVAL '14 days' THEN 10
        WHEN r.pushed_at >= NOW() - INTERVAL '30 days' THEN 7
        WHEN r.pushed_at >= NOW() - INTERVAL '90 days' THEN 4
        WHEN r.pushed_at >= NOW() - INTERVAL '180 days' THEN 1
        ELSE -15
    END::NUMERIC(6, 2) AS factor_recency,
    10::NUMERIC AS factor_recency_max,
    CASE WHEN r.is_archived THEN 30 ELSE 0 END::NUMERIC(6, 2) AS factor_archived_penalty,
    COALESCE(cs.commits_90d, 0) AS commits_90d,
    COALESCE(NULLIF(cs.unique_committers, 0), r.contributor_count_cache, 0) AS unique_committers,
    COALESCE(iss.total_issues, 0) AS total_issues,
    COALESCE(iss.closed_issues, 0) AS closed_issues,
    iss.median_days_to_close,
    COALESCE(pr.total_prs, 0) AS total_prs,
    COALESCE(pr.merged_prs, 0) AS merged_prs
FROM repositories r
LEFT JOIN LATERAL (
    SELECT
        COUNT(*) FILTER (WHERE c.committed_at >= NOW() - INTERVAL '90 days') AS commits_90d,
        COUNT(DISTINCT c.contributor_id) AS unique_committers
    FROM commits c
    WHERE c.repo_id = r.repo_id
) cs ON TRUE
LEFT JOIN LATERAL (
    SELECT
        COUNT(*) FILTER (WHERE NOT i.is_pull_request) AS total_issues,
        COUNT(*) FILTER (WHERE NOT i.is_pull_request AND i.state = 'closed') AS closed_issues,
        PERCENTILE_CONT(0.5) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (i.closed_at - i.created_at)) / 86400.0
        ) FILTER (WHERE NOT i.is_pull_request AND i.closed_at IS NOT NULL) AS median_days_to_close
    FROM issues i
    WHERE i.repo_id = r.repo_id
) iss ON TRUE
LEFT JOIN LATERAL (
    SELECT
        COUNT(*) AS total_prs,
        COUNT(*) FILTER (WHERE p.is_merged) AS merged_prs
    FROM pull_requests p
    WHERE p.repo_id = r.repo_id
) pr ON TRUE
WHERE COALESCE(r.sync_depth, 'full') = 'full';

-- Monthly activity with MoM LAG deltas
CREATE OR REPLACE VIEW v_repo_monthly_activity AS
WITH months AS (
    SELECT
        r.repo_id,
        r.full_name,
        gs.month_start
    FROM repositories r
    CROSS JOIN LATERAL generate_series(
        DATE_TRUNC('month', NOW() - INTERVAL '11 months'),
        DATE_TRUNC('month', NOW()),
        INTERVAL '1 month'
    ) AS gs(month_start)
    WHERE COALESCE(r.sync_depth, 'full') = 'full'
),
counts AS (
    SELECT
        m.repo_id,
        m.full_name,
        m.month_start::DATE AS activity_month,
        COALESCE((
            SELECT COUNT(*) FROM commits c
            WHERE c.repo_id = m.repo_id
              AND DATE_TRUNC('month', c.committed_at) = m.month_start
        ), 0) AS commit_count,
        COALESCE((
            SELECT COUNT(*) FROM issues i
            WHERE i.repo_id = m.repo_id
              AND NOT i.is_pull_request
              AND DATE_TRUNC('month', i.created_at) = m.month_start
        ), 0) AS issue_count,
        COALESCE((
            SELECT COUNT(*) FROM pull_requests p
            WHERE p.repo_id = m.repo_id
              AND DATE_TRUNC('month', p.created_at) = m.month_start
        ), 0) AS pr_count
    FROM months m
)
SELECT
    repo_id,
    full_name,
    activity_month,
    commit_count,
    issue_count,
    pr_count,
    commit_count - LAG(commit_count) OVER (PARTITION BY repo_id ORDER BY activity_month) AS commits_mom_delta,
    issue_count - LAG(issue_count) OVER (PARTITION BY repo_id ORDER BY activity_month) AS issues_mom_delta,
    pr_count - LAG(pr_count) OVER (PARTITION BY repo_id ORDER BY activity_month) AS prs_mom_delta
FROM counts
ORDER BY repo_id, activity_month;

-- Organization analytics
CREATE OR REPLACE VIEW v_org_analytics AS
WITH org_repos AS (
    SELECT
        o.org_id,
        o.login AS org_login,
        o.name AS org_name,
        o.html_url,
        o.description,
        COUNT(r.repo_id) AS repo_count,
        COALESCE(SUM(r.stars), 0) AS total_stars,
        ROUND(AVG(r.health_score), 2) AS avg_health_score,
        COUNT(*) FILTER (WHERE r.is_abandoned) AS abandoned_count,
        COUNT(*) FILTER (WHERE r.is_archived) AS archived_count,
        MODE() WITHIN GROUP (ORDER BY r.language_primary)
            FILTER (WHERE r.language_primary IS NOT NULL) AS top_language
    FROM organizations o
    LEFT JOIN repositories r
      ON r.org_id = o.org_id
     AND COALESCE(r.sync_depth, 'full') = 'full'
    GROUP BY o.org_id, o.login, o.name, o.html_url, o.description
)
SELECT
    org_id,
    org_login,
    org_name,
    html_url,
    description,
    repo_count,
    total_stars,
    avg_health_score,
    abandoned_count,
    archived_count,
    CASE WHEN repo_count = 0 THEN 0
         ELSE ROUND(abandoned_count::NUMERIC / repo_count * 100, 1)
    END AS abandoned_share_pct,
    top_language,
    RANK() OVER (ORDER BY total_stars DESC, avg_health_score DESC NULLS LAST) AS org_rank
FROM org_repos
WHERE repo_count > 0;

-- Sync / audit transparency
CREATE OR REPLACE VIEW v_sync_history AS
SELECT
    s.sync_id,
    s.started_at,
    s.finished_at,
    s.status,
    s.query_used,
    s.repos_synced,
    s.repos_requested,
    s.error_message,
    EXTRACT(EPOCH FROM (COALESCE(s.finished_at, NOW()) - s.started_at)) AS duration_seconds,
    (
        SELECT COUNT(*) FROM audit_log a
        WHERE a.changed_at BETWEEN s.started_at AND COALESCE(s.finished_at, NOW() + INTERVAL '1 minute')
    ) AS audit_events_during_run
FROM sync_runs s
ORDER BY s.started_at DESC;

-- Commit punch card: weekday (ISO 1=Mon..7=Sun) × hour of day (UTC)
CREATE OR REPLACE VIEW v_repo_commit_heatmap AS
SELECT
    c.repo_id,
    EXTRACT(ISODOW FROM c.committed_at AT TIME ZONE 'UTC')::SMALLINT AS weekday,
    EXTRACT(HOUR FROM c.committed_at AT TIME ZONE 'UTC')::SMALLINT AS hour_of_day,
    COUNT(*)::BIGINT AS commit_count
FROM commits c
WHERE c.committed_at IS NOT NULL
GROUP BY c.repo_id, weekday, hour_of_day;

-- Monthly issue/PR flow with open backlog (created before month end, not closed by then)
CREATE OR REPLACE VIEW v_repo_issue_flow AS
WITH months AS (
    SELECT
        r.repo_id,
        r.full_name,
        gs.month_start,
        (gs.month_start + INTERVAL '1 month') AS month_end
    FROM repositories r
    CROSS JOIN LATERAL generate_series(
        DATE_TRUNC('month', NOW() - INTERVAL '11 months'),
        DATE_TRUNC('month', NOW()),
        INTERVAL '1 month'
    ) AS gs(month_start)
    WHERE COALESCE(r.sync_depth, 'full') = 'full'
)
SELECT
    m.repo_id,
    m.full_name,
    m.month_start::DATE AS activity_month,
    COALESCE(iss.issues_opened, 0) AS issues_opened,
    COALESCE(iss.issues_closed, 0) AS issues_closed,
    COALESCE(iss.open_issue_backlog, 0) AS open_issue_backlog,
    COALESCE(pr.prs_opened, 0) AS prs_opened,
    COALESCE(pr.prs_merged, 0) AS prs_merged
FROM months m
LEFT JOIN LATERAL (
    SELECT
        COUNT(*) FILTER (
            WHERE NOT i.is_pull_request
              AND DATE_TRUNC('month', i.created_at) = m.month_start
        ) AS issues_opened,
        COUNT(*) FILTER (
            WHERE NOT i.is_pull_request
              AND i.closed_at IS NOT NULL
              AND DATE_TRUNC('month', i.closed_at) = m.month_start
        ) AS issues_closed,
        COUNT(*) FILTER (
            WHERE NOT i.is_pull_request
              AND i.created_at < m.month_end
              AND (i.closed_at IS NULL OR i.closed_at >= m.month_end)
        ) AS open_issue_backlog
    FROM issues i
    WHERE i.repo_id = m.repo_id
) iss ON TRUE
LEFT JOIN LATERAL (
    SELECT
        COUNT(*) FILTER (
            WHERE DATE_TRUNC('month', p.created_at) = m.month_start
        ) AS prs_opened,
        COUNT(*) FILTER (
            WHERE p.is_merged
              AND p.merged_at IS NOT NULL
              AND DATE_TRUNC('month', p.merged_at) = m.month_start
        ) AS prs_merged
    FROM pull_requests p
    WHERE p.repo_id = m.repo_id
) pr ON TRUE
ORDER BY m.repo_id, activity_month;

-- Per-repo health bucket + percentile among full-depth repos
CREATE OR REPLACE VIEW v_repo_health_position AS
SELECT
    r.repo_id,
    r.full_name,
    r.health_score,
    LEAST(GREATEST(WIDTH_BUCKET(r.health_score, 0, 100, 10), 1), 10) AS health_bucket,
    PERCENT_RANK() OVER (ORDER BY r.health_score) AS health_percentile
FROM repositories r
WHERE COALESCE(r.sync_depth, 'full') = 'full';

-- Health score histogram (10 buckets of width 10); empty buckets return 0
CREATE OR REPLACE VIEW v_health_distribution AS
SELECT
    b.bucket AS health_bucket,
    (b.bucket - 1) * 10 AS bucket_low,
    b.bucket * 10 AS bucket_high,
    COALESCE(COUNT(p.repo_id), 0)::BIGINT AS repo_count
FROM generate_series(1, 10) AS b(bucket)
LEFT JOIN v_repo_health_position p ON p.health_bucket = b.bucket
GROUP BY b.bucket
ORDER BY b.bucket;

-- Materialized health summary (refreshed by sp_refresh_analytics)
DROP MATERIALIZED VIEW IF EXISTS mv_repo_health_summary;
CREATE MATERIALIZED VIEW mv_repo_health_summary AS
SELECT
    r.repo_id,
    r.full_name,
    r.owner_login,
    r.language_primary,
    r.stars,
    r.health_score,
    r.is_abandoned,
    r.is_archived,
    r.pushed_at,
    r.last_activity_at
FROM repositories r
WHERE COALESCE(r.sync_depth, 'full') = 'full'
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_repo_health_summary_repo
    ON mv_repo_health_summary (repo_id);
CREATE INDEX IF NOT EXISTS idx_mv_repo_health_summary_health
    ON mv_repo_health_summary (health_score DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'osint') THEN
    EXECUTE 'ALTER MATERIALIZED VIEW mv_repo_health_summary OWNER TO osint';
  END IF;
END $$;
