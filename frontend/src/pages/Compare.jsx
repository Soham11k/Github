import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { Button, Heading, Label, Text } from '@primer/react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js'
import { Bar, Radar } from 'react-chartjs-2'
import { GitCompareIcon } from '@primer/octicons-react'
import { api } from '../api'
import { EmptyState, ErrorState, LoadingState } from '../components/StateBanner'
import { useChartTheme } from '../lib/chartTheme'
import { compactNumber, healthLabel } from '../lib/format'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
)

const FACTOR_KEYS = [
  ['factor_commit_velocity', 'Commits'],
  ['factor_contributors', 'Contributors'],
  ['factor_issue_resolution', 'Issues'],
  ['factor_time_to_close', 'TTC'],
  ['factor_pr_merge', 'PR merge'],
  ['factor_recency', 'Recency'],
]

export default function Compare() {
  const [params, setParams] = useSearchParams()
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const theme = useChartTheme()

  const ids = useMemo(() => {
    const raw = params.get('ids') || ''
    return raw.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 3)
  }, [params])

  useEffect(() => {
    if (ids.length) return
    let cancelled = false
    api.repos({ sort: 'health', limit: 3 })
      .then((d) => {
        if (cancelled) return
        const top = (d.items || []).map((r) => r.repo_id).filter(Boolean)
        if (top.length) {
          setParams({ ids: top.join(',') }, { replace: true })
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [ids.length, setParams])

  useEffect(() => {
    if (!ids.length) {
      setItems([])
      return
    }
    setLoading(true)
    setError('')
    api.compare(ids)
      .then((d) => setItems(d.items || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [ids.join(',')])

  const radar = {
    labels: FACTOR_KEYS.map(([, label]) => label),
    datasets: items.map((r, i) => ({
      label: r.full_name,
      data: FACTOR_KEYS.map(([key]) => Number(r[key]) || 0),
      borderColor: theme.palette[i % theme.palette.length],
      backgroundColor: `${theme.palette[i % theme.palette.length]}33`,
      fill: true,
    })),
  }

  const bar = {
    labels: items.map((r) => r.full_name),
    datasets: [{
      label: 'Health score',
      data: items.map((r) => Number(r.health_score)),
      backgroundColor: theme.palette,
      borderRadius: 6,
    }],
  }

  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: theme.text } } },
    scales: {
      r: {
        angleLines: { color: theme.grid },
        grid: { color: theme.grid },
        pointLabels: { color: theme.text },
        ticks: { color: theme.text, backdropColor: 'transparent' },
        suggestedMin: 0,
        suggestedMax: 25,
      },
      x: { ticks: { color: theme.text }, grid: { color: theme.grid } },
      y: { ticks: { color: theme.text }, grid: { color: theme.grid }, suggestedMax: 100 },
    },
  }

  return (
    <div className="page">
      <div className="page-head">
        <Heading as="h1"><GitCompareIcon /> Compare repositories</Heading>
        <Text as="p" className="muted">
          Side-by-side metrics from <code>fn_compare_repos</code> and health-factor radar (max 3).
          Select repos on the Repositories page, or pass <code>?ids=</code> in the URL.
        </Text>
      </div>

      {!ids.length && (
        <EmptyState
          title="Picking top repos by health…"
          description="Compare auto-loads the healthiest repositories when none are selected. Or choose up to 3 on Repositories."
          icon={GitCompareIcon}
        />
      )}

      {ids.length > 0 && (
        <div className="panel" style={{ marginBottom: '1rem' }}>
          <div className="panel-head">
            <span>Comparing {ids.length} repositor{ids.length === 1 ? 'y' : 'ies'}</span>
            <Button as={RouterLink} to="/repos" size="small">Back to search</Button>
          </div>
          {error && <ErrorState message={error} />}
          {loading ? <LoadingState /> : (
            <>
              <table className="people-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    {items.map((r) => (
                      <th key={r.repo_id}>
                        <RouterLink to={`/repos/${r.repo_id}`}>{r.full_name}</RouterLink>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Health', (r) => `${Number(r.health_score).toFixed(0)} · ${healthLabel(r.health_score)}`],
                    ['Stars', (r) => compactNumber(r.stars)],
                    ['Language', (r) => r.language_primary || '—'],
                    ['Commits 90d', (r) => r.commits_90d],
                    ['Contributors', (r) => r.unique_contributors],
                    ['Issue close rate', (r) => r.issue_close_rate ?? '—'],
                    ['PR merge rate', (r) => r.pr_merge_rate ?? '—'],
                    ['Open issues', (r) => r.open_issues],
                    ['Days since push', (r) => Number(r.days_since_push || 0).toFixed(0)],
                  ].map(([label, fn]) => (
                    <tr key={label}>
                      <td className="muted">{label}</td>
                      {items.map((r) => <td key={r.repo_id}>{fn(r)}</td>)}
                    </tr>
                  ))}
                  <tr>
                    <td className="muted">Status</td>
                    {items.map((r) => (
                      <td key={r.repo_id}>
                        {r.is_abandoned ? <Label variant="danger">abandoned</Label>
                          : r.is_archived ? <Label variant="attention">archived</Label>
                            : <Label variant="success">active</Label>}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>

              <div className="insights-charts" style={{ marginTop: '1rem' }}>
                <div>
                  <Heading as="h2" className="h3">Health score</Heading>
                  <div className="chart-wrap"><Bar data={bar} options={chartOpts} /></div>
                </div>
                <div>
                  <Heading as="h2" className="h3">Factor radar</Heading>
                  <div className="chart-wrap"><Radar data={radar} options={chartOpts} /></div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {ids.length > 0 && (
        <Button
          variant="invisible"
          onClick={() => setParams({})}
        >
          Clear comparison
        </Button>
      )}
    </div>
  )
}
