import { Component, Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import { BaseStyles, ThemeProvider } from '@primer/react'
import AppHeader from './components/AppHeader'
import DataAsOfBanner from './components/DataAsOfBanner'
import { AuthProvider } from './auth/AuthContext'
import { APP_DISCLAIMER, APP_NAME } from './brand'
import { ErrorState, LoadingState } from './components/StateBanner'

class PageErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError() {
    return { error: true }
  }

  render() {
    if (this.state.error) {
      return <ErrorState message="This page failed to load." />
    }
    return this.props.children
  }
}
import { useColorMode } from './lib/colorMode'

const Explore = lazy(() => import('./pages/Explore'))
const Repositories = lazy(() => import('./pages/Repositories'))
const RepoDetail = lazy(() => import('./pages/RepoDetail'))
const BeginnerFriendly = lazy(() => import('./pages/BeginnerFriendly'))
const Contributors = lazy(() => import('./pages/Contributors'))
const Inactive = lazy(() => import('./pages/Inactive'))
const Insights = lazy(() => import('./pages/Insights'))
const Compare = lazy(() => import('./pages/Compare'))
const Organizations = lazy(() => import('./pages/Organizations'))
const Ingest = lazy(() => import('./pages/Ingest'))
const Watchlist = lazy(() => import('./pages/Watchlist'))
const Requests = lazy(() => import('./pages/Requests'))
const Alerts = lazy(() => import('./pages/Alerts'))
const About = lazy(() => import('./pages/About'))
const Privacy = lazy(() => import('./pages/Privacy'))
const Terms = lazy(() => import('./pages/Terms'))

export default function App() {
  const { colorMode } = useColorMode()
  const primerMode = colorMode === 'light' ? 'day' : colorMode === 'dark' ? 'night' : 'auto'

  return (
    <AuthProvider>
      <ThemeProvider colorMode={primerMode} dayScheme="light" nightScheme="dark">
        <BaseStyles>
          <div className="app-shell">
            <AppHeader />
            <DataAsOfBanner />
            <main className="app-main">
              <PageErrorBoundary>
              <Suspense fallback={<LoadingState label="Loading…" />}>
                <Routes>
                  <Route path="/" element={<Explore />} />
                  <Route path="/repos" element={<Repositories />} />
                  <Route path="/repos/:id" element={<RepoDetail />} />
                  <Route path="/compare" element={<Compare />} />
                  <Route path="/orgs" element={<Organizations />} />
                  <Route path="/orgs/:id" element={<Organizations />} />
                  <Route path="/beginner" element={<BeginnerFriendly />} />
                  <Route path="/contributors" element={<Contributors />} />
                  <Route path="/insights" element={<Insights />} />
                  <Route path="/inactive" element={<Inactive />} />
                  <Route path="/ingest" element={<Ingest />} />
                  <Route path="/watchlist" element={<Watchlist />} />
                  <Route path="/requests" element={<Requests />} />
                  <Route path="/alerts" element={<Alerts />} />
                  <Route path="/about" element={<About />} />
                  <Route path="/privacy" element={<Privacy />} />
                  <Route path="/terms" element={<Terms />} />
                </Routes>
              </Suspense>
              </PageErrorBoundary>
            </main>
            <footer className="gh-footer">
              <div className="gh-footer-inner">
                <span>© {new Date().getFullYear()} {APP_NAME}</span>
                <span className="muted">PostgreSQL · FastAPI · Primer React</span>
                <span className="muted">{APP_DISCLAIMER}</span>
                <span className="footer-links">
                  <a href="/about">About</a>
                  <a href="/privacy">Privacy</a>
                  <a href="/terms">Terms</a>
                </span>
              </div>
            </footer>
          </div>
        </BaseStyles>
      </ThemeProvider>
    </AuthProvider>
  )
}
