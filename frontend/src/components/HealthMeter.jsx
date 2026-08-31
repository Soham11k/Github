import { Label, ProgressBar, Text } from '@primer/react'
import { healthLabel, healthVariant } from '../lib/format'

export default function HealthMeter({ score, showLabel = true }) {
  const n = Math.max(0, Math.min(100, Number(score) || 0))
  const variant = healthVariant(n)

  return (
    <div className="health-meter">
      {showLabel && (
        <div className="health-meter-head">
          <Text weight="semibold">Health score</Text>
          <Label variant={variant}>{n.toFixed(0)} · {healthLabel(n)}</Label>
        </div>
      )}
      <ProgressBar
        progress={n}
        barSize="default"
        aria-label={`Health score ${n}`}
        className={`health-bar health-bar--${variant}`}
      />
    </div>
  )
}
