from __future__ import annotations

import time
from typing import Any, Optional

import httpx

from app.config import get_settings


class GitHubClient:
    """Thin GitHub REST API client with rate-limit awareness."""

    def __init__(self, token: Optional[str] = None) -> None:
        settings = get_settings()
        self.base_url = settings.github_api_base.rstrip("/")
        self.token = token if token is not None else settings.github_token
        headers = {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "github-osint-database",
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        self._client = httpx.Client(
            base_url=self.base_url,
            headers=headers,
            timeout=60.0,
            follow_redirects=True,
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "GitHubClient":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()

    def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        for attempt in range(5):
            response = self._client.request(method, path, **kwargs)
            if response.status_code == 403 and "rate limit" in response.text.lower():
                reset = response.headers.get("X-RateLimit-Reset")
                wait = max(int(reset) - int(time.time()), 5) if reset else 60
                time.sleep(min(wait, 120))
                continue
            if response.status_code == 404:
                return None
            if response.status_code == 202:
                # GitHub sometimes returns 202 while computing stats
                time.sleep(2)
                continue
            response.raise_for_status()
            if response.status_code == 204 or not response.content:
                return None
            return response.json()
        response.raise_for_status()
        return None

    def get(self, path: str, params: Optional[dict] = None) -> Any:
        return self._request("GET", path, params=params)

    def search_repositories(self, query: str, limit: int = 30) -> list[dict]:
        results: list[dict] = []
        page = 1
        per_page = min(100, max(1, limit))
        while len(results) < limit:
            data = self.get(
                "/search/repositories",
                params={"q": query, "sort": "stars", "order": "desc", "per_page": per_page, "page": page},
            )
            if not data or not data.get("items"):
                break
            results.extend(data["items"])
            if len(data["items"]) < per_page:
                break
            page += 1
        return results[:limit]

    def get_repo(self, owner: str, repo: str) -> Optional[dict]:
        return self.get(f"/repos/{owner}/{repo}")

    def get_contributors(self, owner: str, repo: str, limit: int = 100) -> list[dict]:
        data = self.get(
            f"/repos/{owner}/{repo}/contributors",
            params={"per_page": min(limit, 100), "anon": "false"},
        )
        return data or []

    def get_commits(self, owner: str, repo: str, limit: int = 100) -> list[dict]:
        data = self.get(
            f"/repos/{owner}/{repo}/commits",
            params={"per_page": min(limit, 100)},
        )
        return data or []

    def get_issues(self, owner: str, repo: str, limit: int = 100) -> list[dict]:
        # state=all includes closed; filter PRs via pull_request key
        data = self.get(
            f"/repos/{owner}/{repo}/issues",
            params={"state": "all", "per_page": min(limit, 100)},
        )
        return data or []

    def get_pulls(self, owner: str, repo: str, limit: int = 50) -> list[dict]:
        data = self.get(
            f"/repos/{owner}/{repo}/pulls",
            params={"state": "all", "per_page": min(limit, 100)},
        )
        return data or []

    def get_languages(self, owner: str, repo: str) -> dict[str, int]:
        data = self.get(f"/repos/{owner}/{repo}/languages")
        return data or {}

    def get_org(self, org: str) -> Optional[dict]:
        return self.get(f"/orgs/{org}")

    def get_authenticated_user(self) -> Optional[dict]:
        """Return /user payload when token is valid; None if missing/invalid."""
        if not self.token or not str(self.token).strip():
            return None
        try:
            return self.get("/user")
        except Exception:
            return None


DEFAULT_SEED_REPOS = [
    "facebook/react",
    "microsoft/vscode",
    "torvalds/linux",
    "vercel/next.js",
    "django/django",
    "pallets/flask",
    "fastapi/fastapi",
    "nodejs/node",
    "python/cpython",
    "kubernetes/kubernetes",
    "tensorflow/tensorflow",
    "pytorch/pytorch",
    "rust-lang/rust",
    "golang/go",
    "angular/angular",
]
