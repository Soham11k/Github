import { useEffect, useMemo, useState } from 'react'
import { useColorMode } from './colorMode'

function cssVar(name, fallback) {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

export function useChartTheme() {
  const { resolved } = useColorMode()
  const [tick, setTick] = useState(0)

  useEffect(() => {
    setTick((t) => t + 1)
  }, [resolved])

  return useMemo(() => {
    void tick
    return {
      text: cssVar('--fgColor-muted', '#656d76'),
      grid: cssVar('--borderColor-muted', '#d0d7de'),
      border: cssVar('--borderColor-default', '#d0d7de'),
      accent: cssVar('--fgColor-accent', '#0969da'),
      success: cssVar('--fgColor-success', '#1a7f37'),
      attention: cssVar('--fgColor-attention', '#9a6700'),
      danger: cssVar('--fgColor-danger', '#cf222e'),
      done: cssVar('--fgColor-done', '#8250df'),
      palette: [
        cssVar('--fgColor-accent', '#0969da'),
        cssVar('--fgColor-success', '#1a7f37'),
        '#8250df',
        cssVar('--fgColor-attention', '#9a6700'),
        cssVar('--fgColor-danger', '#cf222e'),
        '#bf3989',
      ],
    }
  }, [tick, resolved])
}
