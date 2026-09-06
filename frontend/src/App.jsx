import { Route, Routes } from 'react-router-dom'
import { BaseStyles, ThemeProvider } from '@primer/react'
import AppHeader from './components/AppHeader'
import DataAsOfBanner from './components/DataAsOfBanner'
import Explore from './pages/Explore'
import Repositories from './pages/Repositories'
import RepoDetail from './pages/RepoDetail'
import BeginnerFriendly from './pages/BeginnerFriendly'
import Contributors from './pages/Contributors'
import Inactive from './pages/Inactive'
import Insights from './pages/Insights'
import Compare from './pages/Compare'
import Organizations from './pages/Organizations'
import Ingest from './pages/Ingest'
import { useColorMode } from './lib/colorMode'

export default function App() {
  const { colorMode } = useColorMode()
  const primerMode = colorMode === 'light' ? 'day' : colorMode === 'dark' ? 'night' : 'auto'

  return (
    <ThemeProvider colorMode={primerMode} dayScheme="light" nightScheme="dark">
      <BaseStyles>
        <div className="app-shell">
          <AppHeader />
          <DataAsOfBanner />
          <main className="app-main">
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
            </Routes>
          </main>
          <footer className="gh-footer">
            <div className="gh-footer-inner">
              <span>© {new Date().getFullYear()} GitHub OSINT Database</span>
              <span className="muted">PostgreSQL · FastAPI · Primer React</span>
              <span className="muted">Public GitHub data · Advanced SQL analytics</span>
            </div>
          </footer>
        </div>
      </BaseStyles>
    </ThemeProvider>
  )
}
