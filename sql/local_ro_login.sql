-- Local / Docker demo only: allow logging in as osint_ro with a known password.
-- Do NOT run this against production Neon.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'osint_ro') THEN
    ALTER ROLE osint_ro LOGIN PASSWORD 'osint_ro';
  END IF;
END $$;
