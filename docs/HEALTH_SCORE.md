# Health score formula

Implemented in `sp_refresh_health_scores` and exposed factor-by-factor in `v_health_factors`. Final value is clamped to **[0, 100]**.

| Factor | Range | Rule |
|---|---|---|
| Commit velocity | 0–25 | `min(25, commits_90d × 1.5)` |
| Unique contributors | 0–20 | `min(20, unique_committers × 2)` |
| Issue resolution | 0–25 | `close_rate × 25`; default **12** if no issues |
| Median time-to-close | 0–10 | ≤7d→10, ≤30d→7, ≤90d→4, else 1; default **5** if unknown |
| PR merge rate | 0–15 | `merge_rate × 15`; default **7** if no PRs |
| Recency | −10–5 | push &lt;30d→5, &lt;90d→3, &lt;180d→1, else −10 |
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

Abandoned detection (`sp_mark_abandoned_repos`): no push and no commits within 180 days → `is_abandoned = TRUE` (cleared if activity resumes).
