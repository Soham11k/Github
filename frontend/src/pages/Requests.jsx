import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Button, FormControl, Heading, Label, TextInput } from '@primer/react'
import { api } from '../api'
import { useAuth } from '../auth/AuthContext'
import { EmptyState, ErrorState, LoadingState } from '../components/StateBanner'
import { usePageTitle } from '../lib/pageTitle'

export default function Requests() {
  usePageTitle('Requests')
  const { user, loginUrl } = useAuth()
  const [items, setItems] = useState([])
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const load = () => {
    setLoading(true)
    api.myRequests()
      .then((data) => setItems(data.items || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    const prefill = sessionStorage.getItem('reposcope_request_prefill')
    if (prefill) {
      setFullName(prefill)
      sessionStorage.removeItem('reposcope_request_prefill')
    }
  }, [])

  useEffect(() => {
    if (user) load()
    else setLoading(false)
  }, [user])

  useEffect(() => {
    if (!user) return undefined
    const hasActive = items.some((i) => i.status === 'queued' || i.status === 'running')
    if (!hasActive) return undefined
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [user, items])

  async function onSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    setMessage('')
    try {
      const res = await api.requestRepo(fullName.trim())
      setMessage(res.message || 'Queued')
      setFullName('')
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!user) {
    return (
      <div className="page">
        <EmptyState
          title="Sign in to request repositories"
          description="Ask RepoScope to ingest a public GitHub repo (5 per day)."
        />
        <Button as="a" href={loginUrl} variant="primary">Sign in with GitHub</Button>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <Heading as="h1">Request a repository</Heading>
        <p className="muted">Public GitHub repos only. Limit 5 requests per day.</p>
      </div>

      <form className="panel request-form" onSubmit={onSubmit}>
        <FormControl>
          <FormControl.Label>owner/name</FormControl.Label>
          <TextInput
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="facebook/react"
            block
          />
        </FormControl>
        <Button type="submit" variant="primary" disabled={submitting || !fullName.trim()}>
          {submitting ? 'Submitting…' : 'Request ingest'}
        </Button>
      </form>

      {message && <p className="ok-msg">{message}</p>}
      {error && <ErrorState message={error} />}
      {loading ? (
        <LoadingState label="Loading requests…" />
      ) : !items.length ? (
        <EmptyState title="No requests yet" />
      ) : (
        <ul className="repo-list">
          {items.map((r) => (
            <li key={r.request_id} className="repo-list-row">
              <div>
                <strong>{r.full_name}</strong>
                <div className="muted small">
                  {new Date(r.requested_at).toLocaleString()}
                  {r.error_message ? ` · ${r.error_message}` : ''}
                </div>
              </div>
              <div className="row-actions">
                <Label variant={r.status === 'done' ? 'success' : r.status === 'failed' ? 'danger' : 'attention'}>
                  {r.status}
                </Label>
                {r.repo_id && (
                  <Button as={RouterLink} to={`/repos/${r.repo_id}`} size="small">
                    Open
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
