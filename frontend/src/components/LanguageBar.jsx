import { Text } from '@primer/react'
import { languageColor } from '../lib/languageColors'
import { compactNumber } from '../lib/format'

export default function LanguageBar({ languages = [] }) {
  if (!languages.length) {
    return <Text className="muted">No language data</Text>
  }

  const total = languages.reduce((sum, l) => sum + Number(l.bytes || 0), 0) || 1

  return (
    <div className="lang-bar-wrap">
      <div className="lang-bar" role="img" aria-label="Language breakdown">
        {languages.map((l) => {
          const pct = Number(l.share_pct) || (Number(l.bytes) / total) * 100
          return (
            <span
              key={l.language_name}
              className="lang-bar-seg"
              style={{
                width: `${Math.max(pct, 0.5)}%`,
                backgroundColor: languageColor(l.language_name),
              }}
              title={`${l.language_name} ${pct.toFixed(1)}%`}
            />
          )
        })}
      </div>
      <ul className="lang-legend">
        {languages.map((l) => {
          const pct = Number(l.share_pct) || (Number(l.bytes) / total) * 100
          return (
            <li key={l.language_name}>
              <span className="lang-dot" style={{ backgroundColor: languageColor(l.language_name) }} />
              <strong>{l.language_name}</strong>
              <span className="muted"> {pct.toFixed(1)}%</span>
              <span className="muted"> · {compactNumber(l.bytes)} bytes</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
