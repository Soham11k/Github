-- GitHub Open Source Intelligence Database
-- Core normalized schema

CREATE TABLE IF NOT EXISTS organizations (
    org_id          BIGINT PRIMARY KEY,
    login           VARCHAR(255) NOT NULL UNIQUE,
    name            VARCHAR(512),
    html_url        TEXT,
    description     TEXT,
    created_at      TIMESTAMPTZ,
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contributors (
    contributor_id  BIGINT PRIMARY KEY,
    login           VARCHAR(255) NOT NULL UNIQUE,
    type            VARCHAR(50) NOT NULL DEFAULT 'User',
    html_url        TEXT,
    avatar_url      TEXT,
    followers       INTEGER NOT NULL DEFAULT 0,
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS repositories (
    repo_id             BIGINT PRIMARY KEY,
    org_id              BIGINT REFERENCES organizations(org_id) ON DELETE SET NULL,
    owner_login         VARCHAR(255) NOT NULL,
    name                VARCHAR(255) NOT NULL,
    full_name           VARCHAR(512) NOT NULL UNIQUE,
    description         TEXT,
    html_url            TEXT,
    default_branch      VARCHAR(255),
    language_primary    VARCHAR(128),
    stars               INTEGER NOT NULL DEFAULT 0,
    forks_count         INTEGER NOT NULL DEFAULT 0,
    open_issues_count   INTEGER NOT NULL DEFAULT 0,
    watchers_count      INTEGER NOT NULL DEFAULT 0,
    size_kb             INTEGER NOT NULL DEFAULT 0,
    is_fork             BOOLEAN NOT NULL DEFAULT FALSE,
    is_archived         BOOLEAN NOT NULL DEFAULT FALSE,
    is_abandoned        BOOLEAN NOT NULL DEFAULT FALSE,
    parent_repo_id      BIGINT REFERENCES repositories(repo_id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ,
    pushed_at           TIMESTAMPTZ,
    last_activity_at    TIMESTAMPTZ,
    health_score        NUMERIC(5, 2) NOT NULL DEFAULT 0,
    commit_count_cache  INTEGER NOT NULL DEFAULT 0,
    contributor_count_cache INTEGER NOT NULL DEFAULT 0,
    -- 'full' = live ingest; 'stub' = lightweight fork/parent row for tree demos only
    sync_depth          VARCHAR(16) NOT NULL DEFAULT 'full',
    synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Written only by full sync_repository; procedures may bump synced_at without a full ingest
    last_full_sync_at   TIMESTAMPTZ,
    CONSTRAINT uq_repo_owner_name UNIQUE (owner_login, name)
);

CREATE TABLE IF NOT EXISTS languages (
    language_id     SERIAL PRIMARY KEY,
    name            VARCHAR(128) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS repo_languages (
    repo_id         BIGINT NOT NULL REFERENCES repositories(repo_id) ON DELETE CASCADE,
    language_id     INTEGER NOT NULL REFERENCES languages(language_id) ON DELETE CASCADE,
    bytes           BIGINT NOT NULL DEFAULT 0,
    share_pct       NUMERIC(6, 3) NOT NULL DEFAULT 0,
    PRIMARY KEY (repo_id, language_id)
);

CREATE TABLE IF NOT EXISTS repo_contributors (
    repo_id             BIGINT NOT NULL REFERENCES repositories(repo_id) ON DELETE CASCADE,
    contributor_id      BIGINT NOT NULL REFERENCES contributors(contributor_id) ON DELETE CASCADE,
    contributions       INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (repo_id, contributor_id)
);

CREATE TABLE IF NOT EXISTS commits (
    commit_id       BIGSERIAL PRIMARY KEY,
    repo_id         BIGINT NOT NULL REFERENCES repositories(repo_id) ON DELETE CASCADE,
    sha             CHAR(40) NOT NULL,
    contributor_id  BIGINT REFERENCES contributors(contributor_id) ON DELETE SET NULL,
    message         TEXT,
    committed_at    TIMESTAMPTZ,
    parent_sha      CHAR(40),
    html_url        TEXT,
    CONSTRAINT uq_commit_repo_sha UNIQUE (repo_id, sha)
);

CREATE TABLE IF NOT EXISTS issues (
    issue_id            BIGSERIAL PRIMARY KEY,
    repo_id             BIGINT NOT NULL REFERENCES repositories(repo_id) ON DELETE CASCADE,
    number              INTEGER NOT NULL,
    title               TEXT,
    state               VARCHAR(32) NOT NULL DEFAULT 'open',
    author_id           BIGINT REFERENCES contributors(contributor_id) ON DELETE SET NULL,
    is_pull_request     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ,
    closed_at           TIMESTAMPTZ,
    html_url            TEXT,
    CONSTRAINT uq_issue_repo_number UNIQUE (repo_id, number)
);

CREATE TABLE IF NOT EXISTS issue_labels (
    issue_id        BIGINT NOT NULL REFERENCES issues(issue_id) ON DELETE CASCADE,
    label           VARCHAR(255) NOT NULL,
    PRIMARY KEY (issue_id, label)
);

CREATE TABLE IF NOT EXISTS pull_requests (
    pr_id               BIGSERIAL PRIMARY KEY,
    repo_id             BIGINT NOT NULL REFERENCES repositories(repo_id) ON DELETE CASCADE,
    number              INTEGER NOT NULL,
    title               TEXT,
    state               VARCHAR(32) NOT NULL DEFAULT 'open',
    author_id           BIGINT REFERENCES contributors(contributor_id) ON DELETE SET NULL,
    is_merged           BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ,
    closed_at           TIMESTAMPTZ,
    merged_at           TIMESTAMPTZ,
    additions           INTEGER,
    deletions           INTEGER,
    changed_files       INTEGER,
    html_url            TEXT,
    CONSTRAINT uq_pr_repo_number UNIQUE (repo_id, number)
);

CREATE TABLE IF NOT EXISTS sync_runs (
    sync_id         BIGSERIAL PRIMARY KEY,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at     TIMESTAMPTZ,
    status          VARCHAR(32) NOT NULL DEFAULT 'running',
    query_used      TEXT,
    repos_synced    INTEGER NOT NULL DEFAULT 0,
    repos_requested INTEGER NOT NULL DEFAULT 0,
    error_message   TEXT
);

-- Idempotent upgrades for existing local databases
ALTER TABLE pull_requests ALTER COLUMN additions DROP NOT NULL;
ALTER TABLE pull_requests ALTER COLUMN deletions DROP NOT NULL;
ALTER TABLE pull_requests ALTER COLUMN changed_files DROP NOT NULL;
ALTER TABLE pull_requests ALTER COLUMN additions DROP DEFAULT;
ALTER TABLE pull_requests ALTER COLUMN deletions DROP DEFAULT;
ALTER TABLE pull_requests ALTER COLUMN changed_files DROP DEFAULT;
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS repos_requested INTEGER NOT NULL DEFAULT 0;
ALTER TABLE repositories ADD COLUMN IF NOT EXISTS sync_depth VARCHAR(16) NOT NULL DEFAULT 'full';
ALTER TABLE repositories ADD COLUMN IF NOT EXISTS last_full_sync_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS audit_log (
    audit_id        BIGSERIAL PRIMARY KEY,
    table_name      VARCHAR(128) NOT NULL,
    record_id       TEXT NOT NULL,
    action          VARCHAR(16) NOT NULL,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    details         JSONB
);

-- App accounts (GitHub OAuth), watchlists, ingest queue, alerts
CREATE TABLE IF NOT EXISTS app_users (
    user_id         BIGSERIAL PRIMARY KEY,
    github_id       BIGINT NOT NULL UNIQUE,
    login           VARCHAR(255) NOT NULL,
    avatar_url      TEXT,
    is_admin        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS watchlist (
    user_id                 BIGINT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
    repo_id                 BIGINT NOT NULL REFERENCES repositories(repo_id) ON DELETE CASCADE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_health        NUMERIC(5, 2),
    last_seen_abandoned     BOOLEAN,
    last_seen_beginner_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, repo_id)
);

CREATE TABLE IF NOT EXISTS ingest_requests (
    request_id      BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
    full_name       VARCHAR(512) NOT NULL,
    status          VARCHAR(32) NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'running', 'done', 'failed')),
    requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ,
    error_message   TEXT,
    repo_id         BIGINT REFERENCES repositories(repo_id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ingest_requests_active_name
    ON ingest_requests (lower(full_name))
    WHERE status IN ('queued', 'running');

CREATE INDEX IF NOT EXISTS idx_ingest_requests_queued
    ON ingest_requests (requested_at)
    WHERE status = 'queued';

CREATE TABLE IF NOT EXISTS alerts (
    alert_id        BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
    repo_id         BIGINT REFERENCES repositories(repo_id) ON DELETE SET NULL,
    kind            VARCHAR(64) NOT NULL,
    details         JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alerts_user_unread
    ON alerts (user_id, created_at DESC)
    WHERE read_at IS NULL;
