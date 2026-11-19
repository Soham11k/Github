import os

import pytest
from fastapi.testclient import TestClient

# Ensure settings point at CI/local test DB before app import side effects
# Prefer peer-auth local DB when present; CI sets DATABASE_URL explicitly.
os.environ.setdefault("DATABASE_URL", "postgresql://osint:osint@localhost:5432/github_osint")
os.environ.setdefault("APP_ENV", "development")
os.environ.setdefault("ADMIN_TOKEN", "test-admin-token")
os.environ.setdefault("ADMIN_GITHUB_LOGINS", "testadmin")
os.environ.setdefault("SESSION_SECRET", "test-session-secret-not-for-prod")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173")
os.environ.setdefault("GITHUB_OAUTH_CLIENT_ID", "test-client")
os.environ.setdefault("GITHUB_OAUTH_CLIENT_SECRET", "test-secret")

from app.config import get_settings  # noqa: E402
from app.db import close_pool, execute, init_pool  # noqa: E402
from app.main import app  # noqa: E402
from app.migrate import apply_migrations  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def migrated_db():
    get_settings.cache_clear()
    apply_migrations()
    # Demo seed for public endpoint tests (idempotent enough for CI)
    seed = os.path.join(
        os.path.dirname(__file__), "..", "..", "sql", "seed_demo.sql"
    )
    if os.path.isfile(seed):
        import psycopg

        with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
            with conn.cursor() as cur:
                cur.execute(open(seed, encoding="utf-8").read())
            conn.commit()
    init_pool()
    yield
    close_pool()


@pytest.fixture
def client():
    get_settings.cache_clear()
    with TestClient(app) as c:
        yield c


@pytest.fixture
def admin_headers():
    return {"X-Admin-Token": "test-admin-token"}
