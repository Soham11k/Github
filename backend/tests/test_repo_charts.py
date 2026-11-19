from app.db import fetch_one


def test_commit_heatmap_seeded(client):
    res = client.get("/api/repos/920001/commit-heatmap")
    assert res.status_code == 200
    body = res.json()
    assert body["repo_id"] == 920001
    assert body["timezone"] == "UTC"
    items = body["items"]
    assert items
    total = 0
    for cell in items:
        assert 1 <= int(cell["weekday"]) <= 7
        assert 0 <= int(cell["hour_of_day"]) <= 23
        total += int(cell["commit_count"])
    db_count = fetch_one(
        "SELECT COUNT(*) AS n FROM commits WHERE repo_id = %s",
        (920001,),
    )
    assert total == int(db_count["n"])


def test_issue_flow_seeded(client):
    res = client.get("/api/repos/920001/issue-flow")
    assert res.status_code == 200
    body = res.json()
    assert body["repo_id"] == 920001
    assert len(body["items"]) == 12
    totals = body["totals"]
    assert int(totals["issues_open"]) == 2
    assert int(totals["issues_closed"]) == 2
    assert int(totals["prs_open"]) == 1
    assert int(totals["prs_merged"]) == 1
    assert int(totals["prs_closed_unmerged"]) == 0


def test_health_distribution_seeded(client):
    res = client.get("/api/repos/920001/health-distribution")
    assert res.status_code == 200
    body = res.json()
    assert body["repo_id"] == 920001
    buckets = body["buckets"]
    assert len(buckets) == 10
    bucket_total = sum(int(b["repo_count"]) for b in buckets)
    full_count = fetch_one(
        "SELECT COUNT(*) AS n FROM repositories WHERE COALESCE(sync_depth, 'full') = 'full'"
    )
    assert bucket_total == int(full_count["n"])
    position = body["position"]
    assert position is not None
    pct = float(position["health_percentile"])
    assert 0.0 <= pct <= 1.0
    assert 1 <= int(position["health_bucket"]) <= 10


def test_chart_endpoints_404(client):
    for path in (
        "/api/repos/999999999/commit-heatmap",
        "/api/repos/999999999/issue-flow",
        "/api/repos/999999999/health-distribution",
    ):
        res = client.get(path)
        assert res.status_code == 404


def test_market_health_distribution(client):
    res = client.get("/api/health-distribution")
    assert res.status_code == 200
    buckets = res.json()["buckets"]
    assert len(buckets) == 10
    for b in buckets:
        assert 1 <= int(b["health_bucket"]) <= 10


def test_market_commit_heatmap(client):
    res = client.get("/api/commit-heatmap")
    assert res.status_code == 200
    body = res.json()
    assert body["timezone"] == "UTC"
    items = body["items"]
    assert items
    for cell in items:
        assert 1 <= int(cell["weekday"]) <= 7
        assert 0 <= int(cell["hour_of_day"]) <= 23
        assert int(cell["commit_count"]) >= 0
