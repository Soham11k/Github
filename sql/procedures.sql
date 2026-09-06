-- Stored procedures / functions for health scoring and reports
--
-- Health score weights (must match v_health_factors):
--   commit velocity     0–25  (sampled commits_90d × 1.5, OR push-activity floor)
--   unique contributors 0–20  (2 pts each, capped; uses contributor_count_cache)
--   issue resolution    0–25  (close rate × 25; default 12 if no issues)
--   median time-to-close 0–10 (faster close = higher)
--   PR merge rate       0–15  (merge rate × 15; default 7 if no PRs)
--   recency             -15–10 (GitHub pushed_at — trusted even when samples are thin)
--   archived            −30
-- Final score clamped to [0, 100].
--
-- Ingest sample note: live sync stores ~latest 100 commits / issues / PRs per repo.
-- Mega-repos therefore under-count velocity; we use pushed_at floors so active
-- projects are not scored as abandoned.

-- Refresh repository health scores
CREATE OR REPLACE PROCEDURE sp_refresh_health_scores()
LANGUAGE plpgsql
AS $$
BEGIN
    -- Explicit transaction boundary for course demonstration
    -- CALL wraps this; nested BEGIN starts a subtransaction block
    UPDATE repositories r
    SET health_score = sub.score,
        synced_at = NOW()
    FROM (
        SELECT
            r2.repo_id,
            LEAST(100, GREATEST(0, ROUND((
                -- Commit velocity (0-25): sampled commits, else recent-push floor
                CASE
                    WHEN COALESCE(cs.commits_90d, 0) > 0
                        THEN LEAST(25, cs.commits_90d * 1.5)
                    WHEN r2.pushed_at >= NOW() - INTERVAL '30 days' THEN 18
                    WHEN r2.pushed_at >= NOW() - INTERVAL '90 days' THEN 10
                    ELSE 0
                END
                -- Unique contributors (0-20)
                + LEAST(20, COALESCE(NULLIF(cs.unique_committers, 0), r2.contributor_count_cache, 0) * 2)
                -- Issue resolution (0-25)
                + CASE
                    WHEN COALESCE(iss.total_issues, 0) = 0 THEN 12
                    ELSE LEAST(25, (iss.closed_issues::NUMERIC / NULLIF(iss.total_issues, 0)) * 25)
                  END
                -- Median time-to-close bonus/penalty (0-10)
                + CASE
                    WHEN iss.median_days_to_close IS NULL THEN 5
                    WHEN iss.median_days_to_close <= 7 THEN 10
                    WHEN iss.median_days_to_close <= 30 THEN 7
                    WHEN iss.median_days_to_close <= 90 THEN 4
                    ELSE 1
                  END
                -- PR merge rate (0-15)
                + CASE
                    WHEN COALESCE(pr.total_prs, 0) = 0 THEN 7
                    ELSE LEAST(15, (pr.merged_prs::NUMERIC / NULLIF(pr.total_prs, 0)) * 15)
                  END
                -- Recency from GitHub pushed_at (-15..10) — primary signal for mega-repos
                + CASE
                    WHEN r2.pushed_at IS NULL THEN 0
                    WHEN r2.pushed_at >= NOW() - INTERVAL '14 days' THEN 10
                    WHEN r2.pushed_at >= NOW() - INTERVAL '30 days' THEN 7
                    WHEN r2.pushed_at >= NOW() - INTERVAL '90 days' THEN 4
                    WHEN r2.pushed_at >= NOW() - INTERVAL '180 days' THEN 1
                    ELSE -15
                  END
                -- Archived penalty
                - CASE WHEN r2.is_archived THEN 30 ELSE 0 END
            )::NUMERIC, 2))) AS score
        FROM repositories r2
        LEFT JOIN LATERAL (
            SELECT
                COUNT(*) FILTER (WHERE c.committed_at >= NOW() - INTERVAL '90 days') AS commits_90d,
                COUNT(DISTINCT c.contributor_id) AS unique_committers
            FROM commits c
            WHERE c.repo_id = r2.repo_id
        ) cs ON TRUE
        LEFT JOIN LATERAL (
            SELECT
                COUNT(*) FILTER (WHERE NOT i.is_pull_request) AS total_issues,
                COUNT(*) FILTER (WHERE NOT i.is_pull_request AND i.state = 'closed') AS closed_issues,
                PERCENTILE_CONT(0.5) WITHIN GROUP (
                    ORDER BY EXTRACT(EPOCH FROM (i.closed_at - i.created_at)) / 86400.0
                ) FILTER (WHERE NOT i.is_pull_request AND i.closed_at IS NOT NULL) AS median_days_to_close
            FROM issues i
            WHERE i.repo_id = r2.repo_id
        ) iss ON TRUE
        LEFT JOIN LATERAL (
            SELECT
                COUNT(*) AS total_prs,
                COUNT(*) FILTER (WHERE p.is_merged) AS merged_prs
            FROM pull_requests p
            WHERE p.repo_id = r2.repo_id
        ) pr ON TRUE
    ) sub
    WHERE r.repo_id = sub.repo_id
      AND COALESCE(r.sync_depth, 'full') = 'full';
END;
$$;

-- Mark abandoned / inactive repositories
-- Primary signal is GitHub pushed_at (not the thin commit sample).
-- Stub fork/parent rows are excluded from abandonment analytics.
CREATE OR REPLACE PROCEDURE sp_mark_abandoned_repos(days_inactive INTEGER DEFAULT 180)
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE repositories
    SET is_abandoned = TRUE,
        synced_at = NOW()
    WHERE COALESCE(sync_depth, 'full') = 'full'
      AND is_archived = FALSE
      AND COALESCE(pushed_at, created_at) < NOW() - make_interval(days => days_inactive)
      AND NOT EXISTS (
          SELECT 1 FROM commits c
          WHERE c.repo_id = repositories.repo_id
            AND c.committed_at >= NOW() - make_interval(days => days_inactive)
      );

    -- Clear abandoned flag if GitHub push or sampled commits resumed
    UPDATE repositories
    SET is_abandoned = FALSE,
        synced_at = NOW()
    WHERE is_abandoned = TRUE
      AND COALESCE(sync_depth, 'full') = 'full'
      AND (
          pushed_at >= NOW() - make_interval(days => days_inactive)
          OR EXISTS (
              SELECT 1 FROM commits c
              WHERE c.repo_id = repositories.repo_id
                AND c.committed_at >= NOW() - make_interval(days => days_inactive)
          )
      );
END;
$$;

-- Combined refresh used after ingest
CREATE OR REPLACE PROCEDURE sp_refresh_analytics()
LANGUAGE plpgsql
AS $$
BEGIN
    CALL sp_refresh_health_scores();
    CALL sp_mark_abandoned_repos(180);
    -- Plain REFRESH (safe inside CALL / client transactions; CONCURRENTLY is not)
    BEGIN
        REFRESH MATERIALIZED VIEW mv_repo_health_summary;
    EXCEPTION
        WHEN undefined_table THEN
            NULL;
    END;
END;
$$;

-- Recursive CTE: fork lineage for a repository
CREATE OR REPLACE FUNCTION fn_repo_fork_tree(p_repo_id BIGINT)
RETURNS TABLE (
    repo_id BIGINT,
    full_name VARCHAR,
    parent_repo_id BIGINT,
    depth INTEGER,
    stars INTEGER,
    health_score NUMERIC
)
LANGUAGE sql
STABLE
AS $$
    WITH RECURSIVE fork_tree AS (
        SELECT
            r.repo_id,
            r.full_name,
            r.parent_repo_id,
            0 AS depth,
            r.stars,
            r.health_score
        FROM repositories r
        WHERE r.repo_id = p_repo_id

        UNION ALL

        SELECT
            child.repo_id,
            child.full_name,
            child.parent_repo_id,
            ft.depth + 1,
            child.stars,
            child.health_score
        FROM repositories child
        JOIN fork_tree ft ON child.parent_repo_id = ft.repo_id
        WHERE ft.depth < 20
    )
    SELECT * FROM fork_tree
    ORDER BY depth, stars DESC;
$$;

-- Recursive CTE: walk commit ancestry via parent_sha
CREATE OR REPLACE FUNCTION fn_commit_ancestry(p_repo_id BIGINT, p_sha CHAR(40), p_max_depth INTEGER DEFAULT 50)
RETURNS TABLE (
    sha CHAR(40),
    parent_sha CHAR(40),
    committed_at TIMESTAMPTZ,
    contributor_id BIGINT,
    message TEXT,
    depth INTEGER
)
LANGUAGE sql
STABLE
AS $$
    WITH RECURSIVE ancestry AS (
        SELECT
            c.sha,
            c.parent_sha,
            c.committed_at,
            c.contributor_id,
            c.message,
            0 AS depth
        FROM commits c
        WHERE c.repo_id = p_repo_id AND c.sha = p_sha

        UNION ALL

        SELECT
            p.sha,
            p.parent_sha,
            p.committed_at,
            p.contributor_id,
            p.message,
            a.depth + 1
        FROM commits p
        JOIN ancestry a ON p.sha = a.parent_sha AND p.repo_id = p_repo_id
        WHERE a.depth < p_max_depth
          AND a.parent_sha IS NOT NULL
    )
    SELECT * FROM ancestry
    ORDER BY depth;
$$;

-- Simple report generator returning a JSON summary
CREATE OR REPLACE FUNCTION fn_generate_repo_report(p_repo_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'repo_id', h.repo_id,
        'full_name', h.full_name,
        'health_score', h.health_score,
        'health_rank', h.health_rank,
        'stars', h.stars,
        'commits_90d', h.commits_90d,
        'unique_contributors', h.unique_contributors,
        'issue_close_rate', h.issue_close_rate,
        'pr_merge_rate', h.pr_merge_rate,
        'days_since_push', h.days_since_push,
        'is_abandoned', h.is_abandoned,
        'is_archived', h.is_archived
    )
    INTO result
    FROM v_repo_health h
    WHERE h.repo_id = p_repo_id;

    RETURN COALESCE(result, '{}'::jsonb);
END;
$$;

-- Side-by-side compare for 2–3 repositories (Compare UI)
CREATE OR REPLACE FUNCTION fn_compare_repos(p_repo_ids BIGINT[])
RETURNS TABLE (
    repo_id BIGINT,
    full_name VARCHAR,
    stars INTEGER,
    health_score NUMERIC,
    health_rank BIGINT,
    language_primary VARCHAR,
    commits_90d BIGINT,
    commits_30d BIGINT,
    unique_contributors BIGINT,
    issue_close_rate NUMERIC,
    pr_merge_rate NUMERIC,
    open_issues BIGINT,
    days_since_push DOUBLE PRECISION,
    is_abandoned BOOLEAN,
    is_archived BOOLEAN,
    factor_commit_velocity NUMERIC,
    factor_contributors NUMERIC,
    factor_issue_resolution NUMERIC,
    factor_time_to_close NUMERIC,
    factor_pr_merge NUMERIC,
    factor_recency NUMERIC,
    factor_archived_penalty NUMERIC
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        h.repo_id,
        h.full_name,
        h.stars,
        h.health_score,
        h.health_rank,
        h.language_primary,
        h.commits_90d,
        h.commits_30d,
        h.unique_contributors,
        h.issue_close_rate,
        h.pr_merge_rate,
        h.open_issues,
        h.days_since_push,
        h.is_abandoned,
        h.is_archived,
        f.factor_commit_velocity,
        f.factor_contributors,
        f.factor_issue_resolution,
        f.factor_time_to_close,
        f.factor_pr_merge,
        f.factor_recency,
        f.factor_archived_penalty
    FROM v_repo_health h
    JOIN v_health_factors f ON f.repo_id = h.repo_id
    WHERE h.repo_id = ANY (p_repo_ids)
    ORDER BY array_position(p_repo_ids, h.repo_id);
$$;
