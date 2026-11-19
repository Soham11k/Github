import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Button,
  CounterLabel,
  Heading,
  Label,
  Link,
  Text,
} from '@primer/react'
import {
  AlertIcon,
  FlameIcon,
  LightBulbIcon,
  OrganizationIcon,
  PeopleIcon,
  RepoIcon,
  StarIcon,
  SyncIcon,
} from '@primer/octicons-react'
import { api } from '../api'
import BrandMark from '../components/BrandMark'
import { ShareDoughnut, Sparkline } from '../components/MarketCharts'
import RepoListItem from '../components/RepoListItem'
import { EmptyState, ErrorState, LoadingState } from '../components/StateBanner'
import { APP_NAME, APP_TAGLINE } from '../brand'
import { useAuth } from '../auth/AuthContext'
import { compactNumber } from '../lib/format'
import { languageColor } from '../lib/languageColors'
import { usePageTitle } from '../lib/pageTitle'

function KpiCard({ icon: Icon, label, value, to, tone }) {
  return (
    <Link as={RouterLink} to={to} className={`kpi-card kpi-card--${tone || 'default'}`}>
      <div className="kpi-card-icon"><Icon size={16} /></div>
      <div>
        <div className="kpi-card-value">{value ?? '—'}</div>
        <div className="kpi-card-label">{label}</div>
      </div>
    </Link>
  )
}

export default function Explore() {
  usePageTitle('Explore')
  const { isAdmin } = useAuth()
  const [data, setData] = useState(null)
  const [beginner, setBeginner] = useState([])
  const [inactive, setInactive] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.dashboard(), api.beginner(6), api.inactive(4)])
      .then(([dash, beg, ina]) => {
        if (!dash || typeof dash !== 'object' || !dash.kpis) {
          throw new Error('Repository data is unavailable because the API is not connected.')
        }
        setData(dash)
        setBeginner(Array.isArray(beg?.items) ? beg.items : [])
        setInactive(Array.isArray(ina?.items) ? ina.items : [])
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingState label="Loading Explore…" />
  if (error) return <ErrorState message={error} />
  if (!data) {
    return (
      <EmptyState
        title="No marketplace data yet"
        description="Pull real GitHub repos to fill Explore, Insights, and rankings."
        action={
          isAdmin ? (
            <Button as={RouterLink} to="/ingest" variant="primary" sx={{ mt: 2 }}>
              Go to Ingest
            </Button>
          ) : (
            <Button as={RouterLink} to="/requests" variant="primary" sx={{ mt: 2 }}>
              Request a repository
            </Button>
          )
        }
      />
    )
  }

  const kpis = data.kpis || {}
  const { languages, top_repos: topRepos, top_orgs: topOrgs, recent_syncs: recentSyncs } = data
  const emptyMarket = !kpis?.repo_count

  return (
    <div className="page">
      <section className="explore-hero">
        <div className="explore-hero-copy">
          <div className="explore-eyebrow">
            <BrandMark size={16} /> {APP_NAME} · {APP_TAGLINE}
          </div>
          <Heading as="h1" className="explore-title">
            {APP_NAME}
          </Heading>
          <Text as="p" className="explore-lead">
            Discover healthy repositories, beginner-friendly projects, and rising languages —
            powered by PostgreSQL analytics on public GitHub data.
          </Text>
          <div className="explore-actions">
            <Button as={RouterLink} to="/repos" variant="primary">
              Browse repositories
            </Button>
            <Button as={RouterLink} to="/beginner">
              Find good first issues
            </Button>
            {emptyMarket && isAdmin && (
              <Button as={RouterLink} to="/ingest" leadingVisual={SyncIcon}>
                Ingest data
              </Button>
            )}
            {emptyMarket && !isAdmin && (
              <Button as={RouterLink} to="/requests">
                Request a repository
              </Button>
            )}
          </div>
        </div>
        <div className="explore-hero-panel">
          <Heading as="h2" className="h3">Marketplace pulse</Heading>
          <ul className="pulse-list">
            <li><RepoIcon /> <strong>{compactNumber(kpis.repo_count)}</strong> repositories indexed</li>
            <li><PeopleIcon /> <strong>{compactNumber(kpis.contributor_count)}</strong> contributors ranked</li>
            <li><FlameIcon /> <strong>{kpis.avg_health_score ?? '—'}</strong> average health score</li>
            <li><LightBulbIcon /> <strong>{compactNumber(kpis.beginner_friendly_count)}</strong> beginner-friendly</li>
          </ul>
          {(data.activity || []).length > 0 && (
            <div style={{ marginTop: '0.85rem' }}>
              <Text as="p" className="muted" style={{ marginBottom: '0.35rem', fontSize: 12 }}>
                Commits · last 90 days
              </Text>
              <Sparkline values={(data.activity || []).map((a) => a.commit_count)} />
            </div>
          )}
        </div>
      </section>

      <section className="kpi-grid">
        <KpiCard icon={RepoIcon} label="Repositories" value={compactNumber(kpis.repo_count)} to="/repos" />
        <KpiCard icon={PeopleIcon} label="People" value={compactNumber(kpis.contributor_count)} to="/contributors" />
        <KpiCard icon={StarIcon} label="Avg health" value={kpis.avg_health_score} to="/insights" tone="success" />
        <KpiCard icon={AlertIcon} label="Unmaintained" value={compactNumber(kpis.abandoned_count)} to="/inactive" tone="danger" />
      </section>

      <div className="explore-grid">
        <section className="panel">
          <div className="panel-head">
            <Heading as="h2" className="h3">
              <FlameIcon /> Trending by health
            </Heading>
            <Link as={RouterLink} to="/repos?sort=health">View all</Link>
          </div>
          <div className="repo-list">
            {(topRepos || []).map((r) => (
              <RepoListItem key={r.repo_id} repo={r} />
            ))}
            {!topRepos?.length && (
              <EmptyState
                title="No trending repos"
                description="Run a live ingest to populate Explore from GitHub."
                action={
                  <Button as={RouterLink} to="/ingest" variant="primary" sx={{ mt: 2 }} leadingVisual={SyncIcon}>
                    Open Ingest
                  </Button>
                }
              />
            )}          </div>
        </section>

        <aside className="explore-side">
          <section className="panel">
            <div className="panel-head">
              <Heading as="h2" className="h3">Topics by language</Heading>
              <Link as={RouterLink} to="/insights">Insights</Link>
            </div>
            <ShareDoughnut
              items={(languages || []).slice(0, 8).map((l) => ({
                label: l.language_name,
                value: Number(l.repo_count) || 0,
              }))}
              emptyMessage="No languages indexed yet."
            />
            <div className="topic-chips" style={{ marginTop: '0.75rem' }}>
              {(languages || []).slice(0, 12).map((l) => (
                <Link
                  key={l.language_name}
                  as={RouterLink}
                  to={`/repos?language=${encodeURIComponent(l.language_name)}`}
                  className="topic-chip"
                >
                  <span className="lang-dot" style={{ backgroundColor: languageColor(l.language_name) }} />
                  {l.language_name}
                  <CounterLabel>{compactNumber(l.repo_count)}</CounterLabel>
                </Link>
              ))}
            </div>
          </section>

          <section className="panel collection-card">
            <Label variant="success">Collection</Label>
            <Heading as="h2" className="h3"><LightBulbIcon /> Good first issues</Heading>
            <Text as="p" className="muted">
              Active projects with beginner labels — ideal for students joining open source.
            </Text>
            <ul className="collection-list">
              {beginner.map((r) => (
                <li key={r.repo_id}>
                  <Link as={RouterLink} to={`/repos/${r.repo_id}`}>{r.full_name}</Link>
                  <CounterLabel>{r.beginner_label_count}</CounterLabel>
                </li>
              ))}
            </ul>
            <Button as={RouterLink} to="/beginner" variant="invisible">Browse collection →</Button>
          </section>

          <section className="panel collection-card">
            <Label variant="danger">Collection</Label>
            <Heading as="h2" className="h3"><AlertIcon /> Needs a maintainer</Heading>
            <Text as="p" className="muted">
              Repositories flagged abandoned or inactive for 180+ days.
            </Text>
            <ul className="collection-list">
              {inactive.map((r) => (
                <li key={r.repo_id}>
                  <Link as={RouterLink} to={`/repos/${r.repo_id}`}>{r.full_name}</Link>
                </li>
              ))}
            </ul>
            <Button as={RouterLink} to="/inactive" variant="invisible">See unmaintained →</Button>
          </section>

          <section className="panel collection-card">
            <Label>Spotlight</Label>
            <Heading as="h2" className="h3"><OrganizationIcon /> Organizations</Heading>
            <ul className="collection-list">
              {(topOrgs || []).slice(0, 4).map((o) => (
                <li key={o.org_id}>
                  <Link as={RouterLink} to={`/orgs/${o.org_id}`}>{o.org_login}</Link>
                  <span className="muted">★ {compactNumber(o.total_stars)}</span>
                </li>
              ))}
            </ul>
            <Button as={RouterLink} to="/orgs" variant="invisible">Browse orgs →</Button>
          </section>

          <section className="panel collection-card">
            <Heading as="h2" className="h3"><SyncIcon /> Recently synced</Heading>
            <ul className="collection-list">
              {(recentSyncs || []).slice(0, 4).map((s) => (
                <li key={s.sync_id}>
                  <span>#{s.sync_id} · {s.status}</span>
                  <span className="muted">{s.repos_synced} repos</span>
                </li>
              ))}
              {!recentSyncs?.length && <li className="muted">No syncs yet</li>}
            </ul>
            <Button as={RouterLink} to="/insights" variant="invisible">Open Insights →</Button>
          </section>
        </aside>
      </div>
    </div>
  )
}
