from typing import Any, Optional

from fastapi import APIRouter, Header, HTTPException, Query

from app.config import get_settings
from app.db import execute, fetch_all, fetch_one
from app.services.ingest import run_ingest

router = APIRouter(prefix="/api")


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/dashboard")
def dashboard() -> dict[str, Any]:
    kpis = fetch_one("SELECT * FROM v_dashboard_kpis") or {}
    languages = fetch_all(
        """
        SELECT language_name, repo_count, total_bytes, popularity_rank
        FROM v_language_popularity
        ORDER BY popularity_rank
        LIMIT 10
        """
    )
    activity = fetch_all(
        """
        SELECT activity_date, commit_count, active_repos, active_contributors
        FROM v_commit_activity_daily
        ORDER BY activity_date
        """
    )
    top_repos = fetch_all(
        """
        SELECT repo_id, full_name, stars, health_score, language_primary, html_url
        FROM v_repo_health
        ORDER BY health_score DESC, stars DESC
        LIMIT 10
        """
    )
    top_orgs = fetch_all(
        """
        SELECT org_id, org_login, repo_count, total_stars, avg_health_score, top_language, org_rank
        FROM v_org_analytics
        ORDER BY org_rank
        LIMIT 5
        """
    )
    recent_syncs = fetch_all(
        """
        SELECT sync_id, started_at, finished_at, status, repos_synced, query_used, duration_seconds
        FROM v_sync_history
        LIMIT 5
        """
    )
    return {
        "kpis": kpis,
        "languages": languages,
        "activity": activity,
        "top_repos": top_repos,
        "top_orgs": top_orgs,
        "recent_syncs": recent_syncs,
    }


@router.get("/repos")
def list_repos(
    q: Optional[str] = None,
    sort: str = Query("health", pattern="^(health|stars|activity|name)$"),
    filter: Optional[str] = Query(None, pattern="^(beginner|abandoned|active)?$"),
    language: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    clauses = ["1=1"]
    params: dict[str, Any] = {"limit": limit, "offset": offset}

    if q:
        clauses.append("(h.full_name ILIKE %(q)s OR COALESCE(h.description, '') ILIKE %(q)s)")
        params["q"] = f"%{q}%"
    if language:
        clauses.append("h.language_primary ILIKE %(language)s")
        params["language"] = language

    base_from = "v_repo_health h"
    if filter == "beginner":
        base_from = "v_beginner_friendly h"
    elif filter == "abandoned":
        base_from = "v_inactive_repos h"
    elif filter == "active":
        clauses.append("h.is_abandoned = FALSE AND h.is_archived = FALSE")

    if sort == "stars":
        order = "h.stars DESC"
    elif sort == "name":
        order = "h.full_name ASC"
    elif sort == "activity":
        order = (
            "h.health_score DESC, h.stars DESC"
            if filter == "beginner"
            else "h.pushed_at DESC NULLS LAST"
        )
    else:
        order = "h.health_score DESC, h.stars DESC"

    where = " AND ".join(clauses)
    rows = fetch_all(
        f"""
        SELECT h.*
        FROM {base_from}
        WHERE {where}
        ORDER BY {order}
        LIMIT %(limit)s OFFSET %(offset)s
        """,
        params,
    )
    count_row = fetch_one(
        f"SELECT COUNT(*) AS total FROM {base_from} WHERE {where}",
        {k: v for k, v in params.items() if k not in ("limit", "offset")},
    )
    return {"items": rows, "total": count_row["total"] if count_row else 0}


@router.get("/repos/{repo_id}")
def get_repo(repo_id: int) -> dict[str, Any]:
    repo = fetch_one("SELECT * FROM v_repo_health WHERE repo_id = %s", (repo_id,))
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    languages = fetch_all(
        """
        SELECT l.name AS language_name, rl.bytes, rl.share_pct
        FROM repo_languages rl
        JOIN languages l ON l.language_id = rl.language_id
        WHERE rl.repo_id = %s
        ORDER BY rl.bytes DESC
        """,
        (repo_id,),
    )
    contributors = fetch_all(
        """
        SELECT c.contributor_id, c.login, c.html_url, c.avatar_url, rc.contributions
        FROM repo_contributors rc
        JOIN contributors c ON c.contributor_id = rc.contributor_id
        WHERE rc.repo_id = %s
        ORDER BY rc.contributions DESC
        LIMIT 25
        """,
        (repo_id,),
    )
    issues = fetch_all(
        """
        SELECT issue_id, number, title, state, is_pull_request, created_at, closed_at, html_url
        FROM issues
        WHERE repo_id = %s AND NOT is_pull_request
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 20
        """,
        (repo_id,),
    )
    pulls = fetch_all(
        """
        SELECT pr_id, number, title, state, is_merged, created_at, merged_at, html_url
        FROM pull_requests
        WHERE repo_id = %s
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 20
        """,
        (repo_id,),
    )
    report = fetch_one("SELECT fn_generate_repo_report(%s) AS report", (repo_id,))
    return {
        "repo": repo,
        "languages": languages,
        "contributors": contributors,
        "issues": issues,
        "pull_requests": pulls,
        "report": report["report"] if report else {},
    }


@router.get("/repos/{repo_id}/fork-tree")
def fork_tree(repo_id: int) -> dict[str, Any]:
    exists = fetch_one("SELECT repo_id FROM repositories WHERE repo_id = %s", (repo_id,))
    if not exists:
        raise HTTPException(status_code=404, detail="Repository not found")
    nodes = fetch_all("SELECT * FROM fn_repo_fork_tree(%s)", (repo_id,))
    return {"repo_id": repo_id, "nodes": nodes}


@router.get("/repos/{repo_id}/health-factors")
def health_factors(repo_id: int) -> dict[str, Any]:
    row = fetch_one("SELECT * FROM v_health_factors WHERE repo_id = %s", (repo_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Repository not found")
    return {"item": row}


@router.get("/repos/{repo_id}/activity-monthly")
def activity_monthly(repo_id: int) -> dict[str, Any]:
    exists = fetch_one("SELECT repo_id FROM repositories WHERE repo_id = %s", (repo_id,))
    if not exists:
        raise HTTPException(status_code=404, detail="Repository not found")
    items = fetch_all(
        """
        SELECT *
        FROM v_repo_monthly_activity
        WHERE repo_id = %s
        ORDER BY activity_month
        """,
        (repo_id,),
    )
    return {"repo_id": repo_id, "items": items}


@router.get("/compare")
def compare_repos(
    ids: str = Query(..., description="Comma-separated repo IDs, max 3"),
) -> dict[str, Any]:
    try:
        repo_ids = [int(x.strip()) for x in ids.split(",") if x.strip()]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="ids must be integers") from exc
    if not repo_ids or len(repo_ids) > 3:
        raise HTTPException(status_code=400, detail="Provide 1–3 repository ids")
    items = fetch_all("SELECT * FROM fn_compare_repos(%s)", (repo_ids,))
    return {"ids": repo_ids, "items": items}


@router.get("/orgs")
def list_orgs(limit: int = Query(50, ge=1, le=200)) -> dict[str, Any]:
    items = fetch_all(
        """
        SELECT *
        FROM v_org_analytics
        ORDER BY org_rank
        LIMIT %s
        """,
        (limit,),
    )
    return {"items": items, "total": len(items)}


@router.get("/orgs/{org_id}")
def get_org(org_id: int) -> dict[str, Any]:
    org = fetch_one("SELECT * FROM v_org_analytics WHERE org_id = %s", (org_id,))
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    repos = fetch_all(
        """
        SELECT repo_id, full_name, stars, health_score, language_primary, html_url,
               is_abandoned, is_archived, pushed_at
        FROM v_repo_health
        WHERE owner_login = %s OR repo_id IN (
            SELECT repo_id FROM repositories WHERE org_id = %s
        )
        ORDER BY health_score DESC, stars DESC
        """,
        (org["org_login"], org_id),
    )
    return {"org": org, "repos": repos}


@router.get("/sync-runs")
def sync_runs(limit: int = Query(20, ge=1, le=100)) -> dict[str, Any]:
    items = fetch_all(
        """
        SELECT *
        FROM v_sync_history
        ORDER BY started_at DESC
        LIMIT %s
        """,
        (limit,),
    )
    return {"items": items}


@router.get("/contributors")
def list_contributors(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    items = fetch_all(
        """
        SELECT *
        FROM v_contributor_rankings
        ORDER BY contribution_rank
        LIMIT %s OFFSET %s
        """,
        (limit, offset),
    )
    total = fetch_one("SELECT COUNT(*) AS total FROM v_contributor_rankings")
    return {"items": items, "total": total["total"] if total else 0}


@router.get("/languages")
def list_languages() -> dict[str, Any]:
    items = fetch_all(
        """
        SELECT *
        FROM v_language_popularity
        ORDER BY popularity_rank
        """
    )
    return {"items": items}


@router.get("/beginner-friendly")
def beginner_friendly(limit: int = Query(50, ge=1, le=200)) -> dict[str, Any]:
    items = fetch_all(
        """
        SELECT *
        FROM v_beginner_friendly
        ORDER BY beginner_label_count DESC, health_score DESC
        LIMIT %s
        """,
        (limit,),
    )
    return {"items": items}


@router.get("/inactive")
def inactive_repos(limit: int = Query(50, ge=1, le=200)) -> dict[str, Any]:
    items = fetch_all(
        """
        SELECT *
        FROM v_inactive_repos
        ORDER BY days_since_push DESC NULLS LAST
        LIMIT %s
        """,
        (limit,),
    )
    return {"items": items}


@router.get("/ingest/status")
def ingest_status() -> dict[str, Any]:
    settings = get_settings()
    last = fetch_one(
        """
        SELECT *
        FROM v_sync_history
        ORDER BY started_at DESC
        LIMIT 1
        """
    )
    token_configured = bool(settings.github_token and settings.github_token.strip())
    authenticated_login: Optional[str] = None
    token_valid = False
    if token_configured:
        from app.services.github_client import GitHubClient

        with GitHubClient() as client:
            user = client.get_authenticated_user()
            if user and user.get("login"):
                authenticated_login = str(user["login"])
                token_valid = True
    return {
        "github_token_configured": token_configured,
        "token_valid": token_valid,
        "authenticated_login": authenticated_login,
        "last_sync": last,
    }


@router.post("/ingest")
def trigger_ingest(
    payload: Optional[dict[str, Any]] = None,
    x_admin_token: Optional[str] = Header(default=None),
) -> dict[str, Any]:
    settings = get_settings()
    if x_admin_token != settings.admin_token:
        raise HTTPException(status_code=401, detail="Invalid admin token")

    body = payload or {}
    result = run_ingest(
        query=body.get("query"),
        limit=int(body.get("limit") or 10),
        repos=body.get("repos"),
        use_seed=bool(body.get("use_seed", True)),
    )
    return result


@router.post("/analytics/refresh")
def refresh_analytics(x_admin_token: Optional[str] = Header(default=None)) -> dict[str, str]:
    settings = get_settings()
    if x_admin_token != settings.admin_token:
        raise HTTPException(status_code=401, detail="Invalid admin token")
    execute("CALL sp_refresh_analytics()")
    return {"status": "refreshed"}
