from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from psycopg import Connection

from app.db import get_connection
from app.services.github_client import DEFAULT_SEED_REPOS, GitHubClient


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _upsert_contributor(cur: Any, user: Optional[dict]) -> Optional[int]:
    if not user or not user.get("id"):
        return None
    login = user.get("login") or f"user-{user['id']}"
    payload = {
        "id": user["id"],
        "login": login,
        "type": user.get("type") or "User",
        "html_url": user.get("html_url"),
        "avatar_url": user.get("avatar_url"),
        "followers": user.get("followers") or 0,
    }
    # Avoid unique(login) collisions when a seed row used the same login with a different id
    cur.execute(
        """
        UPDATE contributors
        SET login = login || '-seed-' || contributor_id::text
        WHERE login = %(login)s AND contributor_id <> %(id)s
        """,
        payload,
    )
    cur.execute(
        """
        INSERT INTO contributors (contributor_id, login, type, html_url, avatar_url, followers, synced_at)
        VALUES (%(id)s, %(login)s, %(type)s, %(html_url)s, %(avatar_url)s, %(followers)s, NOW())
        ON CONFLICT (contributor_id) DO UPDATE SET
            login = EXCLUDED.login,
            type = EXCLUDED.type,
            html_url = EXCLUDED.html_url,
            avatar_url = EXCLUDED.avatar_url,
            followers = GREATEST(contributors.followers, EXCLUDED.followers),
            synced_at = NOW()
        """,
        payload,
    )
    return int(user["id"])


def _upsert_organization(cur: Any, client: GitHubClient, owner: dict) -> Optional[int]:
    if not owner or owner.get("type") != "Organization":
        return None
    org_id = owner["id"]
    org = client.get_org(owner["login"]) or owner
    cur.execute(
        """
        INSERT INTO organizations (org_id, login, name, html_url, description, created_at, synced_at)
        VALUES (%(org_id)s, %(login)s, %(name)s, %(html_url)s, %(description)s, %(created_at)s, NOW())
        ON CONFLICT (org_id) DO UPDATE SET
            login = EXCLUDED.login,
            name = COALESCE(EXCLUDED.name, organizations.name),
            html_url = EXCLUDED.html_url,
            description = COALESCE(EXCLUDED.description, organizations.description),
            synced_at = NOW()
        """,
        {
            "org_id": org_id,
            "login": org.get("login") or owner["login"],
            "name": org.get("name"),
            "html_url": org.get("html_url") or owner.get("html_url"),
            "description": org.get("description"),
            "created_at": _parse_dt(org.get("created_at")),
        },
    )
    return int(org_id)


def _upsert_parent_repo(cur: Any, client: GitHubClient, parent: Optional[dict]) -> Optional[int]:
    if not parent or not parent.get("id"):
        return None
    # Lightweight insert so FK is satisfied; full sync can happen later
    owner = parent.get("owner") or {}
    cur.execute(
        """
        INSERT INTO repositories (
            repo_id, owner_login, name, full_name, html_url, is_fork,
            stars, forks_count, open_issues_count, synced_at
        )
        VALUES (
            %(repo_id)s, %(owner_login)s, %(name)s, %(full_name)s, %(html_url)s, TRUE,
            %(stars)s, %(forks)s, %(open_issues)s, NOW()
        )
        ON CONFLICT (repo_id) DO NOTHING
        """,
        {
            "repo_id": parent["id"],
            "owner_login": owner.get("login") or parent.get("full_name", "/").split("/")[0],
            "name": parent.get("name") or parent.get("full_name", "/").split("/")[-1],
            "full_name": parent.get("full_name"),
            "html_url": parent.get("html_url"),
            "stars": parent.get("stargazers_count") or 0,
            "forks": parent.get("forks_count") or 0,
            "open_issues": parent.get("open_issues_count") or 0,
        },
    )
    return int(parent["id"])


def sync_repository(conn: Connection, client: GitHubClient, owner: str, repo: str) -> int:
    """Fetch one repository graph and write it in a single transaction."""
    data = client.get_repo(owner, repo)
    if not data:
        raise ValueError(f"Repository not found: {owner}/{repo}")

    with conn.transaction():
        with conn.cursor() as cur:
            owner_data = data.get("owner") or {}
            org_id = _upsert_organization(cur, client, owner_data)
            _upsert_contributor(cur, owner_data)

            parent_id = None
            if data.get("fork") and data.get("parent"):
                parent_id = _upsert_parent_repo(cur, client, data["parent"])

            repo_id = int(data["id"])
            cur.execute(
                """
                INSERT INTO repositories (
                    repo_id, org_id, owner_login, name, full_name, description, html_url,
                    default_branch, language_primary, stars, forks_count, open_issues_count,
                    watchers_count, size_kb, is_fork, is_archived, parent_repo_id,
                    created_at, updated_at, pushed_at, last_activity_at, synced_at
                ) VALUES (
                    %(repo_id)s, %(org_id)s, %(owner_login)s, %(name)s, %(full_name)s, %(description)s,
                    %(html_url)s, %(default_branch)s, %(language_primary)s, %(stars)s, %(forks)s,
                    %(open_issues)s, %(watchers)s, %(size_kb)s, %(is_fork)s, %(is_archived)s,
                    %(parent_repo_id)s, %(created_at)s, %(updated_at)s, %(pushed_at)s,
                    %(pushed_at)s, NOW()
                )
                ON CONFLICT (repo_id) DO UPDATE SET
                    org_id = EXCLUDED.org_id,
                    description = EXCLUDED.description,
                    language_primary = EXCLUDED.language_primary,
                    stars = EXCLUDED.stars,
                    forks_count = EXCLUDED.forks_count,
                    open_issues_count = EXCLUDED.open_issues_count,
                    watchers_count = EXCLUDED.watchers_count,
                    size_kb = EXCLUDED.size_kb,
                    is_archived = EXCLUDED.is_archived,
                    parent_repo_id = COALESCE(EXCLUDED.parent_repo_id, repositories.parent_repo_id),
                    updated_at = EXCLUDED.updated_at,
                    pushed_at = EXCLUDED.pushed_at,
                    last_activity_at = GREATEST(
                        COALESCE(repositories.last_activity_at, '-infinity'::timestamptz),
                        COALESCE(EXCLUDED.pushed_at, NOW())
                    ),
                    synced_at = NOW()
                """,
                {
                    "repo_id": repo_id,
                    "org_id": org_id,
                    "owner_login": owner_data.get("login") or owner,
                    "name": data["name"],
                    "full_name": data["full_name"],
                    "description": data.get("description"),
                    "html_url": data.get("html_url"),
                    "default_branch": data.get("default_branch"),
                    "language_primary": data.get("language"),
                    "stars": data.get("stargazers_count") or 0,
                    "forks": data.get("forks_count") or 0,
                    "open_issues": data.get("open_issues_count") or 0,
                    "watchers": data.get("watchers_count") or 0,
                    "size_kb": data.get("size") or 0,
                    "is_fork": bool(data.get("fork")),
                    "is_archived": bool(data.get("archived")),
                    "parent_repo_id": parent_id,
                    "created_at": _parse_dt(data.get("created_at")),
                    "updated_at": _parse_dt(data.get("updated_at")),
                    "pushed_at": _parse_dt(data.get("pushed_at")),
                },
            )

            # Languages
            languages = client.get_languages(owner, repo)
            total_bytes = sum(languages.values()) or 1
            for lang_name, bytes_count in languages.items():
                cur.execute(
                    """
                    INSERT INTO languages (name) VALUES (%s)
                    ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
                    RETURNING language_id
                    """,
                    (lang_name,),
                )
                language_id = cur.fetchone()["language_id"]
                cur.execute(
                    """
                    INSERT INTO repo_languages (repo_id, language_id, bytes, share_pct)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (repo_id, language_id) DO UPDATE SET
                        bytes = EXCLUDED.bytes,
                        share_pct = EXCLUDED.share_pct
                    """,
                    (repo_id, language_id, bytes_count, round(bytes_count / total_bytes * 100, 3)),
                )

            # Contributors
            for contributor in client.get_contributors(owner, repo, limit=100):
                cid = _upsert_contributor(cur, contributor)
                if cid is None:
                    continue
                cur.execute(
                    """
                    INSERT INTO repo_contributors (repo_id, contributor_id, contributions)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (repo_id, contributor_id) DO UPDATE SET
                        contributions = EXCLUDED.contributions
                    """,
                    (repo_id, cid, contributor.get("contributions") or 0),
                )

            # Commits (disable activity trigger bulk-update by using ON CONFLICT)
            for commit in client.get_commits(owner, repo, limit=100):
                author = commit.get("author") or {}
                commit_data = commit.get("commit") or {}
                author_info = commit_data.get("author") or {}
                cid = _upsert_contributor(cur, author) if author.get("id") else None
                parents = commit.get("parents") or []
                parent_sha = parents[0]["sha"] if parents else None
                sha = commit.get("sha")
                if not sha:
                    continue
                cur.execute(
                    """
                    INSERT INTO commits (
                        repo_id, sha, contributor_id, message, committed_at, parent_sha, html_url
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (repo_id, sha) DO UPDATE SET
                        contributor_id = COALESCE(EXCLUDED.contributor_id, commits.contributor_id),
                        message = EXCLUDED.message,
                        committed_at = EXCLUDED.committed_at,
                        parent_sha = EXCLUDED.parent_sha
                    """,
                    (
                        repo_id,
                        sha,
                        cid,
                        (commit_data.get("message") or "")[:4000],
                        _parse_dt(author_info.get("date")),
                        parent_sha,
                        commit.get("html_url"),
                    ),
                )

            # Issues (includes PRs flagged)
            for issue in client.get_issues(owner, repo, limit=100):
                user = issue.get("user")
                author_id = _upsert_contributor(cur, user)
                is_pr = "pull_request" in issue
                cur.execute(
                    """
                    INSERT INTO issues (
                        repo_id, number, title, state, author_id, is_pull_request,
                        created_at, updated_at, closed_at, html_url
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (repo_id, number) DO UPDATE SET
                        title = EXCLUDED.title,
                        state = EXCLUDED.state,
                        author_id = COALESCE(EXCLUDED.author_id, issues.author_id),
                        is_pull_request = EXCLUDED.is_pull_request,
                        updated_at = EXCLUDED.updated_at,
                        closed_at = EXCLUDED.closed_at
                    RETURNING issue_id
                    """,
                    (
                        repo_id,
                        issue["number"],
                        issue.get("title"),
                        issue.get("state") or "open",
                        author_id,
                        is_pr,
                        _parse_dt(issue.get("created_at")),
                        _parse_dt(issue.get("updated_at")),
                        _parse_dt(issue.get("closed_at")),
                        issue.get("html_url"),
                    ),
                )
                issue_id = cur.fetchone()["issue_id"]
                cur.execute("DELETE FROM issue_labels WHERE issue_id = %s", (issue_id,))
                for label in issue.get("labels") or []:
                    label_name = label.get("name") if isinstance(label, dict) else str(label)
                    if not label_name:
                        continue
                    cur.execute(
                        """
                        INSERT INTO issue_labels (issue_id, label)
                        VALUES (%s, %s)
                        ON CONFLICT DO NOTHING
                        """,
                        (issue_id, label_name),
                    )

            # Pull requests
            for pr in client.get_pulls(owner, repo, limit=50):
                user = pr.get("user")
                author_id = _upsert_contributor(cur, user)
                cur.execute(
                    """
                    INSERT INTO pull_requests (
                        repo_id, number, title, state, author_id, is_merged,
                        created_at, updated_at, closed_at, merged_at,
                        additions, deletions, changed_files, html_url
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (repo_id, number) DO UPDATE SET
                        title = EXCLUDED.title,
                        state = EXCLUDED.state,
                        author_id = COALESCE(EXCLUDED.author_id, pull_requests.author_id),
                        is_merged = EXCLUDED.is_merged,
                        updated_at = EXCLUDED.updated_at,
                        closed_at = EXCLUDED.closed_at,
                        merged_at = EXCLUDED.merged_at,
                        additions = EXCLUDED.additions,
                        deletions = EXCLUDED.deletions,
                        changed_files = EXCLUDED.changed_files
                    """,
                    (
                        repo_id,
                        pr["number"],
                        pr.get("title"),
                        pr.get("state") or "open",
                        author_id,
                        bool(pr.get("merged_at")),
                        _parse_dt(pr.get("created_at")),
                        _parse_dt(pr.get("updated_at")),
                        _parse_dt(pr.get("closed_at")),
                        _parse_dt(pr.get("merged_at")),
                        pr.get("additions") or 0,
                        pr.get("deletions") or 0,
                        pr.get("changed_files") or 0,
                        pr.get("html_url"),
                    ),
                )

    return repo_id


def refresh_analytics(conn: Connection) -> None:
    with conn.cursor() as cur:
        cur.execute("CALL sp_refresh_analytics()")
    conn.commit()


def run_ingest(
    query: Optional[str] = None,
    limit: int = 20,
    repos: Optional[list[str]] = None,
    use_seed: bool = True,
) -> dict[str, Any]:
    """Ingest repositories from an explicit list, search query, and/or seed set."""
    targets: list[str] = []
    if repos:
        targets.extend(repos)
    if use_seed and not repos and not query:
        targets.extend(DEFAULT_SEED_REPOS[:limit])

    with GitHubClient() as client:
        if query:
            found = client.search_repositories(query, limit=limit)
            for item in found:
                full = item.get("full_name")
                if full and full not in targets:
                    targets.append(full)

        # Deduplicate while preserving order
        seen: set[str] = set()
        unique_targets = []
        for t in targets:
            key = t.lower()
            if key not in seen:
                seen.add(key)
                unique_targets.append(t)
        unique_targets = unique_targets[:limit]

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO sync_runs (status, query_used, repos_synced)
                    VALUES ('running', %s, 0)
                    RETURNING sync_id
                    """,
                    (query or ",".join(unique_targets[:5]),),
                )
                sync_id = cur.fetchone()["sync_id"]
            conn.commit()

            synced = 0
            errors: list[str] = []
            for full_name in unique_targets:
                try:
                    owner, name = full_name.split("/", 1)
                    sync_repository(conn, client, owner, name)
                    synced += 1
                except Exception as exc:  # noqa: BLE001 — collect and continue
                    errors.append(f"{full_name}: {exc}")

            try:
                refresh_analytics(conn)
            except Exception as exc:  # noqa: BLE001
                errors.append(f"analytics: {exc}")

            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE sync_runs
                    SET finished_at = NOW(),
                        status = %s,
                        repos_synced = %s,
                        error_message = %s
                    WHERE sync_id = %s
                    """,
                    (
                        "completed" if not errors else "completed_with_errors",
                        synced,
                        "\n".join(errors)[:4000] if errors else None,
                        sync_id,
                    ),
                )
            conn.commit()

    return {
        "sync_id": sync_id,
        "repos_requested": len(unique_targets),
        "repos_synced": synced,
        "errors": errors,
        "targets": unique_targets,
    }
