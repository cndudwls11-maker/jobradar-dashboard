import { Hono } from 'hono';
import { requireAdmin, login, logout, sessionInfo } from '../services/auth.js';
import { CAREER_LEVELS, SITES, parseList, validateManualJob } from '../services/validation.js';
import { collectAll } from '../collectors/index.js';
import { matchesPreferences, persistNewJob } from '../collectors/common.js';

export const api = new Hono();
const PAGE_SIZE = 25;
const SITE_LABELS = { saramin: '사람인', jobkorea: '잡코리아', incruit: '인크루트', jasoseol: '자소설닷컴' };

api.post('/auth/login', login);
api.get('/auth/session', requireAdmin, sessionInfo);
api.post('/auth/logout', requireAdmin, logout);

api.post('/scheduled-collection', async (c) => {
  const expected = c.env.SCHEDULER_TOKEN;
  const authorization = c.req.header('Authorization') || '';
  if (!expected || !constantTimeTokenMatch(authorization, expected)) return c.json({ error: '예약 수집 인증에 실패했습니다.' }, 401);
  return runCollection(c, 'scheduled');
});

api.use('/jobs', requireAdmin);
api.use('/jobs/*', requireAdmin);
api.use('/manual-jobs', requireAdmin);
api.use('/manual-jobs/*', requireAdmin);
api.use('/preferences', requireAdmin);
api.use('/preferences/*', requireAdmin);
api.use('/collections', requireAdmin);
api.use('/collections/*', requireAdmin);

api.get('/jobs', async (c) => {
  const q = (c.req.query('q') || '').trim().slice(0, 200);
  const page = boundedInt(c.req.query('page'), 1, 1, 100000);
  const archived = c.req.query('archived') === 'true';
  const includeExpired = c.req.query('includeExpired') === 'true';
  const mode = c.req.query('mode') || 'all';
  const source = c.req.query('site');
  const career = c.req.query('career');
  const industry = c.req.query('industry');
  const location = c.req.query('location');
  const deadline = c.req.query('deadline');
  const read = c.req.query('read');
  const favorite = c.req.query('favorite');
  const sort = c.req.query('sort') || 'published';
  if (source && !SITES.includes(source)) return c.json({ error: '채용 사이트 필터가 올바르지 않습니다.' }, 400);
  if (career && !CAREER_LEVELS.includes(career)) return c.json({ error: '경력 필터가 올바르지 않습니다.' }, 400);
  if (!['all', 'unread', 'favorites', 'deleted'].includes(mode)) return c.json({ error: '목록 모드가 올바르지 않습니다.' }, 400);

  const where = [`is_deleted = ?`];
  const binds = [archived || mode === 'deleted' ? 1 : 0];
  if (!archived && !includeExpired && mode !== 'deleted') where.push('(deadline IS NULL OR deadline >= date(\'now\'))');
  if (!archived && mode === 'favorites') where.push('is_favorite = 1');
  if (!archived && mode === 'unread') where.push('is_read = 0');
  if (q) { where.push('(company_name LIKE ? OR job_title LIKE ? OR industry LIKE ? OR work_location LIKE ?)'); const like = `%${escapeLike(q)}%`; binds.push(like, like, like, like); }
  if (source) { where.push('source_site = ?'); binds.push(source); }
  if (career) { where.push('career_requirement LIKE ?'); binds.push(`%${escapeLike(career)}%`); }
  if (industry) { where.push('industry LIKE ?'); binds.push(`%${escapeLike(industry)}%`); }
  if (location) { where.push('work_location LIKE ?'); binds.push(`%${escapeLike(location)}%`); }
  if (deadline === 'open') where.push('(deadline IS NULL OR deadline >= date(\'now\'))');
  if (deadline === 'expired') where.push("deadline < date('now')");
  if (read === 'true') where.push('is_read = 1');
  if (read === 'false') where.push('is_read = 0');
  if (favorite === 'true') where.push('is_favorite = 1');
  if (favorite === 'false') where.push('is_favorite = 0');
  const orderBy = { published: 'COALESCE(published_at, created_at) DESC, id DESC', collected: 'collected_at DESC, id DESC', deadline: 'CASE WHEN deadline IS NULL THEN 1 ELSE 0 END, deadline ASC, id DESC', company: 'company_name COLLATE NOCASE ASC, id DESC' }[sort];
  if (!orderBy) return c.json({ error: '정렬 기준이 올바르지 않습니다.' }, 400);
  const clause = where.join(' AND ');
  const [count, rows] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM jobs WHERE ${clause}`).bind(...binds).first(),
    c.env.DB.prepare(`SELECT * FROM jobs WHERE ${clause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`).bind(...binds, PAGE_SIZE, (page - 1) * PAGE_SIZE).all(),
  ]);
  return c.json({ jobs: rows.results.map((job) => formatJob(job)), page, pageSize: PAGE_SIZE, total: count.total, pages: Math.ceil(count.total / PAGE_SIZE) });
});

api.get('/jobs/deleted', async (c) => {
  const page = boundedInt(c.req.query('page'), 1, 1, 100000);
  const result = await c.env.DB.prepare('SELECT * FROM jobs WHERE is_deleted = 1 ORDER BY deleted_at DESC LIMIT ? OFFSET ?')
    .bind(PAGE_SIZE, (page - 1) * PAGE_SIZE).all();
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS total FROM jobs WHERE is_deleted = 1').first();
  return c.json({ jobs: result.results.map(formatJob), page, pageSize: PAGE_SIZE, total: count.total, pages: Math.ceil(count.total / PAGE_SIZE) });
});

api.get('/jobs/:id', async (c) => {
  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: '공고 ID가 올바르지 않습니다.' }, 400);
  const job = await c.env.DB.prepare('SELECT * FROM jobs WHERE id = ?').bind(id).first();
  return job ? c.json(formatJob(job)) : c.json({ error: '공고를 찾을 수 없습니다.' }, 404);
});

api.post('/manual-jobs', async (c) => {
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: '요청 JSON이 올바르지 않습니다.' }, 400); }
  let job;
  try { job = validateManualJob(body); } catch (error) { return c.json({ error: error.message }, 400); }
  const prefs = await getPreferences(c.env.DB);
  if (!matchesPreferences(job, prefs)) return c.json({ error: '공고가 현재 맞춤 조건에 맞지 않습니다. 조건을 변경하거나 내용을 확인하세요.' }, 422);
  let result;
  try { result = await persistNewJob(c.env.DB, job); }
  catch (error) {
    if (String(error?.message || '').includes('UNIQUE constraint')) return c.json({ error: '같은 사이트 공고 ID 또는 원문 URL이 이미 등록되어 있습니다.' }, 409);
    throw error;
  }
  if (result.kind === 'deleted') return c.json({ error: '이 공고는 삭제 이력에 있어 다시 등록하지 않았습니다.' }, 409);
  if (result.kind === 'duplicate') return c.json({ error: '같은 사이트의 공고 URL이 이미 등록되어 있습니다.' }, 409);
  return c.json({ ok: true, id: result.id, message: '브라우저에서 확인한 공고를 저장했습니다.' }, 201);
});

api.patch('/jobs/:id/read', async (c) => setJobFlag(c, 'is_read'));
api.patch('/jobs/:id/favorite', async (c) => setJobFlag(c, 'is_favorite'));

api.delete('/jobs/:id', async (c) => {
  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: '공고 ID가 올바르지 않습니다.' }, 400);
  const result = await c.env.DB.prepare("UPDATE jobs SET is_deleted = 1, deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND is_deleted = 0")
    .bind(id).run();
  return result.meta.changes ? c.json({ ok: true }) : c.json({ error: '공고를 찾을 수 없습니다.' }, 404);
});

api.post('/jobs/bulk-delete', async (c) => bulkSoftDelete(c));
api.post('/jobs/restore', async (c) => bulkRestore(c));
api.post('/jobs/:id/restore', async (c) => bulkRestore(c, parseId(c.req.param('id'))));

api.get('/preferences', async (c) => {
  const prefs = await getPreferences(c.env.DB);
  return c.json(formatPreferences(prefs));
});

api.put('/preferences', async (c) => {
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: '요청 JSON이 올바르지 않습니다.' }, 400); }
  let industries, companies, roles, locations;
  try {
    industries = parseList(body.industries, '산업');
    companies = parseList(body.companies, '기업');
    roles = parseList(body.roles, '직무');
    locations = parseList(body.locations || [], '선호 지역');
  } catch (error) { return c.json({ error: error.message }, 400); }
  if (!CAREER_LEVELS.includes(body.career_level)) return c.json({ error: '경력 조건이 올바르지 않습니다.' }, 400);
  await c.env.DB.prepare(`UPDATE preferences SET industries_json=?, companies_json=?, roles_json=?, locations_json=?, career_level=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=1`)
    .bind(JSON.stringify(industries), JSON.stringify(companies), JSON.stringify(roles), JSON.stringify(locations), body.career_level).run();
  return c.json(formatPreferences(await getPreferences(c.env.DB)));
});

api.post('/collections', collectionRateLimit, async (c) => runCollection(c, 'manual'));
api.get('/collections', async (c) => {
  const page = boundedInt(c.req.query('page'), 1, 1, 100000);
  const [runs, count] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM collection_runs ORDER BY started_at DESC LIMIT ? OFFSET ?').bind(25, (page - 1) * 25).all(),
    c.env.DB.prepare('SELECT COUNT(*) AS total FROM collection_runs').first(),
  ]);
  const siteRows = await c.env.DB.prepare(`SELECT cs.* FROM collection_sites cs JOIN collection_runs cr ON cr.id = cs.run_id ORDER BY cr.started_at DESC, cs.id ASC LIMIT 200`).all();
  const byRun = new Map();
  for (const item of siteRows.results) { if (!byRun.has(item.run_id)) byRun.set(item.run_id, []); byRun.get(item.run_id).push(item); }
  return c.json({ runs: runs.results.map((run) => ({ ...run, trigger: readTrigger(run.summary_json), sites: byRun.get(run.id) || [] })), page, total: count.total, pages: Math.ceil(count.total / 25) });
});

api.get('/collections/:id', async (c) => {
  const id = c.req.param('id');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: '수집 실행 ID가 올바르지 않습니다.' }, 400);
  const run = await c.env.DB.prepare('SELECT * FROM collection_runs WHERE id=?').bind(id).first();
  if (!run) return c.json({ error: '수집 이력을 찾을 수 없습니다.' }, 404);
  const sites = await c.env.DB.prepare('SELECT * FROM collection_sites WHERE run_id=?').bind(id).all();
  return c.json({ ...run, trigger: readTrigger(run.summary_json), sites: sites.results });
});

api.get('/sites', async (c) => c.json({ sites: [
  { id: 'saramin', name: '사람인', status: c.env.SARAMIN_API_KEY ? '미연결' : '미연결', detail: '공식 API access-key 신청 및 승인 필요' },
  { id: 'jobkorea', name: '잡코리아', status: '미연결', detail: 'robots.txt 제한 확인; 공식 API/허가 미확인' },
  { id: 'incruit', name: '인크루트', status: '미연결', detail: 'robots.txt 전체 경로 차단; API/허가 필요' },
  { id: 'jasoseol', name: '자소설닷컴', status: '미연결', detail: '공식 API/자동 수집 및 재사용 허가 미확인' },
] }));

async function setJobFlag(c, field) {
  const id = parseId(c.req.param('id'));
  if (!id) return c.json({ error: '공고 ID가 올바르지 않습니다.' }, 400);
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: '요청 JSON이 올바르지 않습니다.' }, 400); }
  if (typeof body.value !== 'boolean') return c.json({ error: '값은 boolean이어야 합니다.' }, 400);
  const result = await c.env.DB.prepare(`UPDATE jobs SET ${field}=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND is_deleted=0`)
    .bind(Number(body.value), id).run();
  if (!result.meta.changes) return c.json({ error: '공고를 찾을 수 없습니다.' }, 404);
  return c.json({ ok: true, value: body.value });
}

async function bulkSoftDelete(c) {
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: '요청 JSON이 올바르지 않습니다.' }, 400); }
  const ids = validateIds(body.ids);
  if (!ids) return c.json({ error: '공고 ID 목록(1~100개)이 올바르지 않습니다.' }, 400);
  const placeholders = ids.map(() => '?').join(',');
  const result = await c.env.DB.prepare(`UPDATE jobs SET is_deleted=1, deleted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE is_deleted=0 AND id IN (${placeholders})`).bind(...ids).run();
  return c.json({ ok: true, changed: result.meta.changes });
}

async function bulkRestore(c, singleId = null) {
  let ids;
  if (singleId) ids = [singleId];
  else {
    let body;
    try { body = await c.req.json(); } catch { return c.json({ error: '요청 JSON이 올바르지 않습니다.' }, 400); }
    ids = validateIds(body.ids);
    if (!ids) return c.json({ error: '공고 ID 목록(1~100개)이 올바르지 않습니다.' }, 400);
  }
  const placeholders = ids.map(() => '?').join(',');
  const result = await c.env.DB.prepare(`UPDATE jobs SET is_deleted=0, restored_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), deleted_at=NULL, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE is_deleted=1 AND id IN (${placeholders})`).bind(...ids).run();
  return c.json({ ok: true, changed: result.meta.changes });
}

async function runCollection(c, trigger = 'manual') {
  const db = c.env.DB;
  const prefs = await getPreferences(db);
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  await db.prepare("INSERT INTO collection_runs(id,started_at,status) VALUES(?,?,'running')").bind(runId, startedAt).run();
  const results = await collectAll(prefs, c.env);
  let newCount = 0, duplicateCount = 0, deletedExcludedCount = 0, excludedCount = 0, errorCount = 0;
  const details = [];
  for (const result of results) {
    let siteNew = 0, siteDuplicate = 0, siteDeleted = 0, siteExcluded = 0;
    if (result.status === 'failed') errorCount += 1;
    for (const raw of result.jobs || []) {
      try {
        const job = validateJob(raw);
        if (!matchesPreferences(job, prefs)) { excludedCount += 1; siteExcluded += 1; continue; }
        const persisted = await persistNewJob(db, job);
        if (persisted.kind === 'new') { newCount += 1; siteNew += 1; }
        else if (persisted.kind === 'deleted') { deletedExcludedCount += 1; siteDeleted += 1; }
        else { duplicateCount += 1; siteDuplicate += 1; }
      } catch (error) { errorCount += 1; result.error = [result.error, error.message].filter(Boolean).join(' | '); }
    }
    await db.prepare(`INSERT INTO collection_sites(run_id,source_site,status,discovered_count,new_count,duplicate_count,deleted_excluded_count,excluded_count,error_message) VALUES(?,?,?,?,?,?,?,?,?)`)
      .bind(runId, result.site.id, result.status, (result.jobs || []).length, siteNew, siteDuplicate, siteDeleted, siteExcluded, result.error || null).run();
    details.push({ id: result.site.id, name: result.site.name, status: result.status, newCount: siteNew, duplicateCount: siteDuplicate, deletedExcludedCount: siteDeleted, excludedCount: siteExcluded, error: result.error || null });
  }
  const status = errorCount > 0 ? (newCount + duplicateCount + deletedExcludedCount + excludedCount > 0 ? 'partial' : 'failed') : 'completed';
  const summary = { newCount, duplicateCount, deletedExcludedCount, excludedCount, errorCount, trigger, sites: details };
  await db.prepare("UPDATE collection_runs SET finished_at=?,status=?,new_count=?,duplicate_count=?,deleted_excluded_count=?,excluded_count=?,error_count=?,summary_json=? WHERE id=?")
    .bind(new Date().toISOString(), status, newCount, duplicateCount, deletedExcludedCount, excludedCount, errorCount, JSON.stringify(summary), runId).run();
  return c.json({ id: runId, status, ...summary, noResultsHint: newCount === 0 && prefs.industries.length + prefs.companies.length + prefs.roles.length + prefs.locations.length > 0 ? '조건에 맞는 신규 공고가 없거나 연결된 사이트에서 수집하지 못했습니다. 사이트별 상태와 오류를 확인하세요.' : null }, status === 'failed' ? 502 : 200);
}

async function getPreferences(db) {
  const prefs = await db.prepare('SELECT * FROM preferences WHERE id=1').first();
  return { ...prefs, industries: JSON.parse(prefs.industries_json), companies: JSON.parse(prefs.companies_json), roles: JSON.parse(prefs.roles_json), locations: JSON.parse(prefs.locations_json || '[]') };
}

function formatPreferences(prefs) {
  return { industries: JSON.parse(prefs.industries_json), companies: JSON.parse(prefs.companies_json), roles: JSON.parse(prefs.roles_json), locations: JSON.parse(prefs.locations_json || '[]'), career_level: prefs.career_level, updated_at: prefs.updated_at };
}

function formatJob(row) {
  return { ...row, source_name: SITE_LABELS[row.source_site] || row.source_site, is_read: Boolean(row.is_read), is_favorite: Boolean(row.is_favorite), is_deleted: Boolean(row.is_deleted) };
}

function boundedInt(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function validateIds(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) return null;
  const ids = [...new Set(value.map(parseId))];
  return ids.some((id) => id === null) ? null : ids;
}

function escapeLike(value) { return value.replace(/[\\%_]/g, '\\$&'); }

function readTrigger(summaryJson) {
  try { return JSON.parse(summaryJson || '{}').trigger || 'manual'; } catch { return 'manual'; }
}

async function collectionRateLimit(c, next) {
  const session = c.get('session');
  const existing = await c.env.DB.prepare("SELECT 1 AS found FROM collection_runs WHERE started_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-10 seconds') LIMIT 1")
    .first();
  if (existing) return c.json({ error: '수집 요청은 10초에 한 번만 실행할 수 있습니다.' }, 429);
  await next();
}

function constantTimeTokenMatch(header, expected) {
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (provided.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0;
}