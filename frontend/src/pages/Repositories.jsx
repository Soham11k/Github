import { useEffect, useMemo, useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import {
  Button,
  Dialog,
  FormControl,
  Heading,
  Select,
  TextInput,
} from '@primer/react'
import { FilterIcon, SearchIcon } from '@primer/octicons-react'
import { api } from '../api'
import RepoListItem from '../components/RepoListItem'
import { EmptyState, ErrorState, LoadingState } from '../components/StateBanner'
import { compactNumber, healthLabel } from '../lib/format'

export default function Repositories() {
  const [params, setParams] = useSearchParams()
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState(params.get('q') || '')
  const [sort, setSort] = useState(params.get('sort') || 'health')
  const [filter, setFilter] = useState(params.get('filter') || '')
  const [language, setLanguage] = useState(params.get('language') || '')
  const [selected, setSelected] = useState([])
  const [compareOpen, setCompareOpen] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = (overrides = {}) => {
    const query = {
      q: overrides.q ?? q,
      sort: overrides.sort ?? sort,
      filter: overrides.filter ?? filter,
      language: overrides.language ?? language,
      limit: 100,
    }
    setLoading(true)
    setError('')
    const next = new URLSearchParams()
    if (query.q) next.set('q', query.q)
    if (query.sort && query.sort !== 'health') next.set('sort', query.sort)
    if (query.filter) next.set('filter', query.filter)
    if (query.language) next.set('language', query.language)
    setParams(next, { replace: true })

    api.repos(query)
      .then((data) => {
        setItems(data.items || [])
        setTotal(data.total || 0)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleSelect = (repo) => {
    setSelected((prev) => {
      const exists = prev.find((p) => p.repo_id === repo.repo_id)
      if (exists) return prev.filter((p) => p.repo_id !== repo.repo_id)
      if (prev.length >= 3) return prev
      return [...prev, repo]
    })
  }

  const compareRows = useMemo(() => selected, [selected])

  return (
    <div className="page search-layout">
      <div className="page-head">
        <Heading as="h1">Repositories</Heading>
        <p className="muted">
          Search and compare open-source projects the way you would on GitHub — by language,
          health, activity, and beginner-friendliness.
        </p>
      </div>

      <div className="search-grid">
        <aside className="filter-panel panel">
          <Heading as="h2" className="h3"><FilterIcon /> Filters</Heading>
          <FormControl>
            <FormControl.Label>Keywords</FormControl.Label>
            <TextInput
              leadingVisual={SearchIcon}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
              placeholder="name or description"
              block
            />
          </FormControl>
          <FormControl>
            <FormControl.Label>Language</FormControl.Label>
            <TextInput
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="Python, Go, …"
              block
            />
          </FormControl>
          <FormControl>
            <FormControl.Label>Sort</FormControl.Label>
            <Select value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: '100%' }}>
              <Select.Option value="health">Best match (health)</Select.Option>
              <Select.Option value="stars">Most stars</Select.Option>
              <Select.Option value="activity">Recently updated</Select.Option>
              <Select.Option value="name">Name</Select.Option>
            </Select>
          </FormControl>
          <FormControl>
            <FormControl.Label>Status</FormControl.Label>
            <Select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: '100%' }}>
              <Select.Option value="">All repositories</Select.Option>
              <Select.Option value="active">Active</Select.Option>
              <Select.Option value="beginner">Beginner-friendly</Select.Option>
              <Select.Option value="abandoned">Unmaintained</Select.Option>
            </Select>
          </FormControl>
          <Button variant="primary" onClick={() => load()} style={{ width: '100%' }}>
            Apply filters
          </Button>
          {compareRows.length > 0 && (
            <Button
              as={RouterLink}
              to={`/compare?ids=${compareRows.map((r) => r.repo_id).join(',')}`}
              style={{ width: '100%' }}
            >
              Compare ({compareRows.length}/3)
            </Button>
          )}
          {compareRows.length > 0 && (
            <Button onClick={() => setCompareOpen(true)} style={{ width: '100%' }} variant="invisible">
              Quick preview
            </Button>
          )}
        </aside>

        <section className="panel results-panel">
          <div className="panel-head">
            <TextCount total={total} loading={loading} />
          </div>
          {error && <ErrorState message={error} />}
          {loading ? (
            <LoadingState label="Searching repositories…" />
          ) : items.length === 0 ? (
            <EmptyState
              title="No repositories matched"
              description="Try a different language, clear filters, or ingest more repos."
            />
          ) : (
            <div className="repo-list">
              {items.map((r) => (
                <RepoListItem
                  key={r.repo_id}
                  repo={r}
                  selectable
                  selected={!!selected.find((s) => s.repo_id === r.repo_id)}
                  onToggle={toggleSelect}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {compareOpen && (
        <Dialog
          title="Compare repositories"
          subtitle="Side-by-side health and activity signals (up to 3)"
          onClose={() => setCompareOpen(false)}
          footerButtons={[
            { content: 'Close', onClick: () => setCompareOpen(false), buttonType: 'primary' },
          ]}
        >
          <div className="compare-grid">
            {compareRows.map((r) => (
              <div key={r.repo_id} className="compare-card">
                <Heading as="h3" className="h4">
                  <RouterLink to={`/repos/${r.repo_id}`}>{r.full_name}</RouterLink>
                </Heading>
                <dl className="compare-dl">
                  <div><dt>Stars</dt><dd>{compactNumber(r.stars)}</dd></div>
                  <div><dt>Health</dt><dd>{Number(r.health_score).toFixed(0)} · {healthLabel(r.health_score)}</dd></div>
                  <div><dt>Language</dt><dd>{r.language_primary || '—'}</dd></div>
                  <div><dt>Commits 30d</dt><dd>{r.commits_30d ?? '—'}</dd></div>
                  <div><dt>Open issues</dt><dd>{r.open_issues ?? '—'}</dd></div>
                  <div><dt>Contributors</dt><dd>{r.unique_contributors ?? '—'}</dd></div>
                </dl>
              </div>
            ))}
          </div>
        </Dialog>
      )}
    </div>
  )
}

function TextCount({ total, loading }) {
  if (loading) return <span className="muted">Searching…</span>
  return (
    <span>
      <strong>{total.toLocaleString()}</strong> repository result{total === 1 ? '' : 's'}
    </span>
  )
}
