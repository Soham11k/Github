"""Session cookies and auth dependencies for GitHub OAuth."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import Header, HTTPException, Request, Response
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.config import Settings, get_settings
from app.db import execute, fetch_one, get_connection


def _serializer(settings: Settings | None = None) -> URLSafeTimedSerializer:
    settings = settings or get_settings()
    return URLSafeTimedSerializer(settings.session_secret, salt="repopulse-session")


def create_session_token(user_id: int, github_id: int, login: str) -> str:
    settings = get_settings()
    return _serializer(settings).dumps(
        {"user_id": user_id, "github_id": github_id, "login": login}
    )


def decode_session_token(token: str) -> Optional[dict[str, Any]]:
    settings = get_settings()
    try:
        data = _serializer(settings).loads(
            token, max_age=settings.session_max_age_seconds
        )
    except (BadSignature, SignatureExpired):
        return None
    if not isinstance(data, dict) or "user_id" not in data:
        return None
    return data


def set_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=settings.session_max_age_seconds,
        httponly=True,
        secure=settings.cookie_secure or settings.is_production,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
        secure=settings.cookie_secure or settings.is_production,
        samesite="lax",
    )


def upsert_oauth_user(github_user: dict[str, Any]) -> dict[str, Any]:
    settings = get_settings()
    github_id = int(github_user["id"])
    login = github_user["login"]
    avatar = github_user.get("avatar_url")
    is_admin = login.strip().lower() in settings.admin_logins
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO app_users (github_id, login, avatar_url, is_admin, last_login_at)
                VALUES (%s, %s, %s, %s, NOW())
                ON CONFLICT (github_id) DO UPDATE SET
                    login = EXCLUDED.login,
                    avatar_url = EXCLUDED.avatar_url,
                    is_admin = EXCLUDED.is_admin,
                    last_login_at = NOW()
                RETURNING user_id, github_id, login, avatar_url, is_admin, created_at, last_login_at
                """,
                (github_id, login, avatar, is_admin),
            )
            row = cur.fetchone()
        conn.commit()
    if not row:
        raise RuntimeError("Failed to upsert app user")
    return dict(row)


def load_user(user_id: int) -> Optional[dict[str, Any]]:
    return fetch_one(
        """
        SELECT user_id, github_id, login, avatar_url, is_admin, created_at, last_login_at
        FROM app_users
        WHERE user_id = %s
        """,
        (user_id,),
    )


def get_session_user(request: Request) -> Optional[dict[str, Any]]:
    settings = get_settings()
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        return None
    payload = decode_session_token(token)
    if not payload:
        return None
    user = load_user(int(payload["user_id"]))
    if not user:
        return None
    # Keep admin flag in sync with env list
    should_admin = user["login"].strip().lower() in settings.admin_logins
    if bool(user["is_admin"]) != should_admin:
        execute(
            "UPDATE app_users SET is_admin = %s WHERE user_id = %s",
            (should_admin, user["user_id"]),
        )
        user["is_admin"] = should_admin
    return user


def require_user(request: Request) -> dict[str, Any]:
    user = get_session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Sign in required")
    return user


def require_admin(
    request: Request,
    x_admin_token: Optional[str] = Header(default=None),
) -> dict[str, Any]:
    """Admin via signed-in ADMIN_GITHUB_LOGINS user; legacy token only in non-production."""
    settings = get_settings()
    user = get_session_user(request)
    if user and user.get("is_admin"):
        return user
    if not settings.is_production:
        if x_admin_token and x_admin_token == settings.admin_token:
            return {
                "user_id": 0,
                "login": "admin-token",
                "is_admin": True,
                "via_token": True,
            }
    raise HTTPException(status_code=401, detail="Admin access required")


def public_cache_headers() -> dict[str, str]:
    return {"Cache-Control": "public, max-age=300"}


def private_cache_headers() -> dict[str, str]:
    return {"Cache-Control": "no-store"}
