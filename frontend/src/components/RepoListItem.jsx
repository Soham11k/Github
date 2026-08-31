import { Link as RouterLink } from 'react-router-dom'
import { Label, Link, Text } from '@primer/react'
import { RepoIcon, StarIcon } from '@primer/octicons-react'
import { languageColor } from '../lib/languageColors'
import { compactNumber, healthLabel, healthVariant, relativeTime } from '../lib/format'

export default function RepoListItem({
  repo,
  selectable = false,
  selected = false,
  onToggle,
}) {
  const updated = relativeTime(repo.pushed_at || repo.last_activity_at)
  const lang = repo.language_primary

  return (
    <article className="repo-row">
      {selectable && (
        <label className="repo-row-check">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle?.(repo)}
            aria-label={`Compare ${repo.full_name}`}
          />
        </label>
      )}
      <div className="repo-row-body">
        <div className="repo-row-title">
          <RepoIcon className="repo-row-icon" />
          <Link as={RouterLink} to={`/repos/${repo.repo_id}`} className="repo-row-name">
            {repo.full_name}
          </Link>
          {repo.is_abandoned && (
            <Label variant="danger" size="small">Abandoned</Label>
          )}
          {repo.is_archived && !repo.is_abandoned && (
            <Label variant="attention" size="small">Archived</Label>
          )}
          {!repo.is_abandoned && !repo.is_archived && (
            <Label variant="secondary" size="small">Public</Label>
          )}
        </div>
        {repo.description && (
          <Text as="p" className="repo-row-desc">
            {repo.description}
          </Text>
        )}
        <div className="repo-row-meta">
          {lang && (
            <span className="meta-item">
              <span className="lang-dot" style={{ backgroundColor: languageColor(lang) }} />
              {lang}
            </span>
          )}
          <span className="meta-item">
            <StarIcon size={14} />
            {compactNumber(repo.stars)}
          </span>
          <Label variant={healthVariant(repo.health_score)} size="small">
            Health {Number(repo.health_score).toFixed(0)} · {healthLabel(repo.health_score)}
          </Label>
          {updated && <span className="meta-item muted">Updated {updated}</span>}
          {repo.beginner_label_count > 0 && (
            <Label variant="success" size="small">
              {repo.beginner_label_count} good first issues
            </Label>
          )}
        </div>
      </div>
    </article>
  )
}
