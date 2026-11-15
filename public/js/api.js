let csrfToken = null;

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (csrfToken && !['GET', 'HEAD'].includes((options.method || 'GET').toUpperCase())) headers.set('X-CSRF-Token', csrfToken);
  const response = await fetch(`/api${path}`, { credentials: 'same-origin', ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `요청에 실패했습니다 (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return body;
}

export const api = {
  async login(username, password) {
    const result = await request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    csrfToken = result.csrfToken;
    return result;
  },
  async session() {
    const result = await request('/auth/session');
    csrfToken = result.csrfToken;
    return result;
  },
  logout: () => request('/auth/logout', { method: 'POST', body: '{}' }),
  listJobs: (params = {}) => request(`/jobs?${new URLSearchParams(params)}`),
  deletedJobs: (page = 1) => request(`/jobs/deleted?page=${page}`),
  read: (id, value) => request(`/jobs/${id}/read`, { method: 'PATCH', body: JSON.stringify({ value }) }),
  favorite: (id, value) => request(`/jobs/${id}/favorite`, { method: 'PATCH', body: JSON.stringify({ value }) }),
  delete: (id) => request(`/jobs/${id}`, { method: 'DELETE' }),
  bulkDelete: (ids) => request('/jobs/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) }),
  restore: (id) => request(`/jobs/${id}/restore`, { method: 'POST', body: '{}' }),
  bulkRestore: (ids) => request('/jobs/restore', { method: 'POST', body: JSON.stringify({ ids }) }),
  preferences: () => request('/preferences'),
  savePreferences: (value) => request('/preferences', { method: 'PUT', body: JSON.stringify(value) }),
  collect: () => request('/collections', { method: 'POST', body: '{}' }),
  createManualJob: (job) => request('/manual-jobs', { method: 'POST', body: JSON.stringify(job) }),
};