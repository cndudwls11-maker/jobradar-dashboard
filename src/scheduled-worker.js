import { collectAll } from './collectors/index.js';
import { matchesPreferences, persistNewJob } from './collectors/common.js';
import { validateJob } from './services/validation.js';

export async function runScheduledCollection(env) {
  const SITE_MAX = 10;
  const GLOBAL_MAX = 30;
  const db = env.DB;
  const prefs = await getPreferences(db);
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  await db.prepare("INSERT INTO collection_runs(id,started_at,status) VALUES(?,?,'running')").bind(runId, startedAt).run();
  const results = await collectAll(prefs, env);
  let newCount = 0;
  let duplicateCount = 0;
  let deletedExcludedCount = 0;
  let excludedCount = 0;
  let errorCount = 0;
  const sites = [];

  for (const result of results) {
    let siteAccepted = 0;
    let siteNew = 0;
    let siteDuplicate = 0;
    let siteDeleted = 0;
    let siteExcluded = 0;
    if (result.status === 'failed') errorCount += 1;
    for (const raw of result.jobs || []) {
      if (siteAccepted >= SITE_MAX) { siteExcluded += 1; excludedCount += 1; continue; }
      try {
        const job = validateJob(raw);
        if (!matchesPreferences(job, prefs)) {
          excludedCount += 1;
          siteExcluded += 1;
          continue;
        }
        const stored = await persistNewJob(db, job);
        if (stored.kind === 'new') {
          if (siteNew >= SITE_MAX || (newCount + duplicateCount + deletedExcludedCount + excludedCount) >= GLOBAL_MAX) { excludedCount += 1; siteExcluded += 1; continue; }
          newCount += 1; siteNew += 1; siteAccepted += 1;
        }
        else if (stored.kind === 'deleted') { deletedExcludedCount += 1; siteDeleted += 1; }
        else { duplicateCount += 1; siteDuplicate += 1; siteAccepted += 1; }
      } catch (error) {
        errorCount += 1;
        result.error = [result.error, error instanceof Error ? error.message : '공고 처리 오류'].filter(Boolean).join(' | ');
      }
    }
    await db.prepare(`INSERT INTO collection_sites(run_id,source_site,status,discovered_count,new_count,duplicate_count,deleted_excluded_count,excluded_count,error_message) VALUES(?,?,?,?,?,?,?,?,?)`)
      .bind(runId, result.site.id, result.status, (result.jobs || []).length, siteNew, siteDuplicate, siteDeleted, siteExcluded, result.error || null).run();
    sites.push({ id: result.site.id, name: result.site.name, status: result.status, newCount: siteNew, duplicateCount: siteDuplicate, deletedExcludedCount: siteDeleted, excludedCount: siteExcluded, error: result.error || null });
  }

  const status = errorCount > 0 ? (newCount + duplicateCount + deletedExcludedCount + excludedCount > 0 ? 'partial' : 'failed') : 'completed';
  const summary = { trigger: 'scheduled', newCount, duplicateCount, deletedExcludedCount, excludedCount, errorCount, sites };
  await db.prepare("UPDATE collection_runs SET finished_at=?,status=?,new_count=?,duplicate_count=?,deleted_excluded_count=?,excluded_count=?,error_count=?,summary_json=? WHERE id=?")
    .bind(new Date().toISOString(), status, newCount, duplicateCount, deletedExcludedCount, excludedCount, errorCount, JSON.stringify(summary), runId).run();
  return { id: runId, status, ...summary };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/' || url.pathname === '/health') {
      return Response.json({ ok: true, service: 'jobradar-daily-collection', schedule: '0 0 * * *', timezone: 'UTC (09:00 Asia/Seoul)', mode: 'approved-sources-only' });
    }
    return Response.json({ error: 'Not found' }, { status: 404 });
  },
  async scheduled(_controller, env, _ctx) {
    const result = await runScheduledCollection(env);
    console.log(JSON.stringify({ event: 'scheduled-collection-finished', ...result }));
  },
};

async function getPreferences(db) {
  const prefs = await db.prepare('SELECT * FROM preferences WHERE id=1').first();
  return { ...prefs, industries: JSON.parse(prefs.industries_json), companies: JSON.parse(prefs.companies_json), roles: JSON.parse(prefs.roles_json), locations: JSON.parse(prefs.locations_json || '[]') };
}