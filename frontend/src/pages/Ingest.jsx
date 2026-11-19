import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Checkbox,
  FormControl,
  Heading,
  ProgressBar,
  Text,
  Textarea,
  TextInput,
} from '@primer/react'
import { SyncIcon } from '@primer/octicons-react'
import { Link as RouterLink } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth/AuthContext'
import { SyncHistoryChart } from '../components/MarketCharts'
import { EmptyState, ErrorState, LoadingState } from '../components/StateBanner'
import { usePageTitle } from '../lib/pageTitle'

const SEARCH_PRESETS = [
  { label: 'Good first issues', query: 'good-first-issues:>5 stars:500..20000' },
  { label: 'Python mid-size', query: 'stars:500..20000 language:python' },
  { label: 'TypeScript mid-size', query: 'stars:500..20000 language:typescript' },
  { label: 'ML topic', query: 'topic:machine-learning stars:500..20000' },
  { label: 'Help wanted', query: 'help-wanted-issues:>5 stars:500..20000' },
]

function formatTs(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return String(value)
  }
}

function isActiveStatus(status) {
  return status === 'queued' || status === 'running'
}

export default function Ingest() {
  usePageTitle('Ingest')
  const { user, loading: authLoading, isAdmin, loginUrl } = useAuth()
  const [status, setStatus] = useState(null)
  const [runs, setRuns] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [activeSyncId, setActiveSyncId] = useState(null)
  const [activeRun, setActiveRun] = useState(null)

  const [useSeed, setUseSeed] = useState(true)
  const [query, setQuery] = useState('')
  const [reposText, setReposText] = useState(
    [
      'firstcontributions/first-contributions',
      'pallets/flask',
      'pallets/click',
      'fastapi/fastapi',
      'encode/httpx',
      'psf/requests',
      'facebook/react',
      'atom/atom',
      'moment/moment',
    ].join('\n'),
  )
  const [limit, setLimit] = useState(12)
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    const [st, sync] = await Promise.all([api.ingestStatus(), api.syncRuns(10)])
    setStatus(st)
    setRuns(sync.items || [])
  }, [])

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false)
      return
    }
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [refresh, isAdmin])

  useEffect(() => {
    if (!activeSyncId) return undefined
    let cancelled = false
    const poll = async () => {
      try {
        const run = await api.syncRun(activeSyncId)
        if (cancelled) return
        setActiveRun(run)
        await refresh()
        if (!isActiveStatus(run.status)) {
          setSubmitting(false)
          setActiveSyncId(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || String(err))
          setSubmitting(false)
          setActiveSyncId(null)
        }
      }
    }
    poll()
    const id = setInterval(poll, 1500)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [activeSyncId, refresh])

  async function startIngest(body) {
    setSubmitting(true)
    setError('')
    setActiveRun(null)
    try {
      const res = await api.ingest(body)
      setActiveSyncId(res.sync_id)
      setActiveRun({
        sync_id: res.sync_id,
        status: res.status || 'queued',
        repos_synced: 0,
        repos_requested: res.repos_requested,
      })
    } catch (err) {
      setError(err.message || String(err))
      setSubmitting(false)
    }
  }

  async function onSubmit(e) {
    e.preventDefault()
    const repos = reposText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    await startIngest({
      use_seed: useSeed,
      limit: Number(limit) || 12,
      query: query.trim() || null,
      repos: repos.length ? repos : null,
    })
  }

  async function onSurprise() {
    await startIngest({ mode: 'surprise', use_seed: false, limit: 5 })
  }

  async function onRefreshAnalytics() {
    setRefreshing(true)
    setError('')
    try {
      await api.refreshAnalytics()
      await refresh()
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setRefreshing(false)
    }
  }

  if (authLoading) return <LoadingState label="Checking access…" />
  if (!user) {
    return (
      <div className="page">
        <EmptyState title="Admin sign-in required" description="Ingest is restricted to operators." />
        <Button as="a" href={loginUrl} variant="primary">Sign in with GitHub</Button>
      </div>
    )
  }
  if (!isAdmin) {
    return (
      <div className="page">
        <EmptyState
          title="Admins only"
          description="Request public repos from the Requests page instead."
          action={
            <Button as={RouterLink} to="/requests" variant="primary" sx={{ mt: 2 }}>
              Request a repository
            </Button>
          }
        />
      </div>
    )
  }
  if (loading) return <LoadingState label="Loading ingest status…" />

  const requested = activeRun?.repos_requested || 0
  const synced = activeRun?.repos_synced || 0
  const progressPct =
    requested > 0 ? Math.min(100, Math.round((synced / requested) * 100)) : submitting ? 5 : 0

  return (
    <div className="page-stack">
      <div className="page-header">
        <Heading as="h1" sx={{ fontSize: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
          <SyncIcon size={24} />
          Ingest
        </Heading>
        <Text as="p" className="muted" sx={{ mt: 1, mb: 0 }}>
          Pull real public GitHub data into Postgres. Set <code>GITHUB_TOKEN</code> in{' '}
          <code>.env</code>, then run ingest here or <code>./scripts/sync_github.sh</code>.
        </Text>
      </div>

      {status && !status.github_token_configured && (
        <div className="banner-warn" role="status">
          No GitHub token configured. Live sync will be rate-limited or fail. Set{' '}
          <code>GITHUB_TOKEN</code> in the project <code>.env</code> and restart the API.
        </div>
      )}

      {status?.github_token_configured && status.token_valid && (
        <div className="banner-ok" role="status">
          GitHub token OK
          {status.authenticated_login ? (
            <>
              {' '}
              (authenticated as <strong>{status.authenticated_login}</strong>)
            </>
          ) : null}
          . Live ingest is available.
          {status.rate_limit_remaining != null ? (
            <>
              {' '}
              API quota: <strong>{status.rate_limit_remaining}</strong>
              {status.rate_limit_limit != null ? ` / ${status.rate_limit_limit}` : ''} remaining
              {status.rate_limit_reset
                ? ` (resets ${formatTs(status.rate_limit_reset)})`
                : ''}
              .            </>
          ) : null}
        </div>
      )}

      {status?.github_token_configured && !status.token_valid && (
        <div className="banner-warn" role="status">
          GitHub token is set but invalid or expired. Update <code>GITHUB_TOKEN</code> in{' '}
          <code>.env</code> and restart the API.
        </div>
      )}

      {(status?.rate_limit_remaining != null && status.rate_limit_remaining < 200) ||
      status?.last_sync_had_rate_limit ? (
        <div className="banner-warn" role="status">
          {status.last_sync_had_rate_limit
            ? 'Last sync hit GitHub rate limits. Wait for reset or reduce batch size.'
            : `GitHub API quota is low (${status.rate_limit_remaining} remaining). Large ingests may pause or fail.`}
        </div>
      ) : null}

      {error && <ErrorState message={error} />}

      {(submitting || activeRun) && (
        <div className="panel">
          <Heading as="h2" sx={{ fontSize: 2, mb: 2 }}>
            Sync progress
          </Heading>
          <Text as="p" className="muted" sx={{ mb: 2 }}>
            Status: <strong>{activeRun?.status || 'queued'}</strong>
            {' · '}
            {synced}/{requested || '…'} repos
            {activeRun?.sync_id ? ` · sync #${activeRun.sync_id}` : ''}
          </Text>
          <ProgressBar progress={progressPct} barSize="default" aria-label="Ingest progress" />
          {activeRun?.error_message && (
            <pre className="code-block" style={{ marginTop: '0.75rem' }}>
              {activeRun.error_message}
            </pre>
          )}
        </div>
      )}

      <form className="ingest-form" onSubmit={onSubmit}>
        <FormControl>
          <Checkbox checked={useSeed} onChange={(e) => setUseSeed(e.target.checked)} />
          <FormControl.Label>Include built-in well-known repo list (live from GitHub)</FormControl.Label>
        </FormControl>

        <FormControl>
          <FormControl.Label>Search query (optional)</FormControl.Label>
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='stars:500..20000 language:python'
            block
          />
          <FormControl.Caption>Click a preset to fill the query.</FormControl.Caption>
        </FormControl>
        <div className="ingest-presets">
          {SEARCH_PRESETS.map((p) => (
            <Button
              key={p.label}
              size="small"
              type="button"
              onClick={() => {
                setQuery(p.query)
                setUseSeed(false)
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>

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

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <Button type="submit" variant="primary" disabled={submitting} leadingVisual={SyncIcon}>
            {submitting ? 'Syncing…' : 'Run ingest'}
          </Button>
          <Button type="button" disabled={submitting} onClick={onSurprise}>
            Surprise me (5 repos)
          </Button>
          <Button type="button" disabled={refreshing || submitting} onClick={onRefreshAnalytics}>
            {refreshing ? 'Refreshing…' : 'Refresh analytics'}
          </Button>
        </div>
      </form>

      <div className="panel">
        <Heading as="h2" sx={{ fontSize: 2, mb: 2 }}>
          Recent sync runs
        </Heading>
        {status?.last_sync && (
          <Text as="p" className="muted" sx={{ mb: 2 }}>
            Latest: {status.last_sync.status || '—'} · {status.last_sync.repos_synced ?? '—'}
            {status.last_sync.repos_requested != null
              ? ` / ${status.last_sync.repos_requested}`
              : ''}{' '}
            repos · {formatTs(status.last_sync.started_at)}
          </Text>
        )}
        {!!runs.length && (
          <div style={{ marginBottom: '1rem' }}>
            <SyncHistoryChart runs={runs} />
          </div>
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
                    <td>
                      {run.repos_synced ?? '—'}
                      {run.repos_requested != null ? ` / ${run.repos_requested}` : ''}
                    </td>
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
