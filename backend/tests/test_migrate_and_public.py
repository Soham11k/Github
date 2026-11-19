from app.migrate import apply_migrations


def test_migrations_rerun_clean():
    first = apply_migrations()
    second = apply_migrations()
    assert second == []


def test_health(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_dashboard_seeded(client):
    res = client.get("/api/dashboard")
    assert res.status_code == 200
    body = res.json()
    assert "kpis" in body
    assert res.headers.get("cache-control", "").startswith("public")


def test_badge_svg(client):
    res = client.get("/api/badge/demo/demo.svg")
    # May be n/a if seed names differ — still must return SVG
    assert res.status_code == 200
    assert "image/svg" in res.headers.get("content-type", "")
    assert b"<svg" in res.content


def test_sitemap(client):
    res = client.get("/api/sitemap.xml")
    assert res.status_code == 200
    assert "urlset" in res.text
