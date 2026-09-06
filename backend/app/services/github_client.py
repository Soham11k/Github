from __future__ import annotations

import time
from datetime import datetime, timezone
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
        self.last_rate_limit_remaining: Optional[int] = None
        self.last_rate_limit_reset: Optional[str] = None

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "GitHubClient":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()

    def _capture_rate_headers(self, response: httpx.Response) -> None:
        remaining = response.headers.get("X-RateLimit-Remaining")
        reset = response.headers.get("X-RateLimit-Reset")
        if remaining is not None:
            try:
                self.last_rate_limit_remaining = int(remaining)
            except ValueError:
                pass
        if reset is not None:
            try:
                ts = int(reset)
                self.last_rate_limit_reset = datetime.fromtimestamp(
                    ts, tz=timezone.utc
                ).isoformat()
            except ValueError:
                self.last_rate_limit_reset = reset

    def _wait_for_rate_limit(self, response: httpx.Response) -> None:
        retry_after = response.headers.get("Retry-After")
        if retry_after:
            try:
                wait = int(retry_after)
            except ValueError:
                wait = 60
        else:
            reset = response.headers.get("X-RateLimit-Reset")
            if reset:
                try:
                    wait = max(int(reset) - int(time.time()), 5)
                except ValueError:
                    wait = 60
            else:
                wait = 60
        time.sleep(min(wait, 120))

    def _is_rate_limited(self, response: httpx.Response) -> bool:
        if response.status_code == 429:
            return True
        if response.status_code != 403:
            return False
        body = (response.text or "").lower()
        return (
            "rate limit" in body
            or "secondary rate" in body
            or "abuse detection" in body
        )

    def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        for attempt in range(5):
            response = self._client.request(method, path, **kwargs)
            self._capture_rate_headers(response)
            if self._is_rate_limited(response):
                self._wait_for_rate_limit(response)
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

    def _paginate(self, path: str, params: Optional[dict], limit: int) -> list[dict]:
        """Collect list items across pages until limit or exhaustion."""
        results: list[dict] = []
        page = 1
        per_page = min(100, max(1, limit))
        base_params = dict(params or {})
        while len(results) < limit:
            page_params = {**base_params, "per_page": per_page, "page": page}
            data = self.get(path, params=page_params)
            if not data:
                break
            if not isinstance(data, list):
                break
            results.extend(data)
            if len(data) < per_page:
                break
            page += 1
            if page > 40:
                break
        return results[:limit]

    def get_rate_limit(self) -> dict[str, Any]:
        """Return core rate-limit snapshot from /rate_limit."""
        try:
            data = self.get("/rate_limit")
            if not data:
                return {
                    "rate_limit_remaining": self.last_rate_limit_remaining,
                    "rate_limit_reset": self.last_rate_limit_reset,
                }
            core = (data.get("resources") or {}).get("core") or data.get("rate") or {}
            remaining = core.get("remaining")
            reset = core.get("reset")
            reset_iso = None
            if reset is not None:
                try:
                    reset_iso = datetime.fromtimestamp(int(reset), tz=timezone.utc).isoformat()
                except (TypeError, ValueError):
                    reset_iso = str(reset)
            return {
                "rate_limit_remaining": remaining,
                "rate_limit_reset": reset_iso,
                "rate_limit_limit": core.get("limit"),
                "rate_limit_used": core.get("used"),
            }
        except Exception:
            return {
                "rate_limit_remaining": self.last_rate_limit_remaining,
                "rate_limit_reset": self.last_rate_limit_reset,
            }

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

    def get_forks(self, owner: str, repo: str, limit: int = 15) -> list[dict]:
        return self._paginate(
            f"/repos/{owner}/{repo}/forks",
            {"sort": "stargazers"},
            limit,
        )

    def get_contributors(self, owner: str, repo: str, limit: int = 100) -> list[dict]:
        return self._paginate(
            f"/repos/{owner}/{repo}/contributors",
            {"anon": "false"},
            limit,
        )

    def get_commits(self, owner: str, repo: str, limit: int = 300) -> list[dict]:
        return self._paginate(f"/repos/{owner}/{repo}/commits", {}, limit)

    def get_issues(self, owner: str, repo: str, limit: int = 200) -> list[dict]:
        return self._paginate(
            f"/repos/{owner}/{repo}/issues",
            {"state": "all"},
            limit,
        )

    def get_labeled_issues(
        self, owner: str, repo: str, label: str, limit: int = 50
    ) -> list[dict]:
        """Fetch open issues with a specific label (e.g. good first issue)."""
        return self._paginate(
            f"/repos/{owner}/{repo}/issues",
            {"state": "open", "labels": label},
            limit,
        )

    def get_pulls(self, owner: str, repo: str, limit: int = 100) -> list[dict]:
        return self._paginate(
            f"/repos/{owner}/{repo}/pulls",
            {"state": "all"},
            limit,
        )

    def get_pull(self, owner: str, repo: str, number: int) -> Optional[dict]:
        return self.get(f"/repos/{owner}/{repo}/pulls/{number}")

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
    "firstcontributions/first-contributions",
    "scikit-learn/scikit-learn",
    "microsoft/TypeScript",
    "facebook/react",
    "microsoft/vscode",
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
    "mui/material-ui",
    "home-assistant/core",
    "twbs/bootstrap",
    "jupyter/notebook",
    "pandas-dev/pandas",
    "numpy/numpy",
    "prettier/prettier",
    "eslint/eslint",
    "webpack/webpack",
    "redis/redis",
    "postgres/postgres",
    "git/git",
    "ohmyzsh/ohmyzsh",
    "facebook/react-native",
    "vuejs/vue",
    "sveltejs/svelte",
    "denoland/deno",
    "microsoft/PowerToys",
    "hashicorp/terraform",
    "ansible/ansible",
    "elastic/elasticsearch",
    "apache/spark",
    "huggingface/transformers",
    "openai/openai-python",
    "langchain-ai/langchain",
    "obsidianmd/obsidian-releases",
    "godotengine/godot",
    "bitcoin/bitcoin",
    "electron/electron",
    "tailwindlabs/tailwindcss",
    "storybookjs/storybook",
    "nestjs/nest",
    "spring-projects/spring-boot",
]
