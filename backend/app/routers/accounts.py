"""Signed-in user routes: repo requests, watchlist, alerts."""

from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Body, HTTPException, Request
from fastapi.responses import JSONResponse

from app.auth import private_cache_headers, require_user
from app.db import execute, fetch_all, fetch_one, get_connection
from app.services.github_client import GitHubClient
from app.worker import drain_requests

router = APIRouter(prefix="/api", tags=["accounts"])

REPO_NAME_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")


def _serialize(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {k: _serialize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_serialize(v) for v in obj]
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, date):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, UUID):
        return str(obj)
    return obj


def _json(data: Any, status_code: int = 200) -> JSONResponse:
    return JSONResponse(
        _serialize(data), status_code=status_code, headers=private_cache_headers()
    )


@router.post("/requests")
def create_request(
    request: Request,
    background_tasks: BackgroundTasks,
    payload: Optional[dict[str, Any]] = Body(default=None),
) -> JSONResponse:
    user = require_user(request)
    body = payload or {}
    full_name = (body.get("full_name") or body.get("repo") or "").strip()
    if full_name.startswith("https://github.com/"):
        full_name = full_name.removeprefix("https://github.com/").strip("/")
    if not REPO_NAME_RE.match(full_name):
        raise HTTPException(status_code=400, detail="Provide owner/name")

    owner, name = full_name.split("/", 1)
    full_name = f"{owner}/{name}"

    recent = fetch_one(
        """
        SELECT COUNT(*)::INT AS n
        FROM ingest_requests
        WHERE user_id = %s AND requested_at >= NOW() - INTERVAL '1 day'
        """,
        (user["user_id"],),
    )
    if recent and recent["n"] >= 5:
        raise HTTPException(status_code=429, detail="Limit of 5 repo requests per day")

    existing = fetch_one(
        """
        SELECT request_id, status
        FROM ingest_requests
        WHERE lower(full_name) = lower(%s) AND status IN ('queued', 'running')
        """,
        (full_name,),
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Already {existing['status']} as request #{existing['request_id']}",
        )

    with GitHubClient() as client:
        remote = client.get_repo(owner, name)
    if not remote:
        raise HTTPException(status_code=404, detail="Repository not found on GitHub")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO ingest_requests (user_id, full_name, status)
                VALUES (%s, %s, 'queued')
                RETURNING request_id, user_id, full_name, status, requested_at
                """,
                (user["user_id"], remote.get("full_name") or full_name),
            )
            row = cur.fetchone()
        conn.commit()

    background_tasks.add_task(drain_requests, 5)
    return _json({"item": dict(row), "message": "Queued for ingest"}, status_code=202)


@router.get("/requests/mine")
def my_requests(request: Request) -> JSONResponse:
    user = require_user(request)
    items = fetch_all(
        """
        SELECT request_id, full_name, status, requested_at, started_at, finished_at,
               error_message, repo_id
        FROM ingest_requests
        WHERE user_id = %s
        ORDER BY requested_at DESC
        LIMIT 50
        """,
        (user["user_id"],),
    )
    return _json({"items": items})


@router.get("/watchlist")
def get_watchlist(request: Request) -> JSONResponse:
    user = require_user(request)
    items = fetch_all(
        """
        SELECT
            w.repo_id,
            w.created_at,
            w.last_seen_health,
            w.last_seen_abandoned,
            w.last_seen_beginner_count,
            h.full_name,
            h.stars,
            h.health_score,
            h.language_primary,
            h.is_abandoned,
            h.html_url
        FROM watchlist w
        JOIN v_repo_health h ON h.repo_id = w.repo_id
        WHERE w.user_id = %s
        ORDER BY w.created_at DESC
        """,
        (user["user_id"],),
    )
    return _json({"items": items})


@router.post("/watchlist")
def add_watch(
    request: Request,
    payload: Optional[dict[str, Any]] = Body(default=None),
) -> JSONResponse:
    user = require_user(request)
    body = payload or {}
    try:
        repo_id = int(body.get("repo_id"))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="repo_id required") from exc

    repo = fetch_one(
        """
        SELECT repo_id, health_score, is_abandoned FROM v_repo_health WHERE repo_id = %s
        """,
        (repo_id,),
    )
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    beginner = fetch_one(
        """
        SELECT COUNT(DISTINCT i.issue_id)::INT AS n
        FROM issues i
        JOIN issue_labels il ON il.issue_id = i.issue_id
        WHERE i.repo_id = %s AND i.state = 'open' AND NOT i.is_pull_request
          AND LOWER(il.label) IN (
              'good first issue', 'good-first-issue',
              'help wanted', 'help-wanted', 'beginner', 'easy'
          )
        """,
        (repo_id,),
    )
    beginner_count = (beginner or {}).get("n") or 0

    execute(
        """
        INSERT INTO watchlist (
            user_id, repo_id, last_seen_health, last_seen_abandoned, last_seen_beginner_count
        ) VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (user_id, repo_id) DO NOTHING
        """,
        (
            user["user_id"],
            repo_id,
            repo["health_score"],
            repo["is_abandoned"],
            beginner_count,
        ),
    )
    return _json({"status": "watching", "repo_id": repo_id})


@router.delete("/watchlist/{repo_id}")
def remove_watch(request: Request, repo_id: int) -> JSONResponse:
    user = require_user(request)
    execute(
        "DELETE FROM watchlist WHERE user_id = %s AND repo_id = %s",
        (user["user_id"], repo_id),
    )
    return _json({"status": "removed", "repo_id": repo_id})


@router.get("/alerts")
def list_alerts(request: Request) -> JSONResponse:
    user = require_user(request)
    items = fetch_all(
        """
        SELECT
            a.alert_id, a.repo_id, a.kind, a.details, a.created_at, a.read_at,
            r.full_name
        FROM alerts a
        LEFT JOIN repositories r ON r.repo_id = a.repo_id
        WHERE a.user_id = %s
        ORDER BY a.created_at DESC
        LIMIT 100
        """,
        (user["user_id"],),
    )
    unread = sum(1 for i in items if i.get("read_at") is None)
    return _json({"items": items, "unread": unread})


@router.post("/alerts/{alert_id}/read")
def mark_alert_read(request: Request, alert_id: int) -> JSONResponse:
    user = require_user(request)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE alerts
                SET read_at = COALESCE(read_at, NOW())
                WHERE alert_id = %s AND user_id = %s
                RETURNING alert_id, read_at
                """,
                (alert_id, user["user_id"]),
            )
            row = cur.fetchone()
        conn.commit()
    if not row:
        raise HTTPException(status_code=404, detail="Alert not found")
    return _json({"item": dict(row)})
