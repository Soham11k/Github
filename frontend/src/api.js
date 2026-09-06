const API_BASE = import.meta.env.VITE_API_BASE || ''

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, options)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Request failed: ${res.status}`)
  }
  return res.json()
}

export const api = {
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
  syncRepo: (id, adminToken) =>
    request(`/api/repos/${id}/sync`, {
      method: 'POST',
      headers: { 'X-Admin-Token': adminToken || '' },
    }),
  healthFactors: (id) => request(`/api/repos/${id}/health-factors`),
  activityMonthly: (id) => request(`/api/repos/${id}/activity-monthly`),
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
  ingest: (body, adminToken) =>
    request('/api/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': adminToken || '',
      },
      body: JSON.stringify(body),
    }),
  refreshAnalytics: (adminToken) =>
    request('/api/analytics/refresh', {
      method: 'POST',
      headers: { 'X-Admin-Token': adminToken || '' },
    }),
}
