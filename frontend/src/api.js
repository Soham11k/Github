const API_BASE = import.meta.env.VITE_API_BASE || ''

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    let detail = text || `Request failed: ${res.status}`
    try {
      const parsed = JSON.parse(text)
      if (parsed?.detail) detail = typeof parsed.detail === 'string' ? parsed.detail : JSON.stringify(parsed.detail)
    } catch {
      if (isHtml(text)) detail = `Request failed: ${res.status}`
    }
    throw new Error(detail)
  }
  if (res.status === 204) return null
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return res.json()
  const text = await res.text()
  if (isHtml(text) || ct.includes('text/html')) {
    throw new Error('Repository data is unavailable because the API is not connected.')
  }
  return text
}

function isHtml(text) {
  const trimmed = (text || '').trim().toLowerCase()
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html')
}

export const api = {
  loginUrl: () => `${API_BASE}/api/auth/github/login`,
  me: () => request('/api/me'),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  deleteAccount: () => request('/api/me', { method: 'DELETE' }),

  watchlist: () => request('/api/watchlist'),
  addWatch: (repoId) =>
    request('/api/watchlist', { method: 'POST', body: JSON.stringify({ repo_id: repoId }) }),
  removeWatch: (repoId) => request(`/api/watchlist/${repoId}`, { method: 'DELETE' }),

  myRequests: () => request('/api/requests/mine'),
  requestRepo: (fullName) =>
    request('/api/requests', { method: 'POST', body: JSON.stringify({ full_name: fullName }) }),

  alerts: () => request('/api/alerts'),
  markAlertRead: (id) => request(`/api/alerts/${id}/read`, { method: 'POST' }),

  badgeUrl: (owner, repo) => `${API_BASE}/api/badge/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}.svg`,

  dashboard: () => request('/api/dashboard'),
  repos: (params = {}) => {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v)
    })
    const suffix = qs.toString() ? `?${qs}` : ''
    return request(`/api/repos${suffix}`)
  },
  repo: (id) => request(`/api/repos/${id}`),
  forkTree: (id) => request(`/api/repos/${id}/fork-tree`),
  commitAncestry: (id, params = {}) => {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v)
    })
    const suffix = qs.toString() ? `?${qs}` : ''
    return request(`/api/repos/${id}/commit-ancestry${suffix}`)
  },
  syncRepo: (id) =>
    request(`/api/repos/${id}/sync`, {
      method: 'POST',
    }),
  healthFactors: (id) => request(`/api/repos/${id}/health-factors`),
  activityMonthly: (id) => request(`/api/repos/${id}/activity-monthly`),
  commitHeatmap: (id) => request(`/api/repos/${id}/commit-heatmap`),
  issueFlow: (id) => request(`/api/repos/${id}/issue-flow`),
  healthDistribution: (id) => request(`/api/repos/${id}/health-distribution`),
  marketHealthDistribution: () => request('/api/health-distribution'),
  marketCommitHeatmap: () => request('/api/commit-heatmap'),
  compare: (ids = []) => request(`/api/compare?ids=${ids.join(',')}`),
  orgs: (limit = 50) => request(`/api/orgs?limit=${limit}`),
  org: (id) => request(`/api/orgs/${id}`),
  syncRuns: (limit = 20) => request(`/api/sync-runs?limit=${limit}`),
  syncRun: (id) => request(`/api/sync-runs/${id}`),
  contributors: (limit = 50) => request(`/api/contributors?limit=${limit}`),
  languages: () => request('/api/languages'),
  beginner: (params = {}) => {
    const qs = new URLSearchParams()
    if (typeof params === 'number') qs.set('limit', params)
    else {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') qs.set(k, v)
      })
    }
    const suffix = qs.toString() ? `?${qs}` : ''
    return request(`/api/beginner-friendly${suffix}`)
  },
  inactive: (limit = 50) => request(`/api/inactive?limit=${limit}`),
  ingestStatus: () => request('/api/ingest/status'),
  ingest: (body) =>
    request('/api/ingest', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  refreshAnalytics: () =>
    request('/api/analytics/refresh', {
      method: 'POST',
    }),
}
