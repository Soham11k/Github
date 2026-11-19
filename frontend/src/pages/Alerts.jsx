import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Button, Heading, Label } from '@primer/react'
import { api } from '../api'
import { useAuth } from '../auth/AuthContext'
import { EmptyState, ErrorState, LoadingState } from '../components/StateBanner'
import { usePageTitle } from '../lib/pageTitle'

const KIND_LABEL = {
  health_drop: 'Health drop',
  newly_abandoned: 'Newly abandoned',
  beginner_issues: 'New beginner issues',
}

export default function Alerts() {
  usePageTitle('Alerts')
  const { user, loginUrl, refresh } = useAuth()
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    api.alerts()
      .then((data) => setItems(data.items || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (user) load()
    else setLoading(false)
  }, [user])

  async function markRead(id) {
    await api.markAlertRead(id)
    load()
    refresh()
  }

  if (!user) {
    return (
      <div className="page">
        <EmptyState title="Sign in to see alerts" />
        <Button as="a" href={loginUrl} variant="primary">Sign in with GitHub</Button>
      </div>
    )
  }
  if (loading) return <LoadingState label="Loading alerts…" />
  if (error) return <ErrorState message={error} />

  return (
    <div className="page">
      <div className="page-head">
        <Heading as="h1">Alerts</Heading>
        <p className="muted">In-app notices when watched repositories change.</p>
      </div>
      {!items.length ? (
        <EmptyState title="No alerts yet" description="Watch a repo to get health and abandonment notices." />
      ) : (
        <ul className="repo-list">
          {items.map((a) => (
            <li key={a.alert_id} className={`repo-list-row${a.read_at ? '' : ' is-unread'}`}>
              <div>
                <div>
                  <Label>{KIND_LABEL[a.kind] || a.kind}</Label>{' '}
                  {a.repo_id ? (
                    <RouterLink to={`/repos/${a.repo_id}`}>{a.full_name || 'Repository'}</RouterLink>
                  ) : (
                    <span>{a.details?.full_name || 'Repository'}</span>
                  )}
                </div>
                <div className="muted small">{new Date(a.created_at).toLocaleString()}</div>
              </div>
              {!a.read_at && (
                <Button size="small" onClick={() => markRead(a.alert_id).catch((e) => setError(e.message))}>
                  Mark read
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
