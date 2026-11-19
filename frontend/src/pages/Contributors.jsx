import { useEffect, useState } from 'react'
import { Avatar, Heading, Label, ProgressBar, Text } from '@primer/react'
import { PeopleIcon } from '@primer/octicons-react'
import { api } from '../api'
import { RankedBar, ScatterBubble } from '../components/MarketCharts'
import { EmptyState, ErrorState, LoadingState } from '../components/StateBanner'
import { compactNumber } from '../lib/format'

export default function Contributors() {
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.contributors(75)
      .then((d) => setItems(d.items || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const max = Math.max(...items.map((c) => Number(c.total_contributions) || 0), 1)

  return (
    <div className="page">
      <div className="page-head">
        <Heading as="h1"><PeopleIcon /> People</Heading>
        <Text as="p" className="muted">
          Contributor rankings powered by SQL window functions —{' '}
          <code>RANK()</code>, <code>DENSE_RANK()</code>, and <code>PERCENT_RANK()</code>.
        </Text>
      </div>

      {error && <ErrorState message={error} />}
      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState title="No contributors ranked yet" icon={PeopleIcon} />
      ) : (
        <>
          <div className="insights-charts" style={{ marginBottom: '1rem' }}>
            <section className="panel">
              <div className="panel-head">
                <Heading as="h2" className="h3">Top contributors</Heading>
              </div>
              <RankedBar
                items={items.map((c) => ({
                  label: c.login,
                  value: Number(c.total_contributions) || 0,
                }))}
                label="Contributions"
                limit={12}
              />
            </section>
            <section className="panel">
              <div className="panel-head">
                <Heading as="h2" className="h3">Contributions vs recent commits</Heading>
              </div>
              <ScatterBubble
                mode="bubble"
                xLabel="Total contributions"
                yLabel="Recent commits"
                points={items.slice(0, 40).map((c) => ({
                  x: Number(c.total_contributions) || 0,
                  y: Number(c.recent_commits) || 0,
                  r: Math.max(4, Math.min(18, (Number(c.repo_count) || 1) * 2)),
                  label: c.login,
                }))}
              />
            </section>
          </div>

          <div className="panel">
            <table className="people-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Contributor</th>
                  <th>Contributions</th>
                  <th>Repos</th>
                  <th>Recent</th>
                  <th>Percentile</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.contributor_id}>
                    <td>
                      <Label variant={c.contribution_rank <= 3 ? 'success' : 'secondary'}>
                        #{c.contribution_rank}
                      </Label>
                    </td>
                    <td>
                      <div className="people-cell">
                        <Avatar
                          src={c.avatar_url || undefined}
                          alt=""
                          size={32}
                        />
                        <div>
                          <a href={c.html_url} target="_blank" rel="noreferrer">{c.login}</a>
                          <div className="muted">{c.type}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="contrib-bar-cell">
                        <strong>{compactNumber(c.total_contributions)}</strong>
                        <ProgressBar
                          progress={(Number(c.total_contributions) / max) * 100}
                          barSize="small"
                          aria-label={`${c.total_contributions} contributions`}
                        />
                      </div>
                    </td>
                    <td>{c.repo_count}</td>
                    <td>{c.recent_commits}</td>
                    <td>{(Number(c.contribution_percentile) * 100).toFixed(0)}%</td>
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
