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
            stars, forks_count, open_issues_count, sync_depth, synced_at
        )
        VALUES (
            %(repo_id)s, %(owner_login)s, %(name)s, %(full_name)s, %(html_url)s, TRUE,
            %(stars)s, %(forks)s, %(open_issues)s, 'stub', NOW()
        )
        ON CONFLICT (repo_id) DO UPDATE SET
            sync_depth = CASE
                WHEN repositories.sync_depth = 'full' THEN repositories.sync_depth
                ELSE 'stub'
            END,
            synced_at = NOW()
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


def _upsert_child_fork(cur: Any, fork: dict, parent_repo_id: int) -> Optional[int]:
    """Lightweight child fork row so fn_repo_fork_tree has demo data."""
    if not fork or not fork.get("id"):
        return None
    owner = fork.get("owner") or {}
    cur.execute(
        """
        INSERT INTO repositories (
            repo_id, owner_login, name, full_name, html_url, description,
            language_primary, stars, forks_count, open_issues_count,
            is_fork, parent_repo_id, sync_depth,
            created_at, updated_at, pushed_at, synced_at
        )
        VALUES (
            %(repo_id)s, %(owner_login)s, %(name)s, %(full_name)s, %(html_url)s, %(description)s,
            %(language_primary)s, %(stars)s, %(forks)s, %(open_issues)s,
            TRUE, %(parent_repo_id)s, 'stub',
            %(created_at)s, %(updated_at)s, %(pushed_at)s, NOW()
        )
        ON CONFLICT (repo_id) DO UPDATE SET
            parent_repo_id = COALESCE(EXCLUDED.parent_repo_id, repositories.parent_repo_id),
            stars = EXCLUDED.stars,
            forks_count = EXCLUDED.forks_count,
            sync_depth = CASE
                WHEN repositories.sync_depth = 'full' THEN repositories.sync_depth
                ELSE 'stub'
            END,
            synced_at = NOW()
        """,
        {
            "repo_id": fork["id"],
            "owner_login": owner.get("login") or fork.get("full_name", "/").split("/")[0],
            "name": fork.get("name") or fork.get("full_name", "/").split("/")[-1],
            "full_name": fork.get("full_name"),
            "html_url": fork.get("html_url"),
            "description": fork.get("description"),
            "language_primary": fork.get("language"),
            "stars": fork.get("stargazers_count") or 0,
            "forks": fork.get("forks_count") or 0,
            "open_issues": fork.get("open_issues_count") or 0,
            "parent_repo_id": parent_repo_id,
            "created_at": _parse_dt(fork.get("created_at")),
            "updated_at": _parse_dt(fork.get("updated_at")),
            "pushed_at": _parse_dt(fork.get("pushed_at")),
        },
    )
    return int(fork["id"])


def _upsert_issue(cur: Any, repo_id: int, issue: dict) -> Optional[int]:
    """Upsert one issue (and its labels). Returns issue_id."""
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
    return int(issue_id)


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
                    sync_depth, created_at, updated_at, pushed_at, last_activity_at, synced_at
                ) VALUES (
                    %(repo_id)s, %(org_id)s, %(owner_login)s, %(name)s, %(full_name)s, %(description)s,
                    %(html_url)s, %(default_branch)s, %(language_primary)s, %(stars)s, %(forks)s,
                    %(open_issues)s, %(watchers)s, %(size_kb)s, %(is_fork)s, %(is_archived)s,
                    %(parent_repo_id)s, 'full', %(created_at)s, %(updated_at)s, %(pushed_at)s,
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
                    sync_depth = 'full',
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

            # Languages — replace snapshot so removed languages do not linger
            cur.execute("DELETE FROM repo_languages WHERE repo_id = %s", (repo_id,))
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

            # Contributors — replace snapshot
            cur.execute("DELETE FROM repo_contributors WHERE repo_id = %s", (repo_id,))
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

            # Issues (newest sample) + targeted beginner labels
            seen_issue_numbers: set[int] = set()
            for issue in client.get_issues(owner, repo, limit=100):
                if not issue.get("number"):
                    continue
                seen_issue_numbers.add(int(issue["number"]))
                _upsert_issue(cur, repo_id, issue)

            for label in ("good first issue", "help wanted", "beginner"):
                try:
                    labeled = client.get_labeled_issues(owner, repo, label, limit=30)
                except Exception:
                    labeled = []
                for issue in labeled:
                    num = issue.get("number")
                    if not num or int(num) in seen_issue_numbers:
                        continue
                    seen_issue_numbers.add(int(num))
                    _upsert_issue(cur, repo_id, issue)

            # Pull requests — list endpoint omits additions/deletions/changed_files
            for pr in client.get_pulls(owner, repo, limit=50):
                user = pr.get("user")
                author_id = _upsert_contributor(cur, user)
                # Only store churn when GitHub actually returned the fields
                additions = pr.get("additions") if "additions" in pr else None
                deletions = pr.get("deletions") if "deletions" in pr else None
                changed_files = pr.get("changed_files") if "changed_files" in pr else None
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
                        additions,
                        deletions,
                        changed_files,
                        pr.get("html_url"),
                    ),
                )

            # Sample child forks so RepoDetail Forks tab / fn_repo_fork_tree has data
            # Failures here must not roll back the full sync (GitHub sometimes 500s /forks)
            forks_count = int(data.get("forks_count") or 0)
            if forks_count > 0 and forks_count < 50000:
                try:
                    for fork in client.get_forks(owner, repo, limit=5):
                        _upsert_child_fork(cur, fork, repo_id)
                except Exception:
                    pass

    return repo_id


def refresh_analytics(conn: Connection) -> None:
    with conn.cursor() as cur:
        cur.execute("CALL sp_refresh_analytics()")
    conn.commit()


def resolve_ingest_targets(
    query: Optional[str] = None,
    limit: int = 20,
    repos: Optional[list[str]] = None,
    use_seed: bool = True,
) -> list[str]:
    """Resolve owner/repo targets from seed list, explicit repos, and/or search."""
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

    seen: set[str] = set()
    unique_targets: list[str] = []
    for t in targets:
        key = t.lower()
        if key not in seen:
            seen.add(key)
            unique_targets.append(t)
    return unique_targets[:limit]


def _update_sync_progress(
    conn: Connection,
    sync_id: int,
    *,
    synced: Optional[int] = None,
    status: Optional[str] = None,
    error_message: Optional[str] = None,
    finished: bool = False,
    set_error: bool = False,
) -> None:
    parts = []
    params: dict[str, Any] = {"sync_id": sync_id}
    if synced is not None:
        parts.append("repos_synced = %(synced)s")
        params["synced"] = synced
    if status is not None:
        parts.append("status = %(status)s")
        params["status"] = status
    if set_error:
        parts.append("error_message = %(error_message)s")
        params["error_message"] = error_message
    if finished:
        parts.append("finished_at = NOW()")
    if not parts:
        return
    with conn.cursor() as cur:
        cur.execute(
            f"UPDATE sync_runs SET {', '.join(parts)} WHERE sync_id = %(sync_id)s",
            params,
        )
    conn.commit()


def execute_ingest_run(sync_id: int, targets: list[str]) -> dict[str, Any]:
    """Run ingest for an existing sync_runs row; updates progress after each repo."""
    synced = 0
    errors: list[str] = []
    try:
        with GitHubClient() as client:
            with get_connection() as conn:
                _update_sync_progress(conn, sync_id, status="running", synced=0)
                for full_name in targets:
                    try:
                        owner, name = full_name.split("/", 1)
                        sync_repository(conn, client, owner, name)
                        synced += 1
                    except Exception as exc:  # noqa: BLE001 — collect and continue
                        errors.append(f"{full_name}: {exc}")
                        conn.rollback()
                    try:
                        _update_sync_progress(conn, sync_id, synced=synced)
                    except Exception:
                        conn.rollback()
                        _update_sync_progress(conn, sync_id, synced=synced)

                try:
                    refresh_analytics(conn)
                except Exception as exc:  # noqa: BLE001
                    errors.append(f"analytics: {exc}")
                    conn.rollback()

                _update_sync_progress(
                    conn,
                    sync_id,
                    synced=synced,
                    status="completed" if not errors else "completed_with_errors",
                    error_message="\n".join(errors)[:4000] if errors else None,
                    set_error=True,
                    finished=True,
                )
    except Exception as exc:  # noqa: BLE001 — mark run failed if worker crashes
        with get_connection() as conn:
            _update_sync_progress(
                conn,
                sync_id,
                synced=synced,
                status="failed",
                error_message=str(exc)[:4000],
                set_error=True,
                finished=True,
            )
        raise

    return {
        "sync_id": sync_id,
        "repos_requested": len(targets),
        "repos_synced": synced,
        "errors": errors,
        "targets": targets,
    }


def create_ingest_run(
    query: Optional[str] = None,
    limit: int = 20,
    repos: Optional[list[str]] = None,
    use_seed: bool = True,
) -> dict[str, Any]:
    """Create a sync_runs row and resolve targets (does not fetch repo graphs yet)."""
    targets = resolve_ingest_targets(query=query, limit=limit, repos=repos, use_seed=use_seed)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO sync_runs (status, query_used, repos_synced, repos_requested)
                VALUES ('queued', %s, 0, %s)
                RETURNING sync_id
                """,
                (query or ",".join(targets[:5]), len(targets)),
            )
            sync_id = cur.fetchone()["sync_id"]
        conn.commit()
    return {
        "sync_id": sync_id,
        "repos_requested": len(targets),
        "repos_synced": 0,
        "status": "queued",
        "targets": targets,
        "errors": [],
    }


def run_ingest(
    query: Optional[str] = None,
    limit: int = 20,
    repos: Optional[list[str]] = None,
    use_seed: bool = True,
) -> dict[str, Any]:
    """Ingest repositories synchronously (CLI / scripts)."""
    started = create_ingest_run(query=query, limit=limit, repos=repos, use_seed=use_seed)
    return execute_ingest_run(started["sync_id"], started["targets"])
