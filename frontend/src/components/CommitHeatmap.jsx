const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOURS = Array.from({ length: 24 }, (_, i) => i)

function levelForCount(count, max) {
  if (!count || max <= 0) return 0
  const ratio = count / max
  if (ratio <= 0.25) return 1
  if (ratio <= 0.5) return 2
  if (ratio <= 0.75) return 3
  return 4
}

export default function CommitHeatmap({ items = [], timezone = 'UTC' }) {
  const grid = new Map()
  let max = 0
  for (const cell of items) {
    const weekday = Number(cell.weekday)
    const hour = Number(cell.hour_of_day)
    const count = Number(cell.commit_count) || 0
    grid.set(`${weekday}-${hour}`, count)
    if (count > max) max = count
  }

  if (!items.length) {
    return <p className="muted chart-caption">No commits to map yet.</p>
  }

  return (
    <div className="punchcard">
      <div className="punchcard-grid" role="img" aria-label={`Commit activity by weekday and hour (${timezone})`}>
        <div className="punchcard-corner" />
        {HOURS.map((h) => (
          <div key={`h-${h}`} className="punchcard-hour-label">
            {h % 3 === 0 ? String(h).padStart(2, '0') : ''}
          </div>
        ))}
        {WEEKDAYS.map((label, idx) => {
          const weekday = idx + 1
          return (
            <div key={label} className="punchcard-row">
              <div className="punchcard-day-label">{label}</div>
              {HOURS.map((hour) => {
                const count = grid.get(`${weekday}-${hour}`) || 0
                const level = levelForCount(count, max)
                return (
                  <div
                    key={`${weekday}-${hour}`}
                    className={`punchcard-cell punchcard-cell--l${level}`}
                    title={`${label} ${String(hour).padStart(2, '0')}:00 ${timezone} · ${count} commit${count === 1 ? '' : 's'}`}
                  />
                )
              })}
            </div>
          )
        })}
      </div>
      <div className="punchcard-legend">
        <span className="muted">Less</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span key={level} className={`punchcard-cell punchcard-cell--l${level}`} />
        ))}
        <span className="muted">More</span>
        <span className="muted punchcard-tz">{timezone}</span>
      </div>
    </div>
  )
}
