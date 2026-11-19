from unittest.mock import MagicMock, patch

from app.auth import create_session_token, upsert_oauth_user
from app.config import get_settings
from app.db import execute, fetch_all, fetch_one, get_connection
from app.worker import claim_request


def _make_user(login="alice", github_id=1001, is_admin=False):
    # Temporarily put login in admin list if needed
    settings = get_settings()
    if is_admin:
        # upsert uses settings.admin_logins
        pass
    return upsert_oauth_user(
        {
            "id": github_id,
            "login": login,
            "avatar_url": "https://example.com/a.png",
        }
    )


def _session_client(client, user):
    token = create_session_token(
        user_id=int(user["user_id"]),
        github_id=int(user["github_id"]),
        login=user["login"],
    )
    client.cookies.set(get_settings().session_cookie_name, token)
    return client


def test_skip_locked_claims_once():
    user = _make_user("claimer", 2002)
    execute("DELETE FROM ingest_requests")
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO ingest_requests (user_id, full_name, status)
                VALUES (%s, 'org/one', 'queued'), (%s, 'org/two', 'queued')
                """,
                (user["user_id"], user["user_id"]),
            )
        conn.commit()

    first = claim_request()
    second = claim_request()
    assert first is not None
    assert second is not None
    assert first["request_id"] != second["request_id"]
    third = claim_request()
    assert third is None


def test_watchlist_alerts_procedure():
    user = _make_user("watcher", 3003)
    repo = fetch_one(
        "SELECT repo_id, health_score, is_abandoned FROM v_repo_health LIMIT 1"
    )
    if not repo:
        return
    execute("DELETE FROM watchlist WHERE user_id = %s", (user["user_id"],))
    execute("DELETE FROM alerts WHERE user_id = %s", (user["user_id"],))
    # Force a 10+ point drop relative to the snapshot
    prior = float(repo["health_score"] or 0) + 15
    execute(
        """
        INSERT INTO watchlist (
            user_id, repo_id, last_seen_health, last_seen_abandoned, last_seen_beginner_count
        ) VALUES (%s, %s, %s, FALSE, 0)
        """,
        (user["user_id"], repo["repo_id"], prior),
    )
    execute("CALL sp_generate_watchlist_alerts()")
    alerts = fetch_all(
        "SELECT kind FROM alerts WHERE user_id = %s",
        (user["user_id"],),
    )
    assert any(a["kind"] == "health_drop" for a in alerts)


def test_admin_ingest_rejects_anonymous(client):
    res = client.post("/api/ingest", json={"limit": 1, "use_seed": False})
    assert res.status_code == 401


def test_admin_ingest_accepts_token(client, admin_headers):
    with patch("app.routers.api.create_ingest_run") as mock_create, patch(
        "app.routers.api.execute_ingest_run"
    ):
        mock_create.return_value = {
            "sync_id": 1,
            "status": "queued",
            "targets": [],
            "repos_requested": 0,
        }
        res = client.post(
            "/api/ingest",
            json={"limit": 1, "use_seed": False, "repos": ["a/b"]},
            headers=admin_headers,
        )
    assert res.status_code == 200


def test_oauth_callback_mocked(client):
    # Set state cookie then mock GitHub token + user exchange
    state = "test-state-value"
    client.cookies.set("repopulse_oauth_state", state)

    mock_token = MagicMock()
    mock_token.raise_for_status = MagicMock()
    mock_token.json.return_value = {"access_token": "gho_test"}

    mock_user = MagicMock()
    mock_user.raise_for_status = MagicMock()
    mock_user.json.return_value = {
        "id": 4242,
        "login": "testadmin",
        "avatar_url": "https://example.com/x.png",
    }

    with patch("app.routers.auth.httpx.Client") as MockClient:
        instance = MockClient.return_value.__enter__.return_value
        instance.post.return_value = mock_token
        instance.get.return_value = mock_user
        res = client.get(
            "/api/auth/github/callback",
            params={"code": "abc", "state": state},
            follow_redirects=False,
        )
    assert res.status_code in (302, 307)
    assert get_settings().session_cookie_name in res.cookies


def test_me_and_watchlist(client):
    user = _make_user("bob", 5005)
    _session_client(client, user)
    me = client.get("/api/me")
    assert me.status_code == 200
    assert me.json()["user"]["login"] == "bob"

    repo = fetch_one("SELECT repo_id FROM v_repo_health LIMIT 1")
    if not repo:
        return
    add = client.post("/api/watchlist", json={"repo_id": repo["repo_id"]})
    assert add.status_code == 200
    wl = client.get("/api/watchlist")
    assert wl.status_code == 200
    assert any(i["repo_id"] == repo["repo_id"] for i in wl.json()["items"])


def test_request_repo_queued(client):
    user = _make_user("requester", 6006)
    _session_client(client, user)
    execute("DELETE FROM ingest_requests WHERE user_id = %s", (user["user_id"],))
    with patch("app.routers.accounts.GitHubClient") as MockGH, patch(
        "app.routers.accounts.drain_requests"
    ):
        MockGH.return_value.__enter__.return_value.get_repo.return_value = {
            "full_name": "acme/widget"
        }
        res = client.post("/api/requests", json={"full_name": "acme/widget"})
    assert res.status_code == 202
    assert res.json()["item"]["status"] == "queued"


def test_default_rate_limit_configured():
    from app.rate_limit import limiter

    assert limiter._default_limits  # noqa: SLF001 — ensure SlowAPI default is set
