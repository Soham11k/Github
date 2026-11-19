"""GitHub OAuth sign-in routes."""

from __future__ import annotations

import secrets
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse

from app.auth import (
    clear_session_cookie,
    create_session_token,
    get_session_user,
    private_cache_headers,
    require_user,
    set_session_cookie,
    upsert_oauth_user,
)
from app.config import get_settings
from app.db import get_connection

router = APIRouter(prefix="/api", tags=["auth"])

OAUTH_STATE_COOKIE = "repopulse_oauth_state"


@router.get("/auth/github/login")
def github_login() -> Response:
    settings = get_settings()
    if not settings.github_oauth_client_id:
        raise HTTPException(status_code=503, detail="GitHub OAuth is not configured")
    state = secrets.token_urlsafe(24)
    params = urlencode(
        {
            "client_id": settings.github_oauth_client_id,
            "redirect_uri": settings.github_oauth_redirect_uri,
            "scope": "read:user",
            "state": state,
            "allow_signup": "true",
        }
    )
    response = RedirectResponse(
        url=f"https://github.com/login/oauth/authorize?{params}",
        status_code=302,
    )
    response.set_cookie(
        key=OAUTH_STATE_COOKIE,
        value=state,
        max_age=600,
        httponly=True,
        secure=settings.cookie_secure or settings.is_production,
        samesite="lax",
        path="/",
    )
    return response


@router.get("/auth/github/callback")
def github_callback(
    request: Request,
    code: str = Query(...),
    state: str = Query(...),
) -> Response:
    settings = get_settings()
    cookie_state = request.cookies.get(OAUTH_STATE_COOKIE)
    if not cookie_state or not secrets.compare_digest(cookie_state, state):
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
    if not settings.github_oauth_client_id or not settings.github_oauth_client_secret:
        raise HTTPException(status_code=503, detail="GitHub OAuth is not configured")

    with httpx.Client(timeout=30.0) as client:
        token_res = client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": settings.github_oauth_client_id,
                "client_secret": settings.github_oauth_client_secret,
                "code": code,
                "redirect_uri": settings.github_oauth_redirect_uri,
            },
        )
        token_res.raise_for_status()
        token_body = token_res.json()
        access_token = token_body.get("access_token")
        if not access_token:
            raise HTTPException(
                status_code=400,
                detail=token_body.get("error_description") or "OAuth token exchange failed",
            )
        user_res = client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "repopulse",
            },
        )
        user_res.raise_for_status()
        github_user = user_res.json()

    # Discard the OAuth access token immediately — server PAT does all data fetching
    del access_token

    user = upsert_oauth_user(github_user)
    session = create_session_token(
        user_id=int(user["user_id"]),
        github_id=int(user["github_id"]),
        login=user["login"],
    )
    response = RedirectResponse(url=f"{settings.frontend_url.rstrip('/')}/", status_code=302)
    set_session_cookie(response, session)
    response.delete_cookie(
        key=OAUTH_STATE_COOKIE,
        path="/",
        secure=settings.cookie_secure or settings.is_production,
        samesite="lax",
    )
    return response


@router.get("/me")
def me(request: Request) -> JSONResponse:
    user = get_session_user(request)
    if not user:
        return JSONResponse({"user": None}, headers=private_cache_headers())
    return JSONResponse(
        {
            "user": {
                "user_id": user["user_id"],
                "login": user["login"],
                "avatar_url": user.get("avatar_url"),
                "is_admin": bool(user.get("is_admin")),
            }
        },
        headers=private_cache_headers(),
    )


@router.post("/auth/logout")
def logout() -> Response:
    response = JSONResponse({"status": "ok"}, headers=private_cache_headers())
    clear_session_cookie(response)
    return response


@router.delete("/me")
def delete_me(request: Request) -> Response:
    user = require_user(request)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM app_users WHERE user_id = %s", (user["user_id"],))
        conn.commit()
    response = JSONResponse({"status": "deleted"}, headers=private_cache_headers())
    clear_session_cookie(response)
    return response
