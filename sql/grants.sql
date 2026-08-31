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
