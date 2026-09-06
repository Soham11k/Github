import { useEffect, useState } from 'react'
import { Text } from '@primer/react'
import { api } from '../api'
import { relativeTime } from '../lib/format'

/** Global “Data as of …” from latest completed sync. */
export default function DataAsOfBanner() {
  const [label, setLabel] = useState('')

  useEffect(() => {
    let cancelled = false
    api.ingestStatus()
      .then((d) => {
        if (cancelled) return
        const sync = d.last_sync
        const finished = sync?.finished_at || sync?.started_at
        if (finished && (sync?.status === 'completed' || sync?.status === 'partial' || sync?.finished_at)) {
          setLabel(`Data as of ${relativeTime(finished) || finished}`)
        } else if (finished) {
          setLabel(`Last sync ${sync?.status || 'running'} · ${relativeTime(finished) || finished}`)
        }
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
