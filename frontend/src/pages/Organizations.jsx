import { useEffect, useState } from 'react'
import { Link as RouterLink, useParams } from 'react-router-dom'
import { Heading, Label, Link, Text } from '@primer/react'
import { OrganizationIcon } from '@primer/octicons-react'
import { api } from '../api'
import { RankedBar, ScatterBubble } from '../components/MarketCharts'
import RepoListItem from '../components/RepoListItem'
import { EmptyState, ErrorState, LoadingState } from '../components/StateBanner'
import { useChartTheme } from '../lib/chartTheme'
import { compactNumber } from '../lib/format'
import { languageColor } from '../lib/languageColors'

export default function Organizations() {
  const { id } = useParams()
  if (id) return <OrgDetail orgId={id} />
  return <OrgList />
}

function OrgList() {
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const theme = useChartTheme()

  useEffect(() => {
    api.orgs()
      .then((d) => setItems(d.items || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="page">
      <div className="page-head">
        <Heading as="h1"><OrganizationIcon /> Organizations</Heading>
        <Text as="p" className="muted">
          Org-level aggregates from <code>v_org_analytics</code> — stars, average health, abandoned share, top language.
        </Text>
      </div>
      {error && <ErrorState message={error} />}
      {loading ? <LoadingState /> : items.length === 0 ? (
        <EmptyState title="No organizations yet" icon={OrganizationIcon} />
      ) : (
        <>
          <div className="insights-charts" style={{ marginBottom: '1rem' }}>
            <section className="panel">
              <div className="panel-head">
                <Heading as="h2" className="h3">Stars by organization</Heading>
              </div>
              <RankedBar
                items={items.map((o) => ({
                  label: o.org_login,
                  value: Number(o.total_stars) || 0,
                }))}
                label="Stars"
                limit={12}
                color={theme.attention}
              />
            </section>
            <section className="panel">
              <div className="panel-head">
                <Heading as="h2" className="h3">Stars vs average health</Heading>
              </div>
              <ScatterBubble
                mode="bubble"
                xLabel="Stars"
                yLabel="Avg health"
                points={items.map((o) => ({
                  x: Number(o.total_stars) || 0,
                  y: Number(o.avg_health_score) || 0,
                  r: Math.max(4, Math.min(20, (Number(o.repo_count) || 1) * 3)),
                  label: o.org_login,
                }))}
              />
            </section>
          </div>

          <div className="panel">
            <table className="people-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Organization</th>
                  <th>Repos</th>
                  <th>Stars</th>
                  <th>Avg health</th>
                  <th>Abandoned %</th>
                  <th>Top language</th>
                </tr>
              </thead>
              <tbody>
                {items.map((o) => (
                  <tr key={o.org_id}>
                    <td><Label variant="secondary">#{o.org_rank}</Label></td>
                    <td>
                      <Link as={RouterLink} to={`/orgs/${o.org_id}`}>{o.org_login}</Link>
                      <div className="muted">{o.org_name}</div>
                    </td>
                    <td>{o.repo_count}</td>
                    <td>{compactNumber(o.total_stars)}</td>
                    <td>{o.avg_health_score ?? '—'}</td>
                    <td>{o.abandoned_share_pct}%</td>
                    <td>
                      {o.top_language ? (
                        <>
                          <span className="lang-dot" style={{ backgroundColor: languageColor(o.top_language) }} />
                          {' '}{o.top_language}
                        </>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function OrgDetail({ orgId }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const theme = useChartTheme()

  useEffect(() => {
    setLoading(true)
    api.org(orgId)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [orgId])

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} />
  if (!data?.org) return <EmptyState title="Organization not found" />

  const { org, repos } = data

  return (
    <div className="page">
      <div className="page-head">
        <p className="muted"><Link as={RouterLink} to="/orgs">← Organizations</Link></p>
        <Heading as="h1"><OrganizationIcon /> {org.org_login}</Heading>
        <Text as="p" className="muted">{org.description || org.org_name}</Text>
        <div className="repo-row-meta" style={{ marginTop: '0.75rem' }}>
          <Label>{org.repo_count} repos</Label>
          <Label>★ {compactNumber(org.total_stars)}</Label>
          <Label variant="success">Avg health {org.avg_health_score}</Label>
          {org.top_language && <Label>{org.top_language}</Label>}
        </div>
      </div>

      {(repos || []).length > 0 && (
        <section className="panel" style={{ marginBottom: '1rem' }}>
          <div className="panel-head">
            <Heading as="h2" className="h3">Repository health</Heading>
          </div>
          <RankedBar
            items={(repos || []).map((r) => ({
              label: r.full_name,
              value: Number(r.health_score) || 0,
            }))}
            label="Health"
            limit={15}
            color={theme.success}
          />
        </section>
      )}

      <div className="panel">
        <div className="panel-head"><Heading as="h2" className="h3">Repositories</Heading></div>
        <div className="repo-list">
          {(repos || []).map((r) => (
            <RepoListItem key={r.repo_id} repo={r} />
          ))}
        </div>
      </div>
    </div>
  )
}
