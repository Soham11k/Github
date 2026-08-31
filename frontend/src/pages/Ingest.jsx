import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Checkbox,
  FormControl,
  Heading,
  Text,
  Textarea,
  TextInput,
} from '@primer/react'
import { SyncIcon } from '@primer/octicons-react'
import { api } from '../api'
import { ErrorState, LoadingState } from '../components/StateBanner'

const TOKEN_KEY = 'osint_admin_token'

function formatTs(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return String(value)
  }
}

export default function Ingest() {
  const [status, setStatus] = useState(null)
  const [runs, setRuns] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  const [adminToken, setAdminToken] = useState(
    () => sessionStorage.getItem(TOKEN_KEY) || 'changeme',
  )
  const [useSeed, setUseSeed] = useState(true)
  const [query, setQuery] = useState('')
  const [reposText, setReposText] = useState('pallets/flask\npallets/click')
  const [limit, setLimit] = useState(10)

  const refresh = useCallback(async () => {
    const [st, sync] = await Promise.all([api.ingestStatus(), api.syncRuns(10)])
    setStatus(st)
    setRuns(sync.items || [])
  }, [])

  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [refresh])

  useEffect(() => {
    sessionStorage.setItem(TOKEN_KEY, adminToken)
  }, [adminToken])

  async function onSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    setResult(null)
    try {
      const repos = reposText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
      const body = {
        use_seed: useSeed,
        limit: Number(limit) || 10,
        query: query.trim() || null,
        repos: repos.length ? repos : null,
      }
      const res = await api.ingest(body, adminToken)
      setResult(res)
      await refresh()
      // Poll a few times for latest sync history
      for (let i = 0; i < 4; i += 1) {
        await new Promise((r) => setTimeout(r, 1500))
        await refresh()
      }
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <LoadingState label="Loading ingest status…" />

  return (
    <div className="page-stack">
      <div className="page-header">
        <Heading as="h1" sx={{ fontSize: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
          <SyncIcon size={24} />
          Ingest
        </Heading>
        <Text as="p" className="muted" sx={{ mt: 1, mb: 0 }}>
          Pull public GitHub data into Postgres. Requires admin token; live sync needs{' '}
          <code>GITHUB_TOKEN</code> in <code>.env</code>.
        </Text>
      </div>

      {status && !status.github_token_configured && (
        <div className="banner-warn" role="status">
          No GitHub token configured. Offline seed mode still works; live API sync will be
          rate-limited or fail. Set <code>GITHUB_TOKEN</code> in the project <code>.env</code> and
          restart the API.
        </div>
      )}

      {status?.github_token_configured && (
        <div className="banner-ok" role="status">
          GitHub token is configured. Live ingest is available.
        </div>
      )}

      {error && <ErrorState message={error} />}

      <form className="ingest-form" onSubmit={onSubmit}>
        <FormControl>
          <FormControl.Label>Admin token</FormControl.Label>
          <TextInput
            type="password"
            value={adminToken}
            onChange={(e) => setAdminToken(e.target.value)}
            placeholder="changeme"
            block
            autoComplete="off"
          />
          <FormControl.Caption>Stored in sessionStorage only. Default is changeme.</FormControl.Caption>
        </FormControl>

        <FormControl>
          <Checkbox checked={useSeed} onChange={(e) => setUseSeed(e.target.checked)} />
          <FormControl.Label>Include built-in seed repo list</FormControl.Label>
        </FormControl>

        <FormControl>
          <FormControl.Label>Search query (optional)</FormControl.Label>
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='stars:>20000 language:python'
            block
          />
        </FormControl>

        <FormControl>
          <FormControl.Label>Repos (owner/repo, one per line)</FormControl.Label>
          <Textarea
            value={reposText}
            onChange={(e) => setReposText(e.target.value)}
            rows={5}
            block
          />
        </FormControl>

        <FormControl>
          <FormControl.Label>Limit</FormControl.Label>
          <TextInput
            type="number"
            min={1}
            max={50}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            sx={{ maxWidth: 120 }}
          />
        </FormControl>

        <Button type="submit" variant="primary" disabled={submitting} leadingVisual={SyncIcon}>
          {submitting ? 'Syncing…' : 'Run ingest'}
        </Button>
      </form>

      {result && (
        <div className="panel">
          <Heading as="h2" sx={{ fontSize: 2, mb: 2 }}>
            Last run result
          </Heading>
          <pre className="code-block">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}

      <div className="panel">
        <Heading as="h2" sx={{ fontSize: 2, mb: 2 }}>
          Recent sync runs
        </Heading>
        {status?.last_sync && (
          <Text as="p" className="muted" sx={{ mb: 2 }}>
            Latest: {status.last_sync.status || '—'} · repos_synced{' '}
            {status.last_sync.repos_synced ?? '—'} · {formatTs(status.last_sync.started_at)}
          </Text>
        )}
        {!runs.length && <Text className="muted">No sync runs yet.</Text>}
        {!!runs.length && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Status</th>
                  <th>Repos</th>
                  <th>Errors</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.sync_id || run.started_at}>
                    <td>{formatTs(run.started_at)}</td>
                    <td>{run.status || '—'}</td>
                    <td>{run.repos_synced ?? '—'}</td>
                    <td className="muted">{run.error_message || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
