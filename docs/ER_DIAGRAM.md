# Entity-relationship diagram

```mermaid
erDiagram
  organizations ||--o{ repositories : owns
  repositories ||--o{ repositories : "parent_repo_id fork"
  repositories ||--o{ commits : has
  repositories ||--o{ issues : has
  repositories ||--o{ pull_requests : has
  repositories ||--o{ repo_languages : uses
  repositories ||--o{ repo_contributors : has
  contributors ||--o{ commits : authors
  contributors ||--o{ issues : opens
  contributors ||--o{ pull_requests : opens
  contributors ||--o{ repo_contributors : belongs
  languages ||--o{ repo_languages : measured
  issues ||--o{ issue_labels : tagged
  sync_runs ||--o{ audit_log : "time-window join"
```

## Tables ([sql/schema.sql](../sql/schema.sql))

| Table | Role |
|---|---|
| `organizations` | GitHub orgs |
| `contributors` | Users/bots |
| `repositories` | Repos; `parent_repo_id` for forks; `health_score`, `is_abandoned` |
| `commits` | SHA + `parent_sha` ancestry |
| `issues` / `issue_labels` | Issues (PRs flagged via `is_pull_request`) + labels |
| `pull_requests` | PR merge stats |
| `languages` / `repo_languages` | Language bytes + share |
| `repo_contributors` | Contribution junction |
| `sync_runs` | Ingest run log |
| `audit_log` | Trigger-written change history |

Primary keys use GitHub IDs where possible so re-syncs upsert idempotently.
