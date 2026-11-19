import {
  Chart as ChartJS,
  ArcElement,
  BarController,
  BarElement,
  BubbleController,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  ScatterController,
  Tooltip,
} from 'chart.js'
import { Bar, Bubble, Doughnut, Line, Scatter } from 'react-chartjs-2'
import { useChartTheme } from '../lib/chartTheme'
import { languageColor } from '../lib/languageColors'

ChartJS.register(
  ArcElement,
  BarController,
  BarElement,
  BubbleController,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  ScatterController,
  Tooltip,
)

function EmptyChart({ message = 'No data to chart yet.' }) {
  return <p className="muted chart-caption">{message}</p>
}

function baseOptions(theme, { legend = true, indexAxis } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis,
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
      },
    },
  }
}

/** Horizontal ranked bar — items: [{ label, value }] */
export function RankedBar({
  items,
  label = 'Value',
  limit = 12,
  color,
  emptyMessage,
}) {
  const theme = useChartTheme()
  const rows = (items || []).slice(0, limit)
  if (!rows.length) return <EmptyChart message={emptyMessage} />

  const data = {
    labels: rows.map((r) => r.label),
    datasets: [{
      label,
      data: rows.map((r) => Number(r.value) || 0),
      backgroundColor: color || theme.accent,
      borderRadius: 4,
    }],
  }

  return (
    <div className="chart-wrap">
      <Bar data={data} options={baseOptions(theme, { legend: false, indexAxis: 'y' })} />
    </div>
  )
}

/**
 * Multi-series activity line.
 * series: [{ key, label, color? }] over rows with matching keys.
 */
export function MultiLine({
  rows,
  xKey = 'activity_date',
  series,
  fillFirst = false,
  heightClass = 'chart-wrap',
}) {
  const theme = useChartTheme()
  if (!rows?.length || !series?.length) return <EmptyChart />

  const palette = [theme.accent, theme.success, theme.done, theme.attention, theme.danger]
  const data = {
    labels: rows.map((r) => r[xKey]),
    datasets: series.map((s, i) => {
      const color = s.color || palette[i % palette.length]
      return {
        label: s.label,
        data: rows.map((r) => Number(r[s.key]) || 0),
        borderColor: color,
        backgroundColor: fillFirst && i === 0 ? `${color}33` : color,
        fill: fillFirst && i === 0,
        tension: 0.35,
        pointRadius: rows.length > 40 ? 0 : 2,
      }
    }),
  }

  return (
    <div className={heightClass}>
      <Line data={data} options={baseOptions(theme)} />
    </div>
  )
}

/** Compact sparkline for Explore hero */
export function Sparkline({ values, label = 'Commits' }) {
  const theme = useChartTheme()
  if (!values?.length) return <EmptyChart message="No recent activity." />

  const data = {
    labels: values.map((_, i) => i),
    datasets: [{
      label,
      data: values.map((v) => Number(v) || 0),
      borderColor: theme.accent,
      backgroundColor: `${theme.accent}33`,
      fill: true,
      tension: 0.35,
      pointRadius: 0,
      borderWidth: 2,
    }],
  }

  return (
    <div className="chart-wrap chart-wrap--spark">
      <Line
        data={data}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { enabled: true } },
          scales: {
            x: { display: false },
            y: { display: false },
          },
        }}
      />
    </div>
  )
}

/** Share doughnut — items: [{ label, value, color? }] */
export function ShareDoughnut({ items, emptyMessage }) {
  const theme = useChartTheme()
  const rows = (items || []).filter((r) => Number(r.value) > 0)
  if (!rows.length) return <EmptyChart message={emptyMessage} />

  const data = {
    labels: rows.map((r) => r.label),
    datasets: [{
      data: rows.map((r) => Number(r.value) || 0),
      backgroundColor: rows.map((r, i) => (
        r.color
        || languageColor(r.label)
        || theme.palette[i % theme.palette.length]
      )),
      borderWidth: 0,
    }],
  }

  return (
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
  )
}

/**
 * Scatter or bubble.
 * points: [{ x, y, r?, label? }]
 * mode: 'scatter' | 'bubble'
 */
export function ScatterBubble({
  points,
  xLabel = 'X',
  yLabel = 'Y',
  mode = 'scatter',
  emptyMessage,
}) {
  const theme = useChartTheme()
  if (!points?.length) return <EmptyChart message={emptyMessage} />

  const dataset = {
    label: `${xLabel} vs ${yLabel}`,
    data: points.map((p) => ({
      x: Number(p.x) || 0,
      y: Number(p.y) || 0,
      ...(mode === 'bubble' ? { r: Math.max(4, Number(p.r) || 4) } : {}),
    })),
    backgroundColor: `${theme.accent}99`,
    borderColor: theme.accent,
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label(ctx) {
            const p = points[ctx.dataIndex]
            const name = p?.label ? `${p.label}: ` : ''
            return `${name}${xLabel}=${ctx.parsed.x}, ${yLabel}=${ctx.parsed.y}`
          },
        },
      },
    },
    scales: {
      x: {
        title: { display: true, text: xLabel, color: theme.text },
        ticks: { color: theme.text },
        grid: { color: theme.grid },
      },
      y: {
        title: { display: true, text: yLabel, color: theme.text },
        ticks: { color: theme.text },
        grid: { color: theme.grid },
      },
    },
  }

  return (
    <div className="chart-wrap">
      {mode === 'bubble'
        ? <Bubble data={{ datasets: [dataset] }} options={options} />
        : <Scatter data={{ datasets: [dataset] }} options={options} />}
    </div>
  )
}

/** Sync history: repos_synced bars + duration line */
export function SyncHistoryChart({ runs }) {
  const theme = useChartTheme()
  const rows = [...(runs || [])].reverse()
  if (!rows.length) return <EmptyChart message="No sync runs yet." />

  const labels = rows.map((r) => `#${r.sync_id}`)
  const data = {
    labels,
    datasets: [
      {
        type: 'bar',
        label: 'Repos synced',
        data: rows.map((r) => Number(r.repos_synced) || 0),
        backgroundColor: `${theme.accent}99`,
        borderRadius: 4,
        yAxisID: 'y',
        order: 2,
      },
      {
        type: 'line',
        label: 'Duration (s)',
        data: rows.map((r) => Number(r.duration_seconds) || 0),
        borderColor: theme.attention,
        backgroundColor: theme.attention,
        tension: 0.3,
        yAxisID: 'y1',
        order: 1,
      },
    ],
  }

  return (
    <div className="chart-wrap">
      <Bar
        data={data}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: theme.text } } },
          scales: {
            x: { ticks: { color: theme.text }, grid: { color: theme.grid } },
            y: {
              position: 'left',
              ticks: { color: theme.text },
              grid: { color: theme.grid },
              title: { display: true, text: 'Repos', color: theme.text },
            },
            y1: {
              position: 'right',
              ticks: { color: theme.text },
              grid: { drawOnChartArea: false },
              title: { display: true, text: 'Seconds', color: theme.text },
            },
          },
        }}
      />
    </div>
  )
}
