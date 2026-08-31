const compact = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

export function compactNumber(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return compact.format(n)
}

export function relativeTime(dateLike) {
  if (!dateLike) return null
  const date = new Date(dateLike)
  if (Number.isNaN(date.getTime())) return null

  const seconds = Math.round((date.getTime() - Date.now()) / 1000)
  const abs = Math.abs(seconds)
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

  const divisions = [
    { amount: 60, unit: 'second' },
    { amount: 60, unit: 'minute' },
    { amount: 24, unit: 'hour' },
    { amount: 7, unit: 'day' },
    { amount: 4.34524, unit: 'week' },
    { amount: 12, unit: 'month' },
    { amount: Number.POSITIVE_INFINITY, unit: 'year' },
  ]

  let duration = seconds
  for (const division of divisions) {
    if (Math.abs(duration) < division.amount) {
      return rtf.format(Math.round(duration), division.unit)
    }
    duration /= division.amount
  }
  return rtf.format(Math.round(duration), 'year')
}

export function healthVariant(score) {
  const n = Number(score)
  if (n >= 70) return 'success'
  if (n >= 40) return 'attention'
  return 'danger'
}

export function healthLabel(score) {
  const n = Number(score)
  if (n >= 70) return 'Healthy'
  if (n >= 40) return 'Fair'
  return 'At risk'
}
