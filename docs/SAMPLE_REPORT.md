# Sample findings report

*Illustrative write-up for viva / course report using demo seed + optional live `pallets/click` ingest.*

## Dataset

- Expanded offline seed: ~12 repositories across Python, JavaScript/TypeScript, Go, Rust, Java, HTML
- Multi-month commit history for MoM window analysis
- Beginner labels on active projects; archived + abandoned examples for risk detection
- Live ingest example: `pallets/click` (high stars, strong recent health)

## Findings

1. **Health scoring separates signal from star count.** A high-star live project such as `pallets/click` scores well on commit velocity, merge rate, and recency. Seeded abandoned/archived repos score near zero even when they retain historical stars.
2. **Beginner-friendly discovery is label-driven.** Repositories with `good first issue` / `help wanted` and recent pushes surface in `v_beginner_friendly`, supporting student contribution use cases.
3. **Organizations can be ranked as portfolios.** `v_org_analytics` aggregates stars, average health, and abandoned share — useful before adopting a library from an org.
4. **Window functions reveal trends.** `v_repo_monthly_activity` uses `LAG()` for month-over-month commit deltas so stagnating projects are visible before they meet the 180-day abandoned rule.
5. **Recursive CTEs validate lineage.** Fork trees (`fn_repo_fork_tree`) and commit parent walks (`fn_commit_ancestry`) demonstrate hierarchy queries on real graph-shaped data.

## Societal impact (project brief)

Students find contribution targets; developers compare library health; organizations assess maintenance risk before adoption.
