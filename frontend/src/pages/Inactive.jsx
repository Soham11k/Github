import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Flash, Heading, Label, Link, Text } from '@primer/react'
import { AlertIcon } from '@primer/octicons-react'
import { api } from '../api'
import RepoListItem from '../components/RepoListItem'
import { EmptyState, ErrorState, LoadingState } from '../components/StateBanner'

export default function Inactive() {
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.inactive(50)
      .then((d) => setItems(d.items || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="page">
      <div className="page-head">
        <Label variant="danger">Collection</Label>
        <Heading as="h1"><AlertIcon /> Unmaintained repositories</Heading>
        <Text as="p" className="muted">
          Flagged by <code>sp_mark_abandoned_repos</code> and exposed through{' '}
          <code>v_inactive_repos</code> — useful before adopting a dependency.
        </Text>
      </div>

      <Flash variant="warning" className="state-flash">
        <AlertIcon /> These projects have little or no push activity in 180+ days, or are marked archived/abandoned.
      </Flash>

      {error && <ErrorState message={error} />}
      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState
          title="No unmaintained repos flagged"
          description="Either your catalog is healthy, or analytics have not been refreshed yet."
          icon={AlertIcon}
        />
      ) : (
        <div className="panel" style={{ marginTop: '1rem' }}>
          <div className="panel-head">
            <span><strong>{items.length}</strong> repositories</span>
            <Link as={RouterLink} to="/repos?filter=abandoned">Open in search</Link>
          </div>
          <div className="repo-list">
            {items.map((r) => (
              <RepoListItem key={r.repo_id} repo={r} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
