-- Remove offline demo seed only (fixed high IDs / known demo org logins).
-- Safe to re-run. Does not delete live GitHub repo_ids.

BEGIN;

-- Break fork parent links among demo rows before delete
UPDATE repositories
SET parent_repo_id = NULL
WHERE repo_id BETWEEN 920001 AND 920099
   OR owner_login IN ('demo-org', 'acme-labs', 'northwind-oss', 'alice-dev', 'diego-go');

DELETE FROM repositories
WHERE repo_id BETWEEN 920001 AND 920099
   OR owner_login IN ('demo-org', 'acme-labs', 'northwind-oss', 'alice-dev', 'diego-go');

DELETE FROM organizations
WHERE org_id BETWEEN 900001 AND 900099
   OR login IN ('demo-org', 'acme-labs', 'northwind-oss');

DELETE FROM contributors
WHERE contributor_id BETWEEN 910001 AND 910099
   OR login IN (
        'alice-dev',
        'bob-maintainer',
        'cara-student',
        'demo-dependabot[bot]',
        'diego-go',
        'elena-rust',
        'farah-java',
        'gabe-ts'
   );

DELETE FROM sync_runs
WHERE query_used = 'seed_demo.sql';

COMMIT;
