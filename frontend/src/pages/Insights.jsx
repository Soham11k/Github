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

function Kpi({ label, value }) {
  return (
    <div className="stat-tile">
      <span className="muted">{label}</span>
      <strong>{value ?? '—'}</strong>
    </div>
  )
}

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

  const { kpis, languages, activity, top_repos: topRepos, top_orgs: topOrgs, recent_syncs: recentSyncs } = data

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
          Dashboard KPIs and Chart.js visuals themed with Primer tokens — flip light/dark to see charts adapt.
        </Text>
      </div>

      <div className="stat-grid">
        <Kpi label="Repositories" value={compactNumber(kpis.repo_count)} />
        <Kpi label="Contributors" value={compactNumber(kpis.contributor_count)} />
        <Kpi label="Commits" value={compactNumber(kpis.commit_count)} />
        <Kpi label="Avg health" value={kpis.avg_health_score} />
        <Kpi label="Median health" value={kpis.median_health_score} />
        <Kpi label="Languages" value={compactNumber(kpis.language_count)} />
        <Kpi label="Organizations" value={compactNumber(kpis.org_count)} />
        <Kpi label="Open PRs" value={compactNumber(kpis.open_pr_count)} />
        <Kpi label="Issues" value={compactNumber(kpis.issue_count)} />
        <Kpi label="Pull requests" value={compactNumber(kpis.pr_count)} />
        <Kpi label="Beginner-friendly" value={compactNumber(kpis.beginner_friendly_count)} />
        <Kpi label="Abandoned" value={compactNumber(kpis.abandoned_count)} />
      </div>

      <div className="insights-charts">
        <section className="panel">
          <div className="panel-head">
            <Heading as="h2" className="h3">Language popularity</Heading>
            <Link as={RouterLink} to="/">Explore topics</Link>
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
            <Heading as="h2" className="h3">Top organizations</Heading>
            <Link as={RouterLink} to="/orgs">View all</Link>
          </div>
          <ul className="collection-list">
            {(topOrgs || []).map((o) => (
              <li key={o.org_id}>
                <Link as={RouterLink} to={`/orgs/${o.org_id}`}>{o.org_login}</Link>
                <span className="muted">★ {compactNumber(o.total_stars)} · health {o.avg_health_score}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel">
          <div className="panel-head">
            <Heading as="h2" className="h3">Recent sync runs</Heading>
          </div>
          <ul className="collection-list">
            {(recentSyncs || []).map((s) => (
              <li key={s.sync_id}>
                <span>#{s.sync_id} · {s.status}</span>
                <span className="muted">{s.repos_synced} repos · {Number(s.duration_seconds || 0).toFixed(0)}s</span>
              </li>
            ))}
            {!recentSyncs?.length && <li className="muted">No sync runs recorded</li>}
          </ul>
        </section>
      </div>

      <section className="panel" style={{ marginTop: '1rem' }}>
        <div className="panel-head">
          <Heading as="h2" className="h3">Top healthy repositories</Heading>
          <Link as={RouterLink} to="/repos?sort=health">View all</Link>
        </div>
        <div className="repo-list">
          {(topRepos || []).map((r) => (
            <RepoListItem key={r.repo_id} repo={r} />
          ))}
        </div>
      </section>
    </div>
  )
}
