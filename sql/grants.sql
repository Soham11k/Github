-- Ensure application role can use objects (Docker init + local re-apply as superuser)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'osint') THEN
    GRANT USAGE ON SCHEMA public TO osint;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO osint;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO osint;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO osint;
  END IF;
END $$;

-- Read-only analyst role for course demos (SELECT only)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'osint_ro') THEN
    CREATE ROLE osint_ro LOGIN PASSWORD 'osint_ro';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO osint_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO osint_ro;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO osint_ro;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO osint_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO osint_ro;
