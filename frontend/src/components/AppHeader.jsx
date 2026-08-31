import { useEffect, useRef } from 'react'
import { Link as RouterLink, NavLink, useNavigate } from 'react-router-dom'
import { Button, IconButton, TextInput } from '@primer/react'
import {
  MarkGithubIcon,
  MoonIcon,
  SearchIcon,
  SunIcon,
  SyncIcon,
} from '@primer/octicons-react'
import { useColorMode } from '../lib/colorMode'

const NAV = [
  { to: '/', label: 'Explore', end: true },
  { to: '/repos', label: 'Repositories' },
  { to: '/compare', label: 'Compare' },
  { to: '/orgs', label: 'Organizations' },
  { to: '/beginner', label: 'Good first issues' },
  { to: '/contributors', label: 'People' },
  { to: '/insights', label: 'Insights' },
  { to: '/inactive', label: 'Unmaintained' },
  { to: '/ingest', label: 'Ingest' },
]

function ThemeIcon({ mode }) {
  if (mode === 'dark') return <MoonIcon />
  if (mode === 'light') return <SunIcon />
  return <SyncIcon />
}

export default function AppHeader() {
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const { colorMode, cycleColorMode } = useColorMode()

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tag = document.activeElement?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onSearch = (e) => {
    e.preventDefault()
    const q = new FormData(e.currentTarget).get('q')?.toString().trim()
    navigate(q ? `/repos?q=${encodeURIComponent(q)}` : '/repos')
  }

  const themeLabel =
    colorMode === 'dark' ? 'Dark' : colorMode === 'light' ? 'Light' : 'Auto'

  return (
    <header className="gh-header">
      <div className="gh-header-inner">
        <div className="gh-header-left">
          <RouterLink to="/" className="gh-logo" aria-label="GitHub OSINT home">
            <MarkGithubIcon size={32} />
          </RouterLink>
          <nav className="gh-nav" aria-label="Primary">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `gh-nav-link${isActive ? ' is-active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <form className="gh-search" onSubmit={onSearch} role="search">
          <TextInput
            ref={inputRef}
            name="q"
            leadingVisual={SearchIcon}
            placeholder="Search repositories…"
            aria-label="Search repositories"
            trailingVisual={() => <kbd className="gh-kbd">/</kbd>}
            className="gh-search-input"
          />
          <Button type="submit" variant="primary" size="small">
            Search
          </Button>
        </form>

        <div className="gh-header-right">
          <IconButton
            icon={() => <ThemeIcon mode={colorMode} />}
            aria-label={`Color mode: ${themeLabel}. Click to cycle light, dark, and auto.`}
            variant="invisible"
            onClick={cycleColorMode}
          />
          <span className="gh-theme-label">{themeLabel}</span>
        </div>
      </div>
    </header>
  )
}
