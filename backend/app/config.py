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

    database_url: str = "postgresql://osint:osint@localhost:5432/github_osint"
    github_token: str = ""
    admin_token: str = "changeme"
    github_api_base: str = "https://api.github.com"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Per-repo ingest sample caps (GitHub list endpoints are paginated up to these)
    ingest_commit_limit: int = 300
    ingest_issue_limit: int = 200
    ingest_pr_limit: int = 100
    ingest_fork_limit: int = 15
    ingest_pr_detail_limit: int = 20
    ingest_contributor_limit: int = 100
    ingest_labeled_issue_limit: int = 50


@lru_cache
def get_settings() -> Settings:
    return Settings()
