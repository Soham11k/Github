"""CLI entry: python -m app.ingest --seed --limit 15"""

from __future__ import annotations

import argparse
import json
import sys

from app.services.ingest import run_ingest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Ingest GitHub repositories into PostgreSQL")
    parser.add_argument("--query", type=str, default=None, help='GitHub search query, e.g. "stars:>5000"')
    parser.add_argument("--limit", type=int, default=15, help="Max repositories to sync")
    parser.add_argument(
        "--repo",
        action="append",
        dest="repos",
        default=None,
        help="Explicit owner/repo (repeatable)",
    )
    parser.add_argument(
        "--seed",
        action="store_true",
        help="Use built-in well-known seed repositories",
    )
    parser.add_argument(
        "--no-seed",
        action="store_true",
        help="Do not use seed list (only --query / --repo)",
    )
    args = parser.parse_args(argv)

    use_seed = args.seed or (not args.query and not args.repos and not args.no_seed)
    if args.no_seed:
        use_seed = False

    result = run_ingest(
        query=args.query,
        limit=args.limit,
        repos=args.repos,
        use_seed=use_seed,
    )
    print(json.dumps(result, indent=2))
    return 0 if result["repos_synced"] > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
