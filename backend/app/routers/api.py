from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response
from fastapi.responses import PlainTextResponse
from starlette.responses import Response as RawResponse

from app.auth import public_cache_headers, require_admin
from app.config import get_settings
from app.db import execute, fetch_all, fetch_one
from app.services.ingest import create_ingest_run, execute_ingest_run

router = APIRouter(prefix="/api")


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/dashboard")
def dashboard(response: Response) -> dict[str, Any]:
    response.headers.update(public_cache_headers())
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
    filter: Optional[str] = Query(None, pattern="^(beginner|abandoned|active|stubs)?$"),
    language: Optional[str] = None,
    include_stubs: bool = Query(False),
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
    elif filter == "stubs":
        base_from = "repositories h"
        clauses.append("COALESCE(h.sync_depth, 'full') = 'stub'")
    elif not include_stubs and filter not in ("beginner", "abandoned"):
        # Default list is full-depth only (v_repo_health already filters stubs)
        pass

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
    settings = get_settings()
    sync_meta = fetch_one(
        """
        SELECT last_full_sync_at, synced_at, COALESCE(sync_depth, 'full') AS sync_depth
        FROM repositories
        WHERE repo_id = %s
        """,
        (repo_id,),
    ) or {}
    oldest = fetch_one(
        """
        SELECT LEAST(
            (SELECT MIN(committed_at) FROM commits WHERE repo_id = %s),
            (SELECT MIN(created_at) FROM issues WHERE repo_id = %s AND NOT is_pull_request),
            (SELECT MIN(created_at) FROM pull_requests WHERE repo_id = %s)
        ) AS oldest_activity
        """,
        (repo_id, repo_id, repo_id),
    )
    return {
        "repo": repo,
        "languages": languages,
        "contributors": contributors,
        "issues": issues,
        "pull_requests": pulls,
        "report": report["report"] if report else {},
        "sample_window": {
            "activity_days": settings.ingest_activity_days,
            "commit_cap": settings.ingest_commit_limit,
            "issue_cap": settings.ingest_issue_limit,
            "pr_cap": settings.ingest_pr_limit,
            "oldest_activity": (oldest or {}).get("oldest_activity"),
            "last_full_sync_at": sync_meta.get("last_full_sync_at"),
            "synced_at": sync_meta.get("synced_at"),
            "sync_depth": sync_meta.get("sync_depth"),
        },
    }


@router.get("/repos/{repo_id}/fork-tree")
def fork_tree(repo_id: int) -> dict[str, Any]:
    exists = fetch_one("SELECT repo_id FROM repositories WHERE repo_id = %s", (repo_id,))
    if not exists:
        raise HTTPException(status_code=404, detail="Repository not found")
    nodes = fetch_all("SELECT * FROM fn_repo_fork_tree(%s)", (repo_id,))
    return {"repo_id": repo_id, "nodes": nodes}


@router.get("/repos/{repo_id}/commit-ancestry")
def commit_ancestry(
    repo_id: int,
    sha: Optional[str] = None,
    max_depth: int = Query(25, ge=1, le=100),
) -> dict[str, Any]:
    exists = fetch_one("SELECT repo_id FROM repositories WHERE repo_id = %s", (repo_id,))
    if not exists:
        raise HTTPException(status_code=404, detail="Repository not found")
    start_sha = sha
    if not start_sha:
        latest = fetch_one(
            """
            SELECT sha FROM commits
            WHERE repo_id = %s
            ORDER BY committed_at DESC NULLS LAST
            LIMIT 1
            """,
            (repo_id,),
        )
        if not latest:
            return {"repo_id": repo_id, "sha": None, "nodes": []}
        start_sha = latest["sha"]
    nodes = fetch_all(
        "SELECT * FROM fn_commit_ancestry(%s, %s, %s)",
        (repo_id, start_sha, max_depth),
    )
    return {"repo_id": repo_id, "sha": start_sha, "nodes": nodes}


@router.post("/repos/{repo_id}/sync")
def sync_one_repo(
    repo_id: int,
    background_tasks: BackgroundTasks,
    _admin: dict = Depends(require_admin),
) -> dict[str, Any]:
    """Fully sync one repository (e.g. promote a fork stub)."""
    row = fetch_one(
        "SELECT owner_login, name, full_name FROM repositories WHERE repo_id = %s",
        (repo_id,),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Repository not found")
    full_name = row["full_name"]
    started = create_ingest_run(
        query=None,
        limit=1,
        repos=[full_name],
        use_seed=False,
    )
    background_tasks.add_task(execute_ingest_run, started["sync_id"], started["targets"])
    return {
        **started,
        "message": f"Sync started for {full_name}; poll GET /api/sync-runs/{started['sync_id']}",
    }


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


@router.get("/repos/{repo_id}/commit-heatmap")
def commit_heatmap(repo_id: int) -> dict[str, Any]:
    exists = fetch_one("SELECT repo_id FROM repositories WHERE repo_id = %s", (repo_id,))
    if not exists:
        raise HTTPException(status_code=404, detail="Repository not found")
    items = fetch_all(
        """
        SELECT weekday, hour_of_day, commit_count
        FROM v_repo_commit_heatmap
        WHERE repo_id = %s
        ORDER BY weekday, hour_of_day
        """,
        (repo_id,),
    )
    return {"repo_id": repo_id, "timezone": "UTC", "items": items}


@router.get("/repos/{repo_id}/issue-flow")
def issue_flow(repo_id: int) -> dict[str, Any]:
    exists = fetch_one("SELECT repo_id FROM repositories WHERE repo_id = %s", (repo_id,))
    if not exists:
        raise HTTPException(status_code=404, detail="Repository not found")
    items = fetch_all(
        """
        SELECT *
        FROM v_repo_issue_flow
        WHERE repo_id = %s
        ORDER BY activity_month
        """,
        (repo_id,),
    )
    totals = fetch_one(
        """
        SELECT
            (SELECT COUNT(*) FILTER (WHERE NOT is_pull_request AND state = 'open')
             FROM issues WHERE repo_id = %s) AS issues_open,
            (SELECT COUNT(*) FILTER (WHERE NOT is_pull_request AND state = 'closed')
             FROM issues WHERE repo_id = %s) AS issues_closed,
            (SELECT COUNT(*) FILTER (WHERE state = 'open')
             FROM pull_requests WHERE repo_id = %s) AS prs_open,
            (SELECT COUNT(*) FILTER (WHERE is_merged)
             FROM pull_requests WHERE repo_id = %s) AS prs_merged,
            (SELECT COUNT(*) FILTER (WHERE state = 'closed' AND NOT is_merged)
             FROM pull_requests WHERE repo_id = %s) AS prs_closed_unmerged
        """,
        (repo_id, repo_id, repo_id, repo_id, repo_id),
    ) or {}
    return {"repo_id": repo_id, "items": items, "totals": totals}


@router.get("/repos/{repo_id}/health-distribution")
def health_distribution(repo_id: int) -> dict[str, Any]:
    exists = fetch_one("SELECT repo_id FROM repositories WHERE repo_id = %s", (repo_id,))
    if not exists:
        raise HTTPException(status_code=404, detail="Repository not found")
    position = fetch_one(
        "SELECT * FROM v_repo_health_position WHERE repo_id = %s",
        (repo_id,),
    )
    buckets = fetch_all(
        """
        SELECT health_bucket, bucket_low, bucket_high, repo_count
        FROM v_health_distribution
        ORDER BY health_bucket
        """
    )
    return {"repo_id": repo_id, "position": position, "buckets": buckets}


@router.get("/health-distribution")
def market_health_distribution() -> dict[str, Any]:
    buckets = fetch_all(
        """
        SELECT health_bucket, bucket_low, bucket_high, repo_count
        FROM v_health_distribution
        ORDER BY health_bucket
        """
    )
    return {"buckets": buckets}


@router.get("/commit-heatmap")
def market_commit_heatmap() -> dict[str, Any]:
    items = fetch_all(
        """
        SELECT weekday, hour_of_day, SUM(commit_count)::BIGINT AS commit_count
        FROM v_repo_commit_heatmap
        GROUP BY weekday, hour_of_day
        ORDER BY weekday, hour_of_day
        """
    )
    return {"timezone": "UTC", "items": items}


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
def beginner_friendly(
    limit: int = Query(50, ge=1, le=200),
    language: Optional[str] = None,
) -> dict[str, Any]:
    clauses = ["1=1"]
    params: dict[str, Any] = {"limit": limit}
    if language:
        clauses.append("language_primary ILIKE %(language)s")
        params["language"] = language
    where = " AND ".join(clauses)
    items = fetch_all(
        f"""
        SELECT *
        FROM v_beginner_friendly
        WHERE {where}
        ORDER BY beginner_label_count DESC, health_score DESC
        LIMIT %(limit)s
        """,
        params,
    )
    # Attach up to 5 open beginner-labeled issues per repo
    for item in items:
        samples = fetch_all(
            """
            SELECT i.issue_id, i.number, i.title, i.html_url, i.state
            FROM issues i
            JOIN issue_labels il ON il.issue_id = i.issue_id
            WHERE i.repo_id = %s
              AND NOT i.is_pull_request
              AND i.state = 'open'
              AND LOWER(il.label) IN (
                    'good first issue', 'good-first-issue',
                    'help wanted', 'help-wanted', 'beginner', 'easy'
              )
            ORDER BY i.updated_at DESC NULLS LAST
            LIMIT 5
            """,
            (item["repo_id"],),
        )
        item["sample_issues"] = samples
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
    rate_limit_remaining: Optional[int] = None
    rate_limit_reset: Optional[str] = None
    rate_limit_limit: Optional[int] = None
    if token_configured:
        from app.services.github_client import GitHubClient

        with GitHubClient() as client:
            user = client.get_authenticated_user()
            if user and user.get("login"):
                authenticated_login = str(user["login"])
                token_valid = True
            quota = client.get_rate_limit()
            rate_limit_remaining = quota.get("rate_limit_remaining")
            rate_limit_reset = quota.get("rate_limit_reset")
            rate_limit_limit = quota.get("rate_limit_limit")
    last_had_rate_limit = False
    if last and last.get("error_message"):
        err = str(last["error_message"]).lower()
        last_had_rate_limit = "rate limit" in err or "429" in err or "secondary rate" in err
    return {
        "github_token_configured": token_configured,
        "token_valid": token_valid,
        "authenticated_login": authenticated_login,
        "rate_limit_remaining": rate_limit_remaining,
        "rate_limit_reset": rate_limit_reset,
        "rate_limit_limit": rate_limit_limit,
        "last_sync_had_rate_limit": last_had_rate_limit,
        "last_sync": last,
        "sample_window": {
            "activity_days": settings.ingest_activity_days,
            "commit_cap": settings.ingest_commit_limit,
            "issue_cap": settings.ingest_issue_limit,
            "pr_cap": settings.ingest_pr_limit,
        },
    }


@router.get("/sync-runs/{sync_id}")
def get_sync_run(sync_id: int) -> dict[str, Any]:
    row = fetch_one(
        """
        SELECT *
        FROM v_sync_history
        WHERE sync_id = %s
        """,
        (sync_id,),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Sync run not found")
    return row


@router.post("/ingest")
def trigger_ingest(
    background_tasks: BackgroundTasks,
    payload: Optional[dict[str, Any]] = None,
    _admin: dict = Depends(require_admin),
) -> dict[str, Any]:
    body = payload or {}
    mode = (body.get("mode") or "").strip().lower()
    query = body.get("query")
    limit = int(body.get("limit") or 10)
    repos = body.get("repos")
    use_seed = bool(body.get("use_seed", True))

    if mode == "surprise":
        query = "stars:500..20000"
        limit = 5
        repos = None
        use_seed = False

    started = create_ingest_run(
        query=query,
        limit=limit,
        repos=repos,
        use_seed=use_seed,
    )
    background_tasks.add_task(execute_ingest_run, started["sync_id"], started["targets"])
    return {
        **started,
        "message": "Ingest started in background; poll GET /api/sync-runs/{sync_id}",
    }


@router.post("/analytics/refresh")
def refresh_analytics_endpoint(
    _admin: dict = Depends(require_admin),
) -> dict[str, str]:
    execute("CALL sp_refresh_analytics()")
    return {"status": "refreshed"}


@router.get("/badge/{owner}/{repo_name}.svg")
def health_badge(owner: str, repo_name: str) -> RawResponse:
    """Embeddable SVG health badge for README files."""
    row = fetch_one(
        """
        SELECT full_name, health_score
        FROM v_repo_health
        WHERE lower(owner_login) = lower(%s) AND lower(name) = lower(%s)
        """,
        (owner, repo_name),
    )
    if not row:
        label, value, color = "health", "n/a", "#9e9e9e"
    else:
        score = float(row["health_score"] or 0)
        label = "health"
        value = f"{score:.0f}"
        if score >= 75:
            color = "#2da44e"
        elif score >= 50:
            color = "#bf8700"
        else:
            color = "#cf222e"
    # Simple shields-style SVG
    left_w = 54
    right_w = 36
    total = left_w + right_w
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{total}" height="20" role="img" aria-label="{label}: {value}">
  <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
  <rect rx="3" width="{total}" height="20" fill="#555"/>
  <rect rx="3" x="{left_w}" width="{right_w}" height="20" fill="{color}"/>
  <path fill="{color}" d="M{left_w} 0h4v20h-4z"/>
  <rect rx="3" width="{total}" height="20" fill="url(#s)"/>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="{left_w / 2}" y="15" fill="#010101" fill-opacity=".3">{label}</text>
    <text x="{left_w / 2}" y="14">{label}</text>
    <text x="{left_w + right_w / 2}" y="15" fill="#010101" fill-opacity=".3">{value}</text>
    <text x="{left_w + right_w / 2}" y="14">{value}</text>
  </g>
</svg>"""
    return RawResponse(
        content=svg,
        media_type="image/svg+xml",
        headers={
            "Cache-Control": "public, max-age=600",
            "Content-Disposition": "inline",
        },
    )


@router.get("/sitemap.xml", response_class=PlainTextResponse)
def sitemap() -> PlainTextResponse:
    settings = get_settings()
    base = settings.frontend_url.rstrip("/")
    static_paths = ["", "/repos", "/compare", "/orgs", "/beginner", "/insights", "/about"]
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for path in static_paths:
        lines.append(f"  <url><loc>{base}{path or '/'}</loc></url>")
    repos = fetch_all(
        """
        SELECT repo_id FROM v_repo_health
        ORDER BY health_score DESC, stars DESC
        LIMIT 500
        """
    )
    for r in repos:
        lines.append(f"  <url><loc>{base}/repos/{r['repo_id']}</loc></url>")
    lines.append("</urlset>")
    return PlainTextResponse(
        "\n".join(lines),
        media_type="application/xml",
        headers=public_cache_headers(),
    )
