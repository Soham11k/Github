-- Indexes for dashboard and analytics queries

CREATE INDEX IF NOT EXISTS idx_repositories_stars_pushed
    ON repositories (stars DESC, pushed_at DESC);

CREATE INDEX IF NOT EXISTS idx_repositories_health
    ON repositories (health_score DESC);

CREATE INDEX IF NOT EXISTS idx_repositories_abandoned
    ON repositories (is_abandoned, is_archived)
    WHERE is_abandoned = TRUE OR is_archived = TRUE;

CREATE INDEX IF NOT EXISTS idx_repositories_parent
    ON repositories (parent_repo_id)
    WHERE parent_repo_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_repositories_org
    ON repositories (org_id);

CREATE INDEX IF NOT EXISTS idx_commits_repo_committed
    ON commits (repo_id, committed_at DESC);

CREATE INDEX IF NOT EXISTS idx_commits_contributor
    ON commits (contributor_id, committed_at DESC);

CREATE INDEX IF NOT EXISTS idx_commits_parent_sha
    ON commits (repo_id, parent_sha)
    WHERE parent_sha IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_issues_repo_state_closed
    ON issues (repo_id, state, closed_at);

CREATE INDEX IF NOT EXISTS idx_issues_author
    ON issues (author_id);

CREATE INDEX IF NOT EXISTS idx_issue_labels_label
    ON issue_labels (label);

CREATE INDEX IF NOT EXISTS idx_pull_requests_repo_state
    ON pull_requests (repo_id, state, is_merged);

CREATE INDEX IF NOT EXISTS idx_pull_requests_author
    ON pull_requests (author_id);

CREATE INDEX IF NOT EXISTS idx_repo_contributors_contributor
    ON repo_contributors (contributor_id);

CREATE INDEX IF NOT EXISTS idx_repo_languages_language
    ON repo_languages (language_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_changed
    ON audit_log (changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_runs_started
    ON sync_runs (started_at DESC);
