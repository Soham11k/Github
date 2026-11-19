import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Heading, Link, Text } from '@primer/react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { GraphIcon } from '@primer/octicons-react'
import { api } from '../api'
import CommitHeatmap from '../components/CommitHeatmap'
import {
  MultiLine,
  RankedBar,
  ShareDoughnut,
} from '../components/MarketCharts'
import { HealthDistributionChart } from '../components/RepoCharts'
import RepoListItem from '../components/RepoListItem'
import { EmptyState, ErrorState, LoadingState } from '../components/StateBanner'
import { useChartTheme } from '../lib/chartTheme'
import { compactNumber } from '../lib/format'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

export default function Insights() {
  const [data, setData] = useState(null)
  const [healthDist, setHealthDist] = useState(null)
  const [heatmap, setHeatmap] = useState({ items: [], timezone: 'UTC' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const theme = useChartTheme()

  useEffect(() => {
    api.dashboard()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    let cancelled = false
    Promise.allSettled([
      api.marketHealthDistribution(),
      api.marketCommitHeatmap(),
    ]).then(([distRes, heatRes]) => {
      if (cancelled) return
      if (distRes.status === 'fulfilled') setHealthDist(distRes.value)
      if (heatRes.status === 'fulfilled') {
        setHeatmap({
          items: heatRes.value.items || [],
          timezone: heatRes.value.timezone || 'UTC',
        })
      }
    })
    return () => { cancelled = true }
  }, [])

  if (loading) return <LoadingState label="Loading insights…" />
  if (error) return <ErrorState message={error} />
  if (!data) return <EmptyState title="No insight data" icon={GraphIcon} />

  const { languages, activity, top_repos: topRepos, top_orgs: topOrgs } = data

  const langChart = {
    labels: (languages || []).map((l) => l.language_name),
    datasets: [{
      label: 'Total bytes',
      data: (languages || []).map((l) => Number(l.total_bytes)),
      backgroundColor: theme.palette,
      borderRadius: 6,
    }],
  }

  const chartDefaults = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: theme.text } } },
    scales: {
      x: { ticks: { color: theme.text }, grid: { color: theme.grid } },
      y: { ticks: { color: theme.text }, grid: { color: theme.grid } },
    },
  }

  return (
    <div className="page">
      <div className="page-head">
        <Heading as="h1"><GraphIcon /> Insights</Heading>
        <Text as="p" className="muted">
          Time-series and distribution charts from live SQL views.
          Marketplace KPIs live on <Link as={RouterLink} to="/">Explore</Link>.
        </Text>
      </div>

      <div className="insights-charts">
        <section className="panel">
          <div className="panel-head">
            <Heading as="h2" className="h3">Language popularity</Heading>
            <Link as={RouterLink} to="/">Explore</Link>
          </div>
          <div className="chart-wrap">
            <Bar data={langChart} options={chartDefaults} />
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <Heading as="h2" className="h3">Language share</Heading>
          </div>
          <ShareDoughnut
            items={(languages || []).map((l) => ({
              label: l.language_name,
              value: Number(l.total_bytes) || 0,
            }))}
            emptyMessage="No language bytes yet."
          />
        </section>
      </div>

      <section className="panel" style={{ marginTop: '1rem' }}>
        <div className="panel-head">
          <Heading as="h2" className="h3">Activity (90 days)</Heading>
        </div>
        <MultiLine
          rows={activity || []}
          xKey="activity_date"
          fillFirst
          series={[
            { key: 'commit_count', label: 'Commits', color: theme.accent },
            { key: 'active_repos', label: 'Active repos', color: theme.success },
            { key: 'active_contributors', label: 'Active contributors', color: theme.done },
          ]}
        />
      </section>

      <div className="insights-charts" style={{ marginTop: '1rem' }}>
        <section className="panel">
          <div className="panel-head">
            <Heading as="h2" className="h3">Top repos by health</Heading>
            <Link as={RouterLink} to="/repos?sort=health">All repos</Link>
          </div>
          <RankedBar
            items={(topRepos || []).map((r) => ({
              label: r.full_name,
              value: Number(r.health_score) || 0,
            }))}
            label="Health"
            limit={10}
          />
        </section>
        <section className="panel">
          <div className="panel-head">
            <Heading as="h2" className="h3">Top orgs by stars</Heading>
            <Link as={RouterLink} to="/orgs">View all</Link>
          </div>
          <RankedBar
            items={(topOrgs || []).map((o) => ({
              label: o.org_login,
              value: Number(o.total_stars) || 0,
            }))}
            label="Stars"
            limit={10}
            color={theme.attention}
          />
        </section>
      </div>

      <div className="insights-charts" style={{ marginTop: '1rem' }}>
        <section className="panel">
          <div className="panel-head">
            <Heading as="h2" className="h3">Marketplace health mix</Heading>
          </div>
          <HealthDistributionChart distribution={healthDist} />
        </section>
        <section className="panel">
          <div className="panel-head">
            <Heading as="h2" className="h3">Global commit punch card</Heading>
          </div>
          <Text as="p" className="muted">All indexed repos · weekday × hour (UTC)</Text>
          <CommitHeatmap items={heatmap.items} timezone={heatmap.timezone} />
        </section>
      </div>

      <div className="insights-charts" style={{ marginTop: '1rem' }}>
        <section className="panel">
          <div className="panel-head">
            <Heading as="h2" className="h3">Healthiest repositories</Heading>
            <Link as={RouterLink} to="/repos?sort=health">All repos</Link>
          </div>
          <div className="repo-list">
            {(topRepos || []).slice(0, 8).map((r) => (
              <RepoListItem key={r.repo_id} repo={r} />
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <Heading as="h2" className="h3">Top organizations</Heading>
            <Link as={RouterLink} to="/orgs">View all</Link>
          </div>
          <table className="people-table">
            <thead>
              <tr>
                <th>Org</th>
                <th>Repos</th>
                <th>Stars</th>
                <th>Avg health</th>
              </tr>
            </thead>
            <tbody>
              {(topOrgs || []).map((o) => (
                <tr key={o.org_id}>
                  <td>
                    <Link as={RouterLink} to={`/orgs/${o.org_id}`}>{o.org_login}</Link>
                  </td>
                  <td>{o.repo_count}</td>
                  <td>{compactNumber(o.total_stars)}</td>
                  <td>{o.avg_health_score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}
