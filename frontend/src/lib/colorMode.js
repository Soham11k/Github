import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'osint-color-mode'

function applyColorMode(mode) {
  const root = document.documentElement
  root.setAttribute('data-color-mode', mode)
  root.setAttribute('data-light-theme', 'light')
  root.setAttribute('data-dark-theme', 'dark')
}

function readInitial() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'auto') return stored
  } catch {
    /* ignore */
  }
  return 'auto'
}

export function useColorMode() {
  const [colorMode, setColorModeState] = useState(readInitial)

  useEffect(() => {
    applyColorMode(colorMode)
    try {
      localStorage.setItem(STORAGE_KEY, colorMode)
    } catch {
      /* ignore */
    }
  }, [colorMode])

  const setColorMode = useCallback((mode) => {
    setColorModeState(mode)
  }, [])

  const cycleColorMode = useCallback(() => {
    setColorModeState((prev) => {
      if (prev === 'auto') return 'light'
      if (prev === 'light') return 'dark'
      return 'auto'
    })
  }, [])

  const resolved =
    colorMode === 'auto'
      ? (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light')
      : colorMode

  return { colorMode, resolved, setColorMode, cycleColorMode }
}
