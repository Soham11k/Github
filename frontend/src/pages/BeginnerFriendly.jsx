import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Heading, Label, Link, Text } from '@primer/react'
import { LightBulbIcon } from '@primer/octicons-react'
import { api } from '../api'
import RepoListItem from '../components/RepoListItem'
import { EmptyState, ErrorState, LoadingState } from '../components/StateBanner'

export default function BeginnerFriendly() {
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.beginner(50)
      .then((d) => setItems(d.items || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="page">
      <div className="page-head">
        <Label variant="success">Collection</Label>
        <Heading as="h1"><LightBulbIcon /> Good first issues</Heading>
        <Text as="p" className="muted">
          Active, healthy repositories with <Label size="small" variant="success">good first issue</Label>{' '}
          and <Label size="small" variant="accent">help wanted</Label> labels — curated for students
          and first-time contributors.
        </Text>
      </div>

      {error && <ErrorState message={error} />}
      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState
          title="No beginner-friendly repos yet"
          description="Ingest repositories that use good-first-issue labels, or load the demo seed."
          icon={LightBulbIcon}
        />
      ) : (
        <div className="panel">
          <div className="panel-head">
            <span><strong>{items.length}</strong> repositories</span>
            <Link as={RouterLink} to="/repos?filter=beginner">Open in search</Link>
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
