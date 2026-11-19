-- Expanded demo seed (~12 repos, multi-language, 90+ day history)
-- Safe to re-run: uses fixed high IDs and ON CONFLICT

BEGIN;

INSERT INTO organizations (org_id, login, name, html_url, description, created_at) VALUES
  (900001, 'demo-org', 'Demo Organization', 'https://github.com/demo-org', 'Sample org for OSINT demos', NOW() - INTERVAL '5 years'),
  (900002, 'acme-labs', 'Acme Labs', 'https://github.com/acme-labs', 'Polyglot open-source lab', NOW() - INTERVAL '4 years'),
  (900003, 'northwind-oss', 'Northwind OSS', 'https://github.com/northwind-oss', 'Enterprise-friendly OSS', NOW() - INTERVAL '6 years')
ON CONFLICT (org_id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;

INSERT INTO contributors (contributor_id, login, type, html_url, avatar_url, followers) VALUES
  (910001, 'alice-dev', 'User', 'https://github.com/alice-dev', NULL, 1200),
  (910002, 'bob-maintainer', 'User', 'https://github.com/bob-maintainer', NULL, 3400),
  (910003, 'cara-student', 'User', 'https://github.com/cara-student', NULL, 45),
  (910004, 'demo-dependabot[bot]', 'Bot', 'https://github.com/apps/dependabot', NULL, 0),
  (910005, 'diego-go', 'User', 'https://github.com/diego-go', NULL, 890),
  (910006, 'elena-rust', 'User', 'https://github.com/elena-rust', NULL, 2100),
  (910007, 'farah-java', 'User', 'https://github.com/farah-java', NULL, 670),
  (910008, 'gabe-ts', 'User', 'https://github.com/gabe-ts', NULL, 430)
ON CONFLICT (contributor_id) DO UPDATE SET followers = EXCLUDED.followers;

INSERT INTO repositories (
  repo_id, org_id, owner_login, name, full_name, description, html_url,
  default_branch, language_primary, stars, forks_count, open_issues_count,
  watchers_count, size_kb, is_fork, is_archived, is_abandoned, parent_repo_id,
  created_at, updated_at, pushed_at, last_activity_at, health_score
) VALUES
  (920001, 900001, 'demo-org', 'friendly-lib', 'demo-org/friendly-lib',
   'A beginner-friendly library with good first issues', 'https://github.com/demo-org/friendly-lib',
   'main', 'Python', 4200, 310, 18, 4200, 1200, FALSE, FALSE, FALSE, NULL,
   NOW() - INTERVAL '3 years', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days', 0),
  (920002, 900001, 'demo-org', 'legacy-toolkit', 'demo-org/legacy-toolkit',
   'Older toolkit with little recent activity', 'https://github.com/demo-org/legacy-toolkit',
   'master', 'JavaScript', 890, 120, 55, 890, 800, FALSE, FALSE, FALSE, NULL,
   NOW() - INTERVAL '8 years', NOW() - INTERVAL '400 days', NOW() - INTERVAL '400 days', NOW() - INTERVAL '400 days', 0),
  (920003, NULL, 'alice-dev', 'friendly-lib-fork', 'alice-dev/friendly-lib-fork',
   'Fork of friendly-lib', 'https://github.com/alice-dev/friendly-lib-fork',
   'main', 'Python', 12, 1, 0, 12, 1100, TRUE, FALSE, FALSE, 920001,
   NOW() - INTERVAL '1 year', NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days', 0),
  (920004, 900002, 'acme-labs', 'pulse-api', 'acme-labs/pulse-api',
   'Fast HTTP toolkit for APIs', 'https://github.com/acme-labs/pulse-api',
   'main', 'Go', 6100, 480, 22, 6100, 900, FALSE, FALSE, FALSE, NULL,
   NOW() - INTERVAL '2 years', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day', 0),
  (920005, 900002, 'acme-labs', 'oxide-cli', 'acme-labs/oxide-cli',
   'Systems CLI utilities in Rust', 'https://github.com/acme-labs/oxide-cli',
   'main', 'Rust', 2800, 190, 9, 2800, 1500, FALSE, FALSE, FALSE, NULL,
   NOW() - INTERVAL '18 months', NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days', 0),
  (920006, 900002, 'acme-labs', 'web-kit', 'acme-labs/web-kit',
   'TypeScript UI primitives', 'https://github.com/acme-labs/web-kit',
   'main', 'TypeScript', 3500, 260, 31, 3500, 2200, FALSE, FALSE, FALSE, NULL,
   NOW() - INTERVAL '2 years', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days', 0),
  (920007, 900003, 'northwind-oss', 'ledger-core', 'northwind-oss/ledger-core',
   'Java ledger library for finance demos', 'https://github.com/northwind-oss/ledger-core',
   'main', 'Java', 1900, 140, 14, 1900, 3100, FALSE, FALSE, FALSE, NULL,
   NOW() - INTERVAL '3 years', NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days', 0),
  (920008, 900003, 'northwind-oss', 'data-pipes', 'northwind-oss/data-pipes',
   'Python ETL helpers with beginner issues', 'https://github.com/northwind-oss/data-pipes',
   'main', 'Python', 2400, 210, 27, 2400, 1800, FALSE, FALSE, FALSE, NULL,
   NOW() - INTERVAL '2 years', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days', 0),
  (920009, 900003, 'northwind-oss', 'archived-portal', 'northwind-oss/archived-portal',
   'Deprecated portal — archived for history', 'https://github.com/northwind-oss/archived-portal',
   'master', 'JavaScript', 450, 80, 40, 450, 700, FALSE, TRUE, FALSE, NULL,
   NOW() - INTERVAL '7 years', NOW() - INTERVAL '500 days', NOW() - INTERVAL '500 days', NOW() - INTERVAL '500 days', 0),
  (920010, NULL, 'diego-go', 'pulse-api-fork', 'diego-go/pulse-api-fork',
   'Experimental fork of pulse-api', 'https://github.com/diego-go/pulse-api-fork',
   'main', 'Go', 34, 2, 1, 34, 880, TRUE, FALSE, FALSE, 920004,
   NOW() - INTERVAL '6 months', NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days', 0),
  (920011, 900001, 'demo-org', 'docs-site', 'demo-org/docs-site',
   'Documentation site templates', 'https://github.com/demo-org/docs-site',
   'main', 'HTML', 620, 95, 6, 620, 400, FALSE, FALSE, FALSE, NULL,
   NOW() - INTERVAL '1 year', NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days', 0),
  (920012, 900002, 'acme-labs', 'stale-sdk', 'acme-labs/stale-sdk',
   'SDK with no recent pushes — abandonment candidate', 'https://github.com/acme-labs/stale-sdk',
   'main', 'Python', 1100, 88, 63, 1100, 950, FALSE, FALSE, FALSE, NULL,
   NOW() - INTERVAL '4 years', NOW() - INTERVAL '220 days', NOW() - INTERVAL '220 days', NOW() - INTERVAL '220 days', 0)
ON CONFLICT (repo_id) DO UPDATE SET
  description = EXCLUDED.description,
  stars = EXCLUDED.stars,
  language_primary = EXCLUDED.language_primary,
  is_archived = EXCLUDED.is_archived,
  parent_repo_id = EXCLUDED.parent_repo_id,
  pushed_at = EXCLUDED.pushed_at,
  last_activity_at = EXCLUDED.last_activity_at;

INSERT INTO languages (name) VALUES
  ('Python'), ('JavaScript'), ('TypeScript'), ('Go'), ('Rust'), ('Java'), ('HTML'), ('CSS')
ON CONFLICT (name) DO NOTHING;

-- Languages per repo
INSERT INTO repo_languages (repo_id, language_id, bytes, share_pct)
SELECT v.repo_id, l.language_id, v.bytes, v.share_pct
FROM (VALUES
  (920001, 'Python', 850000, 82.5), (920001, 'TypeScript', 180000, 17.5),
  (920002, 'JavaScript', 620000, 100),
  (920003, 'Python', 840000, 100),
  (920004, 'Go', 920000, 100),
  (920005, 'Rust', 780000, 100),
  (920006, 'TypeScript', 650000, 72.0), (920006, 'CSS', 250000, 28.0),
  (920007, 'Java', 1100000, 100),
  (920008, 'Python', 700000, 100),
  (920009, 'JavaScript', 400000, 100),
  (920010, 'Go', 900000, 100),
  (920011, 'HTML', 200000, 60.0), (920011, 'CSS', 130000, 40.0),
  (920012, 'Python', 500000, 100)
) AS v(repo_id, lang, bytes, share_pct)
JOIN languages l ON l.name = v.lang
ON CONFLICT (repo_id, language_id) DO UPDATE SET bytes = EXCLUDED.bytes, share_pct = EXCLUDED.share_pct;

INSERT INTO repo_contributors (repo_id, contributor_id, contributions) VALUES
  (920001, 910001, 240), (920001, 910002, 180), (920001, 910003, 22),
  (920002, 910002, 95),
  (920003, 910001, 8),
  (920004, 910005, 310), (920004, 910002, 40),
  (920005, 910006, 220), (920005, 910001, 15),
  (920006, 910008, 260), (920006, 910003, 30),
  (920007, 910007, 190), (920007, 910002, 25),
  (920008, 910001, 150), (920008, 910003, 55),
  (920009, 910002, 70),
  (920010, 910005, 12),
  (920011, 910008, 40), (920011, 910003, 18),
  (920012, 910001, 80)
ON CONFLICT (repo_id, contributor_id) DO UPDATE SET contributions = EXCLUDED.contributions;

-- Generate multi-month commits for active repos (skip abandoned/archived extremes)
-- Spread hours across 08:00–20:00 UTC so the punch-card heatmap is not a single column.
INSERT INTO commits (repo_id, sha, contributor_id, message, committed_at, parent_sha, html_url)
SELECT
  g.repo_id,
  substr(md5(g.repo_id::text || '-' || g.n::text), 1, 40),
  g.contributor_id,
  'Seed commit #' || g.n,
  DATE_TRUNC('day', NOW()) - (g.days || ' days')::INTERVAL
    + make_interval(hours => 8 + (g.n * 5 + g.repo_id) % 13, mins => (g.n * 17) % 60),
  CASE WHEN g.n > 1 THEN substr(md5(g.repo_id::text || '-' || (g.n - 1)::text), 1, 40) ELSE NULL END,
  NULL
FROM (
  SELECT 920001 AS repo_id, n, CASE WHEN n % 3 = 0 THEN 910002 WHEN n % 3 = 1 THEN 910001 ELSE 910003 END AS contributor_id, (n * 3) AS days
  FROM generate_series(1, 40) n
  UNION ALL
  SELECT 920004, n, CASE WHEN n % 2 = 0 THEN 910005 ELSE 910002 END, (n * 2)
  FROM generate_series(1, 45) n
  UNION ALL
  SELECT 920005, n, 910006, (n * 4)
  FROM generate_series(1, 30) n
  UNION ALL
  SELECT 920006, n, CASE WHEN n % 4 = 0 THEN 910003 ELSE 910008 END, (n * 3)
  FROM generate_series(1, 35) n
  UNION ALL
  SELECT 920007, n, 910007, (n * 5)
  FROM generate_series(1, 25) n
  UNION ALL
  SELECT 920008, n, CASE WHEN n % 2 = 0 THEN 910001 ELSE 910003 END, (n * 3)
  FROM generate_series(1, 35) n
  UNION ALL
  SELECT 920011, n, 910008, (n * 6)
  FROM generate_series(1, 20) n
  UNION ALL
  SELECT 920003, n, 910001, (n * 10)
  FROM generate_series(1, 8) n
  UNION ALL
  SELECT 920010, n, 910005, (n * 12)
  FROM generate_series(1, 6) n
) g
ON CONFLICT (repo_id, sha) DO UPDATE SET committed_at = EXCLUDED.committed_at;

-- Sparse old commits for stale/archived
INSERT INTO commits (repo_id, sha, contributor_id, message, committed_at, parent_sha)
VALUES
  (920002, 'ffffffffffffffffffffffffffffffffffffffff', 910002, 'Last maintenance', NOW() - INTERVAL '400 days', NULL),
  (920009, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0', 910002, 'Archive prep', NOW() - INTERVAL '500 days', NULL),
  (920012, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb0', 910001, 'Final SDK bump', NOW() - INTERVAL '220 days', NULL)
ON CONFLICT (repo_id, sha) DO NOTHING;

-- Issues with beginner labels
INSERT INTO issues (repo_id, number, title, state, author_id, is_pull_request, created_at, updated_at, closed_at, html_url) VALUES
  (920001, 1, 'Add beginner tutorial', 'closed', 910003, FALSE, NOW() - INTERVAL '40 days', NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days', NULL),
  (920001, 2, 'Good first issue: fix docs typo', 'open', 910002, FALSE, NOW() - INTERVAL '10 days', NOW() - INTERVAL '2 days', NULL, NULL),
  (920001, 3, 'Help wanted: improve error messages', 'open', 910001, FALSE, NOW() - INTERVAL '8 days', NOW() - INTERVAL '1 day', NULL, NULL),
  (920001, 4, 'Refactor internals', 'closed', 910001, FALSE, NOW() - INTERVAL '50 days', NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days', NULL),
  (920002, 1, 'Security patch needed', 'open', 910002, FALSE, NOW() - INTERVAL '300 days', NOW() - INTERVAL '300 days', NULL, NULL),
  (920004, 1, 'Document rate limits', 'closed', 910005, FALSE, NOW() - INTERVAL '20 days', NOW() - INTERVAL '15 days', NOW() - INTERVAL '15 days', NULL),
  (920004, 2, 'good first issue: add example', 'open', 910002, FALSE, NOW() - INTERVAL '6 days', NOW() - INTERVAL '1 day', NULL, NULL),
  (920006, 1, 'Help wanted: a11y audit', 'open', 910008, FALSE, NOW() - INTERVAL '12 days', NOW() - INTERVAL '3 days', NULL, NULL),
  (920006, 2, 'Theme tokens polish', 'closed', 910003, FALSE, NOW() - INTERVAL '25 days', NOW() - INTERVAL '18 days', NOW() - INTERVAL '18 days', NULL),
  (920008, 1, 'Good first issue: sample pipeline', 'open', 910003, FALSE, NOW() - INTERVAL '9 days', NOW() - INTERVAL '2 days', NULL, NULL),
  (920008, 2, 'Help wanted: CSV connector', 'open', 910001, FALSE, NOW() - INTERVAL '14 days', NOW() - INTERVAL '4 days', NULL, NULL),
  (920008, 3, 'Flaky test in CI', 'closed', 910001, FALSE, NOW() - INTERVAL '35 days', NOW() - INTERVAL '28 days', NOW() - INTERVAL '28 days', NULL),
  (920007, 1, 'Currency rounding edge case', 'open', 910007, FALSE, NOW() - INTERVAL '11 days', NOW() - INTERVAL '5 days', NULL, NULL),
  (920012, 1, 'Unmaintained notice', 'open', 910001, FALSE, NOW() - INTERVAL '200 days', NOW() - INTERVAL '200 days', NULL, NULL),
  (920009, 1, 'Do not use — archived', 'open', 910002, FALSE, NOW() - INTERVAL '480 days', NOW() - INTERVAL '480 days', NULL, NULL)
ON CONFLICT (repo_id, number) DO NOTHING;

INSERT INTO issue_labels (issue_id, label)
SELECT i.issue_id, v.label
FROM (VALUES
  (920001, 2, 'good first issue'),
  (920001, 3, 'help wanted'),
  (920004, 2, 'good first issue'),
  (920006, 1, 'help wanted'),
  (920008, 1, 'good first issue'),
  (920008, 2, 'help wanted')
) AS v(repo_id, number, label)
JOIN issues i ON i.repo_id = v.repo_id AND i.number = v.number
ON CONFLICT DO NOTHING;

INSERT INTO pull_requests (
  repo_id, number, title, state, author_id, is_merged,
  created_at, updated_at, closed_at, merged_at, additions, deletions, changed_files, html_url
) VALUES
  (920001, 10, 'Docs: beginner tutorial', 'closed', 910003, TRUE, NOW() - INTERVAL '35 days', NOW() - INTERVAL '32 days', NOW() - INTERVAL '32 days', NOW() - INTERVAL '32 days', 120, 4, 3, NULL),
  (920001, 11, 'Feature: better errors', 'open', 910001, FALSE, NOW() - INTERVAL '3 days', NOW() - INTERVAL '1 day', NULL, NULL, 80, 12, 5, NULL),
  (920002, 5, 'Dependabot bump', 'closed', 910004, FALSE, NOW() - INTERVAL '350 days', NOW() - INTERVAL '349 days', NOW() - INTERVAL '349 days', NULL, 2, 2, 1, NULL),
  (920004, 20, 'Add middleware hooks', 'closed', 910005, TRUE, NOW() - INTERVAL '18 days', NOW() - INTERVAL '14 days', NOW() - INTERVAL '14 days', NOW() - INTERVAL '14 days', 200, 30, 8, NULL),
  (920004, 21, 'WIP: tracing', 'open', 910002, FALSE, NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', NULL, NULL, 90, 10, 4, NULL),
  (920005, 7, 'Release 0.9', 'closed', 910006, TRUE, NOW() - INTERVAL '22 days', NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days', 50, 5, 2, NULL),
  (920006, 15, 'Token refresh', 'closed', 910008, TRUE, NOW() - INTERVAL '16 days', NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days', 140, 20, 6, NULL),
  (920008, 9, 'CSV sample', 'open', 910003, FALSE, NOW() - INTERVAL '4 days', NOW() - INTERVAL '1 day', NULL, NULL, 60, 0, 3, NULL)
ON CONFLICT (repo_id, number) DO NOTHING;

INSERT INTO sync_runs (started_at, finished_at, status, query_used, repos_synced, error_message)
VALUES
  (NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours' + INTERVAL '3 minutes', 'completed', 'seed_demo.sql', 12, NULL);

COMMIT;

-- Recount caches (triggers may inflate on re-seed)
UPDATE repositories r SET
  contributor_count_cache = (SELECT COUNT(*) FROM repo_contributors rc WHERE rc.repo_id = r.repo_id),
  commit_count_cache = (SELECT COUNT(*) FROM commits c WHERE c.repo_id = r.repo_id);

CALL sp_refresh_analytics();
