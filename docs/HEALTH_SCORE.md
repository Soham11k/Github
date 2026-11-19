# Health score formula

Implemented in `sp_refresh_health_scores` and exposed factor-by-factor in `v_health_factors`. Final value is clamped to **[0, 100]**.

## Ingest sample window (important)

Live GitHub sync requests commits, issues, and pull requests **since** `INGEST_ACTIVITY_DAYS` (default **180**), then stops at the caps below. Quiet repos fill the window health/charts expect; mega-repos stay capped but the cutoff is explicit.

| Resource | Default cap | Env var |
|----------|-------------|---------|
| Activity window | 180 days | `INGEST_ACTIVITY_DAYS` |
| Commits | 300 | `INGEST_COMMIT_LIMIT` |
| Issues | 200 | `INGEST_ISSUE_LIMIT` |
| Pull requests | 100 | `INGEST_PR_LIMIT` |
| PR detail (churn) | 20 | `INGEST_PR_DETAIL_LIMIT` |
| Child forks | 15 | `INGEST_FORK_LIMIT` |
| Contributors | 100 | `INGEST_CONTRIBUTOR_LIMIT` |
| Labeled beginner issues | 50 / label | `INGEST_LABELED_ISSUE_LIMIT` |

Mega-repos can still under-count relative to full history. To avoid false “dead project” scores:

- **Commit velocity** uses a **pushed_at floor** when sampled `commits_90d = 0` but GitHub reports a recent push.
- **Recency** is weighted more heavily and always uses GitHub `pushed_at` (not the commit sample).
- **Abandoned** (`sp_mark_abandoned_repos`) is driven primarily by `pushed_at` / recent sampled commits — a recent push clears abandonment even if the sample has few commits.
- **PR churn** (`additions` / `deletions` / `changed_files`) is filled via detail fetches for the first N PRs (list endpoint omits them).

| Factor | Range | Rule |
|---|---|---|
| Commit velocity | 0–25 | `min(25, commits_90d × 1.5)`; if sample empty: push &lt;30d→18, &lt;90d→10 |
| Unique contributors | 0–20 | `min(20, unique_committers × 2)` (falls back to `contributor_count_cache`) |
| Issue resolution | 0–25 | `close_rate × 25`; default **12** if no issues |
| Median time-to-close | 0–10 | ≤7d→10, ≤30d→7, ≤90d→4, else 1; default **5** if unknown |
| PR merge rate | 0–15 | `merge_rate × 15`; default **7** if no PRs |
| Recency | −15–10 | push &lt;14d→10, &lt;30d→7, &lt;90d→4, &lt;180d→1, else −15 |
| Archived penalty | 0 or −30 | −30 if `is_archived` |

```text
score = clamp(
  commit_velocity
  + contributors
  + issue_resolution
  + time_to_close
  + pr_merge
  + recency
  - archived_penalty
, 0, 100)
```

Abandoned detection (`sp_mark_abandoned_repos`): no push and no commits within 180 days → `is_abandoned = TRUE` (cleared if `pushed_at` or sampled commits resume).
