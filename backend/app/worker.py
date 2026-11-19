"""Background drain of ingest_requests and nightly refresh pipeline."""

from __future__ import annotations

import argparse
import logging
import time
from typing import Any, Optional

from app.config import get_settings
from app.db import execute, fetch_all, fetch_one, get_connection, init_pool, close_pool
from app.services.github_client import DEFAULT_SEED_REPOS, GitHubClient
from app.services.ingest import run_ingest

logger = logging.getLogger("repopulse.worker")

CLAIM_SQL = """
UPDATE ingest_requests SET status = 'running', started_at = NOW()
WHERE request_id = (
  SELECT request_id FROM ingest_requests
  WHERE status = 'queued'
  ORDER BY requested_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
RETURNING request_id, full_name, user_id
"""

SEARCH_PRESETS = (
    "stars:500..20000 language:python",
    "stars:500..20000 language:javascript",
    "stars:500..20000 language:typescript",
    "stars:500..20000 language:go",
    "stars:500..20000 language:rust",
    "good-first-issues:>5 stars:500..20000",
)


def claim_request() -> Optional[dict[str, Any]]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(CLAIM_SQL)
            row = cur.fetchone()
        conn.commit()
    return dict(row) if row else None


def mark_request(
    request_id: int,
    *,
    status: str,
    error_message: Optional[str] = None,
    repo_id: Optional[int] = None,
) -> None:
    execute(
        """
        UPDATE ingest_requests
        SET status = %s,
            finished_at = NOW(),
            error_message = %s,
            repo_id = COALESCE(%s, repo_id)
        WHERE request_id = %s
        """,
        (status, error_message, repo_id, request_id),
    )


def requeue_stuck(hours: int = 2) -> int:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE ingest_requests
                SET status = 'queued', started_at = NULL, error_message = 'Requeued: stuck running'
                WHERE status = 'running'
                  AND started_at < NOW() - make_interval(hours => %s)
                """,
                (hours,),
            )
            n = cur.rowcount
        conn.commit()
    return n


def github_remaining(client: GitHubClient) -> Optional[int]:
    return client.last_rate_limit_remaining


def db_size_mb() -> float:
    row = fetch_one("SELECT pg_database_size(current_database())::BIGINT AS bytes")
    if not row:
        return 0.0
    return float(row["bytes"]) / (1024 * 1024)


def drain_requests(max_jobs: int = 10, min_remaining: int = 500) -> dict[str, Any]:
    """Claim and process queued ingest_requests. Safe for concurrent workers."""
    processed = 0
    failed = 0
    with GitHubClient() as client:
        while processed + failed < max_jobs:
            remaining = github_remaining(client)
            if remaining is not None and remaining < min_remaining:
                logger.warning("Stopping drain: GitHub remaining=%s", remaining)
                break
            job = claim_request()
            if not job:
                break
            full_name = job["full_name"]
            request_id = int(job["request_id"])
            try:
                result = run_ingest(
                    query=None,
                    limit=1,
                    repos=[full_name],
                    use_seed=False,
                )
                repo = fetch_one(
                    "SELECT repo_id FROM repositories WHERE lower(full_name) = lower(%s)",
                    (full_name,),
                )
                mark_request(
                    request_id,
                    status="done",
                    repo_id=int(repo["repo_id"]) if repo else None,
                )
                processed += 1
                logger.info("Request %s done: %s (%s)", request_id, full_name, result)
            except Exception as exc:  # noqa: BLE001
                logger.exception("Request %s failed: %s", request_id, full_name)
                mark_request(request_id, status="failed", error_message=str(exc)[:2000])
                failed += 1

    if processed:
        try:
            execute("CALL sp_refresh_analytics()")
        except Exception:  # noqa: BLE001
            logger.exception("Analytics refresh after drain failed")

    return {"processed": processed, "failed": failed}


def nightly() -> dict[str, Any]:
    """Nightly pipeline for Render cron."""
    settings = get_settings()
    summary: dict[str, Any] = {"steps": []}
    requeued = requeue_stuck(2)
    summary["steps"].append({"requeue_stuck": requeued})

    drain = drain_requests(max_jobs=25)
    summary["steps"].append({"drain": drain})

    count_row = fetch_one(
        "SELECT COUNT(*)::INT AS n FROM repositories WHERE COALESCE(sync_depth,'full') = 'full'"
    )
    full_count = (count_row or {}).get("n") or 0

    with GitHubClient() as client:
        if full_count == 0:
            seed = DEFAULT_SEED_REPOS[:50]
            logger.info("Empty DB — seeding %s repos", len(seed))
            run_ingest(repos=seed, limit=len(seed), use_seed=False)
            summary["steps"].append({"bootstrap_seed": len(seed)})

        remaining = github_remaining(client)
        if remaining is None or remaining >= 500:
            stale = fetch_all(
                """
                SELECT full_name
                FROM repositories
                WHERE COALESCE(sync_depth, 'full') = 'full'
                ORDER BY last_full_sync_at NULLS FIRST, synced_at ASC NULLS FIRST
                LIMIT 100
                """
            )
            names = [r["full_name"] for r in stale]
            if names:
                # Batch in chunks to respect quota
                chunk = names[: min(len(names), 40)]
                run_ingest(repos=chunk, limit=len(chunk), use_seed=False)
                summary["steps"].append({"resync_stale": len(chunk)})

        size_mb = db_size_mb()
        summary["db_size_mb"] = round(size_mb, 1)
        if size_mb < 800:
            remaining = github_remaining(client)
            if remaining is None or remaining >= 500:
                # Pick a rotating preset by day-of-month
                from datetime import datetime, timezone

                preset = SEARCH_PRESETS[
                    datetime.now(tz=timezone.utc).day % len(SEARCH_PRESETS)
                ]
                run_ingest(query=preset, limit=25, use_seed=False)
                summary["steps"].append({"discover": {"query": preset, "limit": 25}})
        else:
            summary["steps"].append({"discover": "skipped_storage"})

    execute("CALL sp_refresh_analytics()")
    execute("CALL sp_generate_watchlist_alerts()")
    execute("CALL sp_prune_audit_log(14)")
    try:
        settings_url = settings.database_url
        import psycopg

        with psycopg.connect(settings_url, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute("VACUUM ANALYZE")
    except Exception:  # noqa: BLE001
        logger.warning("VACUUM ANALYZE skipped or failed", exc_info=True)
    summary["steps"].append({"analytics_alerts_prune": "ok"})
    summary["app"] = settings.app_name
    return summary


def run_loop(interval_seconds: int = 15, max_jobs: int = 5) -> None:
    """Continuously drain queued ingest requests (local start.sh / long-running worker)."""
    logger.info(
        "Worker loop started (interval=%ss, max_jobs=%s)",
        interval_seconds,
        max_jobs,
    )
    while True:
        try:
            requeued = requeue_stuck(2)
            if requeued:
                logger.info("Requeued %s stuck request(s)", requeued)
            result = drain_requests(max_jobs=max_jobs, min_remaining=100)
            if result.get("processed") or result.get("failed"):
                logger.info("Drain: %s", result)
        except Exception:  # noqa: BLE001
            logger.exception("Worker loop iteration failed")
        time.sleep(max(1, int(interval_seconds)))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="RepoPulse background worker")
    parser.add_argument("--nightly", action="store_true", help="Run nightly pipeline")
    parser.add_argument(
        "--drain",
        type=int,
        nargs="?",
        const=10,
        default=None,
        help="Drain up to N queued requests once, then exit",
    )
    parser.add_argument(
        "--loop",
        action="store_true",
        help="Continuously drain queued requests (default when no other mode is set)",
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=15,
        help="Seconds between drain attempts in --loop mode (default 15)",
    )
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    init_pool()
    try:
        if args.nightly:
            result = nightly()
            print(result)
            return 0
        if args.drain is not None:
            result = drain_requests(max_jobs=args.drain)
            print(result)
            return 0
        # Default / --loop: keep draining so Requests page work completes locally
        run_loop(interval_seconds=args.interval)
        return 0
    finally:
        close_pool()


if __name__ == "__main__":
    raise SystemExit(main())
