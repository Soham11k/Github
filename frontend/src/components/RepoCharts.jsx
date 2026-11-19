import {
  Chart as ChartJS,
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  RadialLinearScale,
  Tooltip,
} from 'chart.js'
import { Bar, Doughnut, Line, Radar } from 'react-chartjs-2'
import { useChartTheme } from '../lib/chartTheme'
import { languageColor } from '../lib/languageColors'

ChartJS.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  RadialLinearScale,
  Tooltip,
)

function EmptyChart({ message = 'No data to chart yet.' }) {
  return <p className="muted chart-caption">{message}</p>
}

function baseOptions(theme, { legend = true, suggestedMax } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: legend
        ? { labels: { color: theme.text } }
        : { display: false },
    },
    scales: {
      x: {
        ticks: { color: theme.text },
        grid: { color: theme.grid },
      },
      y: {
        ticks: { color: theme.text },
        grid: { color: theme.grid },
        ...(suggestedMax != null ? { suggestedMax } : {}),
      },
    },
  }
}

function monthLabel(value) {
  if (!value) return ''
  const s = String(value)
  return s.length >= 7 ? s.slice(0, 7) : s
}

export function MonthlyActivityChart({ monthly }) {
  const theme = useChartTheme()
  if (!monthly?.length) return <EmptyChart />

  const labels = monthly.map((m) => monthLabel(m.activity_month))
  const data = {
    labels,
    datasets: [
      {
        type: 'bar',
        label: 'Commits',
        data: monthly.map((m) => Number(m.commit_count) || 0),
        backgroundColor: `${theme.accent}99`,
        borderRadius: 4,
        order: 2,
      },
      {
        type: 'line',
        label: 'Issues',
        data: monthly.map((m) => Number(m.issue_count) || 0),
        borderColor: theme.attention,
        backgroundColor: theme.attention,
        tension: 0.3,
        order: 1,
      },
      {
        type: 'line',
        label: 'PRs',
        data: monthly.map((m) => Number(m.pr_count) || 0),
        borderColor: theme.done,
        backgroundColor: theme.done,
        tension: 0.3,
        order: 0,
      },
    ],
  }

  return (
    <div className="chart-wrap">
      <Bar data={data} options={baseOptions(theme)} />
    </div>
  )
}

export function StatusDoughnut({ title, labels, values, colors }) {
  const theme = useChartTheme()
  const total = values.reduce((a, b) => a + (Number(b) || 0), 0)
  if (!total) return <EmptyChart message={`No ${title.toLowerCase()} yet.`} />

  const data = {
    labels,
    datasets: [{
      data: values.map((v) => Number(v) || 0),
      backgroundColor: colors,
      borderWidth: 0,
    }],
  }

  return (
    <div>
      <h4 className="h4" style={{ marginBottom: '0.5rem' }}>{title}</h4>
      <div className="chart-wrap chart-wrap--sm">
        <Doughnut
          data={data}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { color: theme.text } },
            },
          }}
        />
      </div>
    </div>
  )
}

export function LanguageDoughnut({ languages }) {
  const theme = useChartTheme()
  if (!languages?.length) return <EmptyChart message="No language breakdown." />

  const top = languages.slice(0, 8)
  const data = {
    labels: top.map((l) => l.language_name),
    datasets: [{
      data: top.map((l) => Number(l.bytes) || Number(l.share_pct) || 0),
      backgroundColor: top.map((l) => languageColor(l.language_name)),
      borderWidth: 0,
    }],
  }

  return (
    <div>
      <h4 className="h4" style={{ marginBottom: '0.5rem' }}>Languages</h4>
      <div className="chart-wrap chart-wrap--sm">
        <Doughnut
          data={data}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { color: theme.text } },
            },
          }}
        />
      </div>
    </div>
  )
}

export function TopContributorsChart({ contributors }) {
  const theme = useChartTheme()
  const top = (contributors || []).slice(0, 10)
  if (!top.length) return <EmptyChart message="No contributors loaded." />

  const data = {
    labels: top.map((c) => c.login),
    datasets: [{
      label: 'Contributions',
      data: top.map((c) => Number(c.contributions) || 0),
      backgroundColor: theme.accent,
      borderRadius: 4,
    }],
  }

  return (
    <div>
      <h4 className="h4" style={{ marginBottom: '0.5rem' }}>Top contributors</h4>
      <div className="chart-wrap">
        <Bar
          data={data}
          options={{
            ...baseOptions(theme, { legend: false }),
            indexAxis: 'y',
          }}
        />
      </div>
    </div>
  )
}

const FACTOR_ROWS = [
  ['Commit velocity', 'factor_commit_velocity', 'factor_commit_velocity_max'],
  ['Contributors', 'factor_contributors', 'factor_contributors_max'],
  ['Issue resolution', 'factor_issue_resolution', 'factor_issue_resolution_max'],
  ['Time to close', 'factor_time_to_close', 'factor_time_to_close_max'],
  ['PR merge', 'factor_pr_merge', 'factor_pr_merge_max'],
  ['Recency', 'factor_recency', 'factor_recency_max'],
]

export function HealthFactorRadar({ factors }) {
  const theme = useChartTheme()
  if (!factors) return <EmptyChart message="No health factors." />

  const data = {
    labels: FACTOR_ROWS.map(([label]) => label),
    datasets: [{
      label: 'Score % of max',
      data: FACTOR_ROWS.map(([, key, maxKey]) => {
        const max = Number(factors[maxKey]) || 1
        const value = Number(factors[key]) || 0
        return Math.max(0, Math.min(100, (value / max) * 100))
      }),
      borderColor: theme.accent,
      backgroundColor: `${theme.accent}33`,
      fill: true,
    }],
  }

  return (
    <div className="chart-wrap">
      <Radar
        data={data}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: theme.text } } },
          scales: {
            r: {
              suggestedMin: 0,
              suggestedMax: 100,
              angleLines: { color: theme.grid },
              grid: { color: theme.grid },
              pointLabels: { color: theme.text },
              ticks: { color: theme.text, backdropColor: 'transparent' },
            },
          },
        }}
      />
    </div>
  )
}

export function HealthDistributionChart({ distribution }) {
  const theme = useChartTheme()
  const buckets = distribution?.buckets || []
  if (!buckets.length) return <EmptyChart message="No health distribution yet." />

  const highlight = distribution?.position?.health_bucket
  const data = {
    labels: buckets.map((b) => `${b.bucket_low}–${b.bucket_high}`),
    datasets: [{
      label: 'Repositories',
      data: buckets.map((b) => Number(b.repo_count) || 0),
      backgroundColor: buckets.map((b) => (
        Number(b.health_bucket) === Number(highlight)
          ? theme.accent
          : `${theme.accent}55`
      )),
      borderRadius: 4,
    }],
  }

  const pct = distribution?.position?.health_percentile
  const caption = pct != null
    ? `Healthier than ${Math.round(Number(pct) * 100)}% of indexed repositories`
    : null

  return (
    <div>
      <div className="chart-wrap">
        <Bar data={data} options={baseOptions(theme, { legend: false })} />
      </div>
      {caption && <p className="muted chart-caption">{caption}</p>}
    </div>
  )
}

export function FlowChart({ items, mode = 'issues' }) {
  const theme = useChartTheme()
  if (!items?.length) return <EmptyChart />

  const labels = items.map((m) => monthLabel(m.activity_month))

  let datasets
  if (mode === 'issues') {
    datasets = [
      {
        type: 'bar',
        label: 'Opened',
        data: items.map((m) => Number(m.issues_opened) || 0),
        backgroundColor: theme.success,
        borderRadius: 4,
        order: 2,
      },
      {
        type: 'bar',
        label: 'Closed',
        data: items.map((m) => Number(m.issues_closed) || 0),
        backgroundColor: theme.done,
        borderRadius: 4,
        order: 1,
      },
      {
        type: 'line',
        label: 'Open backlog',
        data: items.map((m) => Number(m.open_issue_backlog) || 0),
        borderColor: theme.attention,
        backgroundColor: theme.attention,
        tension: 0.3,
        order: 0,
      },
    ]
  } else {
    datasets = [
      {
        type: 'bar',
        label: 'Opened',
        data: items.map((m) => Number(m.prs_opened) || 0),
        backgroundColor: theme.success,
        borderRadius: 4,
      },
      {
        type: 'bar',
        label: 'Merged',
        data: items.map((m) => Number(m.prs_merged) || 0),
        backgroundColor: theme.done,
        borderRadius: 4,
      },
    ]
  }

  return (
    <div className="chart-wrap">
      <Bar data={{ labels, datasets }} options={baseOptions(theme)} />
    </div>
  )
}

// Re-export Line in case a consumer needs a simple line (not used by RepoDetail)
export { Line }
