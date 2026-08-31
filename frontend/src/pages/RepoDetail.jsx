import { useEffect, useState } from 'react'
import { Link as RouterLink, useParams } from 'react-router-dom'
import {
  Avatar,
  AvatarStack,
  BranchName,
  Button,
  CounterLabel,
  Heading,
  Label,
  Link,
  Text,
  TreeView,
  UnderlineNav,
} from '@primer/react'
import {
  GitBranchIcon,
  GitPullRequestIcon,
  GraphIcon,
  IssueOpenedIcon,
  LinkExternalIcon,
  MarkGithubIcon,
  PeopleIcon,
  RepoIcon,
  StarIcon,
} from '@primer/octicons-react'
import { api } from '../api'
import HealthMeter from '../components/HealthMeter'
import LanguageBar from '../components/LanguageBar'
import { EmptyState, ErrorState, LoadingState } from '../components/StateBanner'
import { compactNumber, relativeTime } from '../lib/format'
import { languageColor } from '../lib/languageColors'

const TABS = [
  { id: 'overview', label: 'Overview', icon: RepoIcon },
  { id: 'issues', label: 'Issues', icon: IssueOpenedIcon },
  { id: 'pulls', label: 'Pull requests', icon: GitPullRequestIcon },
  { id: 'insights', label: 'Insights', icon: GraphIcon },
  { id: 'forks', label: 'Forks', icon: GitBranchIcon },
]

export default function RepoDetail() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [forks, setForks] = useState([])
  const [factors, setFactors] = useState(null)
  const [monthly, setMonthly] = useState([])
  const [tab, setTab] = useState('overview')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.repo(id),
      api.forkTree(id),
      api.healthFactors(id),
      api.activityMonthly(id),
    ])
      .then(([repoData, forkData, factorData, monthData]) => {
        setData(repoData)
        setForks(forkData.nodes || [])
        setFactors(factorData.item || null)
        setMonthly(monthData.items || [])
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <LoadingState label="Loading repository…" />
  if (error) return <ErrorState message={error} />
  if (!data?.repo) return <EmptyState title="Repository not found" />

  const { repo, languages, contributors, issues, pull_requests: pulls, report } = data
  const [owner, name] = (repo.full_name || '/').split('/')

  return (
    <div className="page repo-page">
      <div className="repo-page-head">
        <div className="repo-page-title">
          <RepoIcon size={16} className="muted" />
          <Heading as="h1" className="repo-title">
            <Link as={RouterLink} to={`/repos?q=${encodeURIComponent(owner)}`}>{owner}</Link>
            <span className="muted"> / </span>
            <strong>{name}</strong>
          </Heading>
          {repo.is_abandoned && <Label variant="danger">Abandoned</Label>}
          {repo.is_archived && <Label variant="attention">Archived</Label>}
          {!repo.is_abandoned && !repo.is_archived && <Label variant="secondary">Public</Label>}
        </div>
        <div className="repo-page-actions">
          <Button leadingVisual={StarIcon} size="small">
            Star <CounterLabel>{compactNumber(repo.stars)}</CounterLabel>
          </Button>
          {repo.html_url && (
            <Button
              as="a"
              href={repo.html_url}
              target="_blank"
              rel="noreferrer"
              leadingVisual={MarkGithubIcon}
              trailingVisual={LinkExternalIcon}
              size="small"
            >
              View on GitHub
            </Button>
          )}
        </div>
      </div>

      {repo.description && <Text as="p" className="repo-desc">{repo.description}</Text>}

      <UnderlineNav aria-label="Repository" className="repo-tabs">
        {TABS.map((t) => (
          <UnderlineNav.Item
            key={t.id}
            icon={t.icon}
            aria-current={tab === t.id ? 'page' : undefined}
            onSelect={(e) => {
              e.preventDefault()
              setTab(t.id)
            }}
            counter={
              t.id === 'issues' ? repo.open_issues
                : t.id === 'pulls' ? repo.total_prs
                  : t.id === 'forks' ? Math.max(forks.length - 1, 0)
                    : undefined
            }
          >
            {t.label}
          </UnderlineNav.Item>
        ))}
      </UnderlineNav>

      <div className="repo-body">
        <div className="repo-main">
          {tab === 'overview' && (
            <section className="panel">
              <Heading as="h2" className="h3">About this project</Heading>
              <div className="stat-grid">
                <div className="stat-tile">
                  <span className="muted">Commits (90d)</span>
                  <strong>{repo.commits_90d}</strong>
                </div>
                <div className="stat-tile">
                  <span className="muted">Contributors</span>
                  <strong>{repo.unique_contributors}</strong>
                </div>
                <div className="stat-tile">
                  <span className="muted">Issue close rate</span>
                  <strong>{repo.issue_close_rate ?? '—'}</strong>
                </div>
                <div className="stat-tile">
                  <span className="muted">PR merge rate</span>
                  <strong>{repo.pr_merge_rate ?? '—'}</strong>
                </div>
              </div>
              <HealthMeter score={repo.health_score} />
              <Text as="p" className="muted" style={{ marginTop: '1rem' }}>
                Median days to close issues: {Number(repo.median_days_to_close || 0).toFixed(1)} ·
                Days since push: {Number(repo.days_since_push || 0).toFixed(0)} ·
                Health rank #{repo.health_rank}
              </Text>
            </section>
          )}

          {tab === 'issues' && (
            <section className="panel">
              <Heading as="h2" className="h3">Recent issues</Heading>
              {!issues?.length ? (
                <EmptyState title="No issues loaded" icon={IssueOpenedIcon} />
              ) : (
                <ul className="issue-list">
                  {issues.map((i) => (
                    <li key={i.issue_id}>
                      <IssueOpenedIcon className={i.state === 'open' ? 'fg-success' : 'muted'} />
                      <div>
                        {i.html_url ? (
                          <a href={i.html_url} target="_blank" rel="noreferrer">
                            {i.title}
                          </a>
                        ) : (
                          <span>{i.title}</span>
                        )}
                        <div className="muted">
                          #{i.number} · {i.state}
                          {i.closed_at ? ` · closed ${relativeTime(i.closed_at)}` : ''}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === 'pulls' && (
            <section className="panel">
              <Heading as="h2" className="h3">Recent pull requests</Heading>
              {!pulls?.length ? (
                <EmptyState title="No pull requests loaded" icon={GitPullRequestIcon} />
              ) : (
                <ul className="issue-list">
                  {pulls.map((p) => (
                    <li key={p.pr_id}>
                      <GitPullRequestIcon className={p.is_merged ? 'fg-done' : 'fg-success'} />
                      <div>
                        {p.html_url ? (
                          <a href={p.html_url} target="_blank" rel="noreferrer">{p.title}</a>
                        ) : (
                          <span>{p.title}</span>
                        )}
                        <div className="muted">
                          #{p.number} · {p.is_merged ? 'merged' : p.state}
                          {p.merged_at ? ` · ${relativeTime(p.merged_at)}` : ''}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === 'insights' && (
            <section className="panel">
              <Heading as="h2" className="h3">Health insights</Heading>
              <HealthMeter score={repo.health_score} />
              {factors && (
                <div className="factor-list" style={{ marginTop: '1rem' }}>
                  <Heading as="h3" className="h4">Score factors</Heading>
                  {[
                    ['Commit velocity', factors.factor_commit_velocity, factors.factor_commit_velocity_max],
                    ['Contributors', factors.factor_contributors, factors.factor_contributors_max],
                    ['Issue resolution', factors.factor_issue_resolution, factors.factor_issue_resolution_max],
                    ['Time to close', factors.factor_time_to_close, factors.factor_time_to_close_max],
                    ['PR merge', factors.factor_pr_merge, factors.factor_pr_merge_max],
                    ['Recency', factors.factor_recency, factors.factor_recency_max],
                  ].map(([label, value, max]) => (
                    <div key={label} className="factor-row">
                      <div className="factor-row-head">
                        <span>{label}</span>
                        <span className="muted">{Number(value).toFixed(1)} / {Number(max).toFixed(0)}</span>
                      </div>
                      <div className="factor-bar-track">
                        <div
                          className="factor-bar-fill"
                          style={{ width: `${Math.max(0, Math.min(100, (Number(value) / Number(max || 1)) * 100))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  {Number(factors.factor_archived_penalty) > 0 && (
                    <Text className="muted">Archived penalty: −{factors.factor_archived_penalty}</Text>
                  )}
                </div>
              )}
              {monthly.length > 0 && (
                <div style={{ marginTop: '1.25rem' }}>
                  <Heading as="h3" className="h4">Monthly activity (MoM via LAG)</Heading>
                  <table className="people-table">
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>Commits</th>
                        <th>Δ</th>
                        <th>Issues</th>
                        <th>PRs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthly.map((m) => (
                        <tr key={m.activity_month}>
                          <td>{m.activity_month}</td>
                          <td>{m.commit_count}</td>
                          <td className="muted">{m.commits_mom_delta ?? '—'}</td>
                          <td>{m.issue_count}</td>
                          <td>{m.pr_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <pre className="report-json">{JSON.stringify(report || {}, null, 2)}</pre>
            </section>
          )}

          {tab === 'forks' && (
            <section className="panel">
              <Heading as="h2" className="h3">Fork tree</Heading>
              <Text as="p" className="muted">Recursive CTE over <BranchName>parent_repo_id</BranchName></Text>
              {forks.length <= 1 ? (
                <EmptyState title="No forks in the database" icon={GitBranchIcon} description="Ingest child forks to populate this tree." />
              ) : (
                <TreeView aria-label="Fork tree">
                  {forks.map((n) => (
                    <TreeView.Item
                      key={n.repo_id}
                      id={String(n.repo_id)}
                      current={n.repo_id === repo.repo_id}
                      onSelect={() => {}}
                    >
                      <TreeView.LeadingVisual>
                        <GitBranchIcon />
                      </TreeView.LeadingVisual>
                      <Link as={RouterLink} to={`/repos/${n.repo_id}`}>
                        {n.full_name}
                      </Link>
                      <TreeView.TrailingVisual>
                        <span className="muted">depth {n.depth} · ★ {compactNumber(n.stars)}</span>
                      </TreeView.TrailingVisual>
                    </TreeView.Item>
                  ))}
                </TreeView>
              )}
            </section>
          )}
        </div>

        <aside className="repo-sidebar">
          <section className="panel">
            <Heading as="h2" className="h4">About</Heading>
            <dl className="about-dl">
              <div>
                <dt>Stars</dt>
                <dd><StarIcon size={14} /> {compactNumber(repo.stars)}</dd>
              </div>
              <div>
                <dt>Forks</dt>
                <dd>{compactNumber(repo.forks_count)}</dd>
              </div>
              <div>
                <dt>Open issues</dt>
                <dd>{repo.open_issues}</dd>
              </div>
              <div>
                <dt>Primary language</dt>
                <dd>
                  {repo.language_primary ? (
                    <>
                      <span className="lang-dot" style={{ backgroundColor: languageColor(repo.language_primary) }} />
                      {repo.language_primary}
                    </>
                  ) : '—'}
                </dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{relativeTime(repo.pushed_at) || '—'}</dd>
              </div>
            </dl>
          </section>

          <section className="panel">
            <Heading as="h2" className="h4">Languages</Heading>
            <LanguageBar languages={languages} />
          </section>

          <section className="panel">
            <Heading as="h2" className="h4"><PeopleIcon /> Contributors</Heading>
            {contributors?.length ? (
              <>
                <AvatarStack>
                  {contributors.slice(0, 8).map((c) => (
                    <Avatar
                      key={c.contributor_id}
                      src={c.avatar_url || undefined}
                      alt={c.login}
                      size={28}
                    />
                  ))}
                </AvatarStack>
                <ul className="contrib-mini">
                  {contributors.slice(0, 8).map((c) => (
                    <li key={c.contributor_id}>
                      <a href={c.html_url} target="_blank" rel="noreferrer">{c.login}</a>
                      <span className="muted">{c.contributions}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <Text className="muted">No contributors loaded</Text>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
