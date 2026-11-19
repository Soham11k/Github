from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_ROOT = Path(__file__).resolve().parents[2]
_BACKEND = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(_ROOT / ".env"), str(_BACKEND / ".env"), ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = "development"
    app_name: str = "RepoPulse"
    database_url: str = "postgresql://osint:osint@localhost:5432/github_osint"
    github_token: str = ""
    admin_token: str = "changeme"
    admin_github_logins: str = ""
    github_api_base: str = "https://api.github.com"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # GitHub OAuth (public website)
    github_oauth_client_id: str = ""
    github_oauth_client_secret: str = ""
    github_oauth_redirect_uri: str = "http://localhost:8000/api/auth/github/callback"
    frontend_url: str = "http://localhost:5173"
    session_secret: str = "dev-session-secret-change-me"
    session_cookie_name: str = "repopulse_session"
    session_max_age_seconds: int = 60 * 60 * 24 * 30
    cookie_secure: bool = False

    # Public site / badges
    public_api_url: str = "http://localhost:8000"
    sentry_dsn: str = ""

    # Rate limits
    rate_limit_read: str = "120/minute"
    rate_limit_write: str = "10/minute"

    # Per-repo ingest sample window + caps (GitHub list endpoints are paginated up to these)
    ingest_activity_days: int = 180
    ingest_commit_limit: int = 300
    ingest_issue_limit: int = 200
    ingest_pr_limit: int = 100
    ingest_fork_limit: int = 15
    ingest_pr_detail_limit: int = 20
    ingest_contributor_limit: int = 100
    ingest_labeled_issue_limit: int = 50

    @property
    def is_production(self) -> bool:
        return self.app_env.strip().lower() == "production"

    @property
    def admin_logins(self) -> set[str]:
        return {
            x.strip().lower()
            for x in self.admin_github_logins.split(",")
            if x.strip()
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()
