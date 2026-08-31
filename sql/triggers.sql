-- Triggers: audit log, last_activity_at, denormalized counts

CREATE OR REPLACE FUNCTION fn_audit_row()
RETURNS TRIGGER AS $$
DECLARE
    rid TEXT;
    payload JSONB;
BEGIN
    IF TG_OP = 'DELETE' THEN
        payload := to_jsonb(OLD);
        IF TG_TABLE_NAME = 'repositories' THEN
            rid := OLD.repo_id::TEXT;
        ELSIF TG_TABLE_NAME = 'commits' THEN
            rid := OLD.commit_id::TEXT;
        ELSE
            rid := 'unknown';
        END IF;
        INSERT INTO audit_log (table_name, record_id, action, details)
        VALUES (TG_TABLE_NAME, rid, 'DELETE', payload);
        RETURN OLD;
    END IF;

    payload := to_jsonb(NEW);
    IF TG_TABLE_NAME = 'repositories' THEN
        rid := NEW.repo_id::TEXT;
    ELSIF TG_TABLE_NAME = 'commits' THEN
        rid := NEW.commit_id::TEXT;
    ELSE
        rid := 'unknown';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_log (table_name, record_id, action, details)
        VALUES (
            TG_TABLE_NAME,
            rid,
            'UPDATE',
            jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW))
        );
        RETURN NEW;
    END IF;

    INSERT INTO audit_log (table_name, record_id, action, details)
    VALUES (TG_TABLE_NAME, rid, 'INSERT', payload);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_repositories ON repositories;
CREATE TRIGGER trg_audit_repositories
    AFTER INSERT OR UPDATE OR DELETE ON repositories
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

DROP TRIGGER IF EXISTS trg_audit_commits ON commits;
CREATE TRIGGER trg_audit_commits
    AFTER INSERT OR UPDATE OR DELETE ON commits
    FOR EACH ROW EXECUTE FUNCTION fn_audit_row();

-- Bump last_activity_at when commits land
CREATE OR REPLACE FUNCTION fn_bump_repo_activity_from_commit()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE repositories
    SET last_activity_at = GREATEST(COALESCE(last_activity_at, '-infinity'::timestamptz), COALESCE(NEW.committed_at, NOW())),
        commit_count_cache = commit_count_cache + 1,
        synced_at = NOW()
    WHERE repo_id = NEW.repo_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_commit_activity ON commits;
CREATE TRIGGER trg_commit_activity
    AFTER INSERT ON commits
    FOR EACH ROW EXECUTE FUNCTION fn_bump_repo_activity_from_commit();

-- Keep contributor_count_cache in sync
CREATE OR REPLACE FUNCTION fn_bump_contributor_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE repositories
        SET contributor_count_cache = contributor_count_cache + 1
        WHERE repo_id = NEW.repo_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE repositories
        SET contributor_count_cache = GREATEST(contributor_count_cache - 1, 0)
        WHERE repo_id = OLD.repo_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_repo_contributor_count ON repo_contributors;
CREATE TRIGGER trg_repo_contributor_count
    AFTER INSERT OR DELETE ON repo_contributors
    FOR EACH ROW EXECUTE FUNCTION fn_bump_contributor_count();

-- Update last_activity_at from issues
CREATE OR REPLACE FUNCTION fn_bump_repo_activity_from_issue()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE repositories
    SET last_activity_at = GREATEST(
            COALESCE(last_activity_at, '-infinity'::timestamptz),
            COALESCE(NEW.updated_at, NEW.created_at, NOW())
        )
    WHERE repo_id = NEW.repo_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_issue_activity ON issues;
CREATE TRIGGER trg_issue_activity
    AFTER INSERT OR UPDATE ON issues
    FOR EACH ROW EXECUTE FUNCTION fn_bump_repo_activity_from_issue();
