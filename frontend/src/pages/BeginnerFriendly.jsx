import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { FormControl, Heading, Label, Link, Select, Text } from '@primer/react'
import { LightBulbIcon } from '@primer/octicons-react'
import { api } from '../api'
import RepoListItem from '../components/RepoListItem'
import { EmptyState, ErrorState, LoadingState } from '../components/StateBanner'

export default function BeginnerFriendly() {
  const [items, setItems] = useState([])
  const [languages, setLanguages] = useState([])
  const [language, setLanguage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.languages()
      .then((d) => setLanguages((d.items || []).slice(0, 40)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    setError('')
    api.beginner({ limit: 50, language: language || undefined })
      .then((d) => setItems(d.items || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [language])

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

      <div className="panel" style={{ marginBottom: '1rem', padding: '0.75rem 1rem' }}>
        <FormControl>
          <FormControl.Label>Language</FormControl.Label>
          <Select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            style={{ maxWidth: 280 }}
          >
            <Select.Option value="">All languages</Select.Option>
            {languages.map((l) => (
              <Select.Option key={l.language_name} value={l.language_name}>
                {l.language_name}
              </Select.Option>
            ))}
          </Select>
        </FormControl>
      </div>

      {error && <ErrorState message={error} />}
      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState
          title="No beginner-friendly repos yet"
          description="Ingest repos with good-first-issue labels (try firstcontributions/first-contributions or scikit-learn/scikit-learn)."
          icon={LightBulbIcon}
          action={
            <Link as={RouterLink} to="/ingest" sx={{ mt: 2, display: 'inline-block' }}>
              Open Ingest
            </Link>
          }
        />
      ) : (
        <div className="panel">
          <div className="panel-head">
            <span><strong>{items.length}</strong> repositories</span>
            <Link as={RouterLink} to="/repos?filter=beginner">Open in search</Link>
          </div>
          <div className="repo-list">
            {items.map((r) => (
              <div key={r.repo_id}>
                <RepoListItem repo={r} />
                {!!r.sample_issues?.length && (
                  <ul className="beginner-issue-list">
                    {r.sample_issues.map((iss) => (
                      <li key={iss.issue_id || iss.number}>
                        <a href={iss.html_url} target="_blank" rel="noreferrer">
                          #{iss.number} {iss.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
