import { useEffect, useState } from 'react'
import { Text } from '@primer/react'
import { api } from '../api'
import { relativeTime } from '../lib/format'

function formatOldest(value) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return String(value)
  }
}

/** Global “Data as of …” from latest completed sync + sample window caps. */
export default function DataAsOfBanner() {
  const [label, setLabel] = useState('')

  useEffect(() => {
    let cancelled = false
    api.ingestStatus()
      .then((d) => {
        if (cancelled) return
        const parts = []
        const sync = d.last_sync
        const finished = sync?.finished_at || sync?.started_at
        if (finished && (sync?.status === 'completed' || sync?.status === 'partial' || sync?.finished_at)) {
          parts.push(`Data as of ${relativeTime(finished) || finished}`)
        } else if (finished) {
          parts.push(`Last sync ${sync?.status || 'running'} · ${relativeTime(finished) || finished}`)
        }
        const sw = d.sample_window
        if (sw?.activity_days) {
          const caps = [sw.commit_cap, sw.issue_cap, sw.pr_cap].filter((n) => n != null)
          const capHint = caps.length ? `capped at ${Math.max(...caps)}` : null
          parts.push(
            capHint
              ? `public activity last ${sw.activity_days}d · ${capHint}`
              : `public activity last ${sw.activity_days}d`,
          )
        }
        setLabel(parts.join(' · '))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  if (!label) return null
  return (
    <div className="data-as-of" role="status">
      <Text as="span" className="muted" size="small">{label}</Text>
    </div>
  )
}

export { formatOldest }
