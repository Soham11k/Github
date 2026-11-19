import { useEffect, useRef, useState } from 'react'
import { Link as RouterLink, NavLink, useNavigate } from 'react-router-dom'
import { ActionMenu, ActionList, Avatar, Button, CounterLabel, IconButton, TextInput } from '@primer/react'
import {
  BellIcon,
  MoonIcon,
  SearchIcon,
  SunIcon,
  SyncIcon,
} from '@primer/octicons-react'
import BrandMark from './BrandMark'
import { useAuth } from '../auth/AuthContext'
import { APP_NAME } from '../brand'
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
  const { user, loading, isAdmin, unreadAlerts, loginUrl, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

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

  const navItems = isAdmin
    ? [...NAV, { to: '/ingest', label: 'Ingest' }]
    : NAV

  return (
    <header className="gh-header">
      <div className="gh-header-inner">
        <div className="gh-header-left">
          <RouterLink to="/" className="gh-logo" aria-label={`${APP_NAME} home`}>
            <BrandMark size={32} />
            <span className="gh-brand-text">{APP_NAME}</span>
          </RouterLink>
          <nav className="gh-nav" aria-label="Primary">
            {navItems.map((item) => (
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

          {!loading && user && (
            <IconButton
              icon={BellIcon}
              aria-label="Alerts"
              variant="invisible"
              onClick={() => navigate('/alerts')}
              className="alerts-bell"
            />
          )}
          {!loading && user && unreadAlerts > 0 && (
            <CounterLabel className="alerts-count">{unreadAlerts}</CounterLabel>
          )}

          {!loading && !user && (
            <Button as="a" href={loginUrl} size="small" variant="primary">
              Sign in with GitHub
            </Button>
          )}

          {!loading && user && (
            <ActionMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <ActionMenu.Anchor>
                <Button variant="invisible" size="small" className="user-menu-btn">
                  <Avatar src={user.avatar_url} size={28} alt={user.login} />
                </Button>
              </ActionMenu.Anchor>
              <ActionMenu.Overlay width="medium">
                <ActionList>
                  <ActionList.Group title={`Signed in as ${user.login}`}>
                    <ActionList.Item onSelect={() => navigate('/watchlist')}>Watchlist</ActionList.Item>
                    <ActionList.Item onSelect={() => navigate('/requests')}>Requests</ActionList.Item>
                    <ActionList.Item onSelect={() => navigate('/alerts')}>
                      Alerts
                      {unreadAlerts > 0 ? ` (${unreadAlerts})` : ''}
                    </ActionList.Item>
                  </ActionList.Group>
                  <ActionList.Divider />
                  <ActionList.Item onSelect={() => navigate('/about')}>About</ActionList.Item>
                  <ActionList.Item
                    variant="danger"
                    onSelect={async () => {
                      await logout()
                      navigate('/')
                    }}
                  >
                    Sign out
                  </ActionList.Item>
                </ActionList>
              </ActionMenu.Overlay>
            </ActionMenu>
          )}
        </div>
      </div>
    </header>
  )
}
