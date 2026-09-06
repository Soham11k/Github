import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Heading, Link, Text } from '@primer/react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'
import { GraphIcon } from '@primer/octicons-react'
import { api } from '../api'
import RepoListItem from '../components/RepoListItem'
import { EmptyState, ErrorState, LoadingState } from '../components/StateBanner'
import { useChartTheme } from '../lib/chartTheme'
import { compactNumber } from '../lib/format'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  Filler,
)

export default function Insights() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const theme = useChartTheme()

  useEffect(() => {
    api.dashboard()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingState label="Loading insights…" />
  if (error) return <ErrorState message={error} />
  if (!data) return <EmptyState title="No insight data" icon={GraphIcon} />

  const { languages, activity, top_repos: topRepos, top_orgs: topOrgs } = data

  const chartDefaults = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: theme.text } },
    },
    scales: {
      x: {
        ticks: { color: theme.text },
        grid: { color: theme.grid },
      },
      y: {
        ticks: { color: theme.text },
        grid: { color: theme.grid },
      },
    },
  }

  const langChart = {
    labels: languages.map((l) => l.language_name),
    datasets: [{
      label: 'Total bytes',
      data: languages.map((l) => Number(l.total_bytes)),
      backgroundColor: theme.palette,
      borderRadius: 6,
    }],
  }

  const activityChart = {
    labels: activity.map((a) => a.activity_date),
    datasets: [{
      label: 'Commits / day',
      data: activity.map((a) => a.commit_count),
      borderColor: theme.accent,
      backgroundColor: `${theme.accent}33`,
      fill: true,
      tension: 0.35,
    }],
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
            <Heading as="h2" className="h3">Commit activity (90 days)</Heading>
          </div>
          <div className="chart-wrap">
            <Line data={activityChart} options={chartDefaults} />
          </div>
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
