"""Apply SQL schema files idempotently, tracking checksums in schema_migrations."""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

import psycopg

from app.config import get_settings

SQL_FILES = (
    "schema.sql",
    "indexes.sql",
    "triggers.sql",
    "views.sql",
    "procedures.sql",
    "grants.sql",
)


def _sql_dir() -> Path:
    # Prefer repo-root sql/ (Render, CI); Docker image has sql next to app/
    here = Path(__file__).resolve()
    candidates = [
        here.parents[2] / "sql",  # repo/backend/app -> repo/sql
        here.parents[1] / "sql",  # /app/app -> /app/sql (Docker WORKDIR)
        Path.cwd() / "sql",
        Path.cwd().parent / "sql",
    ]
    for path in candidates:
        if path.is_dir() and (path / "schema.sql").exists():
            return path
    raise FileNotFoundError(
        "Could not find sql/ directory with schema.sql. "
        f"Tried: {', '.join(str(c) for c in candidates)}"
    )


def _checksum(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ensure_migrations_table(conn: psycopg.Connection) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                filename    TEXT PRIMARY KEY,
                checksum    TEXT NOT NULL,
                applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
    conn.commit()


def apply_migrations(database_url: str | None = None) -> list[str]:
    settings = get_settings()
    url = database_url or settings.database_url
    sql_dir = _sql_dir()
    applied: list[str] = []

    with psycopg.connect(url) as conn:
        ensure_migrations_table(conn)
        for name in SQL_FILES:
            path = sql_dir / name
            if not path.exists():
                raise FileNotFoundError(f"Missing SQL file: {path}")
            digest = _checksum(path)
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT checksum FROM schema_migrations WHERE filename = %s",
                    (name,),
                )
                row = cur.fetchone()
                if row and row[0] == digest:
                    continue
            sql = path.read_text(encoding="utf-8")
            with conn.cursor() as cur:
                cur.execute(sql)
                cur.execute(
                    """
                    INSERT INTO schema_migrations (filename, checksum, applied_at)
                    VALUES (%s, %s, NOW())
                    ON CONFLICT (filename) DO UPDATE SET
                        checksum = EXCLUDED.checksum,
                        applied_at = NOW()
                    """,
                    (name, digest),
                )
            conn.commit()
            applied.append(name)
            print(f"Applied {name}")
        if not applied:
            print("Migrations up to date")
    return applied


def main(argv: list[str] | None = None) -> int:
    del argv  # unused
    try:
        apply_migrations()
    except Exception as exc:  # noqa: BLE001 — CLI surface
        print(f"Migration failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
