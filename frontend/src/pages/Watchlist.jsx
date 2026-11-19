import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Button, Heading, Label } from '@primer/react'
import { api } from '../api'
import { useAuth } from '../auth/AuthContext'
import { EmptyState, ErrorState, LoadingState } from '../components/StateBanner'
import { usePageTitle } from '../lib/pageTitle'

export default function Watchlist() {
  usePageTitle('Watchlist')
  const { user, loginUrl } = useAuth()
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    api.watchlist()
      .then((data) => setItems(data.items || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (user) load()
    else setLoading(false)
  }, [user])

  if (!user) {
    return (
      <div className="page">
        <EmptyState
          title="Sign in to save a watchlist"
          description="Track health changes on repositories you care about."
        />
        <Button as="a" href={loginUrl} variant="primary">Sign in with GitHub</Button>
      </div>
    )
  }
  if (loading) return <LoadingState label="Loading watchlist…" />
  if (error) return <ErrorState message={error} />

  return (
    <div className="page">
      <div className="page-head">
        <Heading as="h1">Watchlist</Heading>
        <p className="muted">Repos you follow. Nightly jobs create alerts when health shifts.</p>
      </div>
      {!items.length ? (
        <EmptyState title="No watched repos yet" description="Open any repository and click Watch." />
      ) : (
        <ul className="repo-list">
          {items.map((r) => (
            <li key={r.repo_id} className="repo-list-row">
              <div>
                <RouterLink to={`/repos/${r.repo_id}`} className="repo-name-link">
                  {r.full_name}
                </RouterLink>
                <div className="muted small">
                  Health {Number(r.health_score).toFixed(0)}
                  {r.is_abandoned ? ' · Abandoned' : ''}
                </div>
              </div>
              <div className="row-actions">
                {r.language_primary && <Label>{r.language_primary}</Label>}
                <Button
                  size="small"
                  onClick={() => api.removeWatch(r.repo_id).then(load).catch((e) => setError(e.message))}
                >
                  Unwatch
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
