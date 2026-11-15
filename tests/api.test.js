import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/worker.js';

function fakeDb() {
  const state = { sessions: new Map(), jobs: [], queries: [], preferences: { id: 1, industries_json: '["철강 제조업"]', companies_json: '[]', roles_json: '["품질관리"]', locations_json: '[]', career_level: '신입', updated_at: '2026-11-15T00:00:00Z' }, existingJob: null };
  return {
    state,
    prepare(sql) {
      const statement = { sql, values: [], bind(...values) { this.values = values; return this; },
        async first() {
          state.queries.push({ sql, values: this.values });
          if (sql.includes('FROM admin_sessions')) return state.sessions.get(this.values[0]) || null;
          if (sql.includes('FROM preferences')) return state.preferences;
          if (sql.includes('SELECT id, is_deleted FROM jobs WHERE source_site = ? AND source_job_id = ?')) return state.existingJob;
          if (sql.includes('SELECT id, is_deleted FROM jobs WHERE source_site = ? AND canonical_url = ?')) return state.existingJob;
          if (sql.includes('SELECT COUNT(*) AS total FROM jobs')) { state.queries.push({ sql, values: this.values }); return { total: 0 }; }
          if (sql.includes('COUNT(*) AS total FROM collection_runs')) return { total: 0 };
          return null;
        },
        async all() { state.queries.push({ sql, values: this.values }); return { results: [] }; },
        async run() {
          state.queries.push({ sql, values: this.values });
          if (sql.includes('INSERT INTO admin_sessions')) state.sessions.set(this.values[0], { token_hash: this.values[0], csrf_token: this.values[1], expires_at: this.values[2] });
          if (sql.includes('INSERT OR IGNORE INTO jobs')) state.jobs.push({ source_site: this.values[0], canonical_url: this.values[2], company_name: this.values[3], job_title: this.values[4] });
          return { meta: { changes: 1 } };
        },
      }; return statement;
    },
  };
}

const baseEnv = { ADMIN_USERNAME: 'admin', ADMIN_PASSWORD: 'local-password', SESSION_SECRET: 'test-session-secret-that-is-long-enough-12345' };
let db;
beforeEach(() => { db = fakeDb(); });

async function login() {
  const response = await worker.fetch(new Request('https://jobradar.test/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'local-password' }) }), { ...baseEnv, DB: db });
  const payload = await response.json();
  const cookie = response.headers.get('set-cookie').split(';')[0];
  return { cookie, csrf: payload.csrfToken };
}

describe('Worker API authentication and routes', () => {
  it('requires an authenticated admin for listings and mutation APIs', async () => {
    const response = await worker.fetch(new Request('https://jobradar.test/api/jobs'), { ...baseEnv, DB: db });
    expect(response.status).toBe(401);
    const response2 = await worker.fetch(new Request('https://jobradar.test/api/preferences', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' }), { ...baseEnv, DB: db });
    expect(response2.status).toBe(401);
  });

  it('does not accept a state-changing request without CSRF token', async () => {
    const { cookie } = await login();
    const response = await worker.fetch(new Request('https://jobradar.test/api/preferences', { method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ industries: [], companies: [], roles: [], career_level: '신입' }) }), { ...baseEnv, DB: db });
    expect(response.status).toBe(403);
  });

  it('allows a same-origin CSRF-protected settings update and validates input', async () => {
    const { cookie, csrf } = await login();
    const response = await worker.fetch(new Request('https://jobradar.test/api/preferences', { method: 'PUT', headers: { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: JSON.stringify({ industries: ['철강 제조업'], companies: [], roles: ['품질관리'], locations: ['충청남도','천안시'], career_level: '신입' }) }), { ...baseEnv, DB: db });
    expect(response.status).toBe(200);
    expect(db.state.queries.some(({ sql, values }) => sql.includes('UPDATE preferences') && values.includes('["철강 제조업"]'))).toBe(true);
    expect(db.state.queries.some(({ sql, values }) => sql.includes('locations_json') && values.includes('["충청남도","천안시"]'))).toBe(true);
    const invalidLocations = await worker.fetch(new Request('https://jobradar.test/api/preferences', { method: 'PUT', headers: { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: JSON.stringify({ industries: [], companies: [], roles: [], locations: Array.from({ length: 51 }, (_, i) => `지역${i}`), career_level: '신입' }) }), { ...baseEnv, DB: db });
    expect(invalidLocations.status).toBe(400);
    const invalid = await worker.fetch(new Request('https://jobradar.test/api/preferences', { method: 'PUT', headers: { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: JSON.stringify({ industries: [], companies: [], roles: [], career_level: '관리자' }) }), { ...baseEnv, DB: db });
    expect(invalid.status).toBe(400);
  });

  it('saves a manually reviewed job only with admin CSRF, HTTPS, and matching preferences', async () => {
    const responseAnonymous = await worker.fetch(new Request('https://jobradar.test/api/manual-jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), { ...baseEnv, DB: db });
    expect(responseAnonymous.status).toBe(401);
    const { cookie, csrf } = await login();
    const payload = { source_site: 'jobkorea', source_job_id: null, company_name: '한빛철강', job_title: '품질관리 신입', industry: '철강 제조업', career_requirement: '신입', education_requirement: '초대졸 이상', employment_type: '정규직', work_location: '충남 천안', salary: '연봉 3,800만원', deadline: '2026-12-31', original_url: 'https://www.jobkorea.co.kr/Recruit/GI_Read/123456' };
    const noCsrf = await worker.fetch(new Request('https://jobradar.test/api/manual-jobs', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }), { ...baseEnv, DB: db });
    expect(noCsrf.status).toBe(403);
    const saved = await worker.fetch(new Request('https://jobradar.test/api/manual-jobs', { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }), { ...baseEnv, DB: db });
    expect(saved.status).toBe(201);
    expect(db.state.jobs).toHaveLength(1);
    const insecure = await worker.fetch(new Request('https://jobradar.test/api/manual-jobs', { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, original_url: 'http://www.jobkorea.co.kr/job' }) }), { ...baseEnv, DB: db });
    expect(insecure.status).toBe(400);
    const mismatch = await worker.fetch(new Request('https://jobradar.test/api/manual-jobs', { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, job_title: '해외영업', industry: '서비스' }) }), { ...baseEnv, DB: db });
    expect(mismatch.status).toBe(422);
    db.state.existingJob = { id: 5, is_deleted: 1 };
    const deleted = await worker.fetch(new Request('https://jobradar.test/api/manual-jobs', { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }), { ...baseEnv, DB: db });
    expect(deleted.status).toBe(409);
  });

  it('manual collection records four real unconnected adapter results and does not fake jobs', async () => {
    const { cookie, csrf } = await login();
    const response = await worker.fetch(new Request('https://jobradar.test/api/collections', { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: '{}' }), { ...baseEnv, DB: db });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.newCount).toBe(0);
    expect(result.sites).toHaveLength(4);
    expect(result.sites.every((site) => site.status === 'unconnected')).toBe(true);
    expect(db.state.queries.some(({ sql }) => sql.includes('INSERT INTO collection_sites'))).toBe(true);
  });

  it('applies default expiry filtering while keeping favorites query available', async () => {
    const { cookie } = await login();
    await worker.fetch(new Request('https://jobradar.test/api/jobs?mode=all', { headers: { Cookie: cookie } }), { ...baseEnv, DB: db });
    const allQuery = db.state.queries.find(({ sql }) => sql.includes('FROM jobs WHERE'));
    expect(allQuery.sql).toContain('deadline IS NULL OR deadline >= date');
    await worker.fetch(new Request('https://jobradar.test/api/jobs?mode=favorites', { headers: { Cookie: cookie } }), { ...baseEnv, DB: db });
    const favoriteQuery = db.state.queries.filter(({ sql }) => sql.includes('FROM jobs WHERE')).at(-1);
    expect(favoriteQuery.sql).toContain('is_favorite = 1');
  });

  it('reports safe generic server errors and health endpoint is public', async () => {
    const healthy = await worker.fetch(new Request('https://jobradar.test/api/health'), { DB: db });
    expect((await healthy.json()).collectionMode).toBe('manual-only');
    const secured = await worker.fetch(new Request('https://jobradar.test/api/jobs'), { DB: db });
    expect(secured.status).toBe(401);
  });
});