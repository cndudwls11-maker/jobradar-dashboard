import { persistNewJob } from '../collectors/common.js';

const SITES = ['jobkorea', 'saramin', 'linkareer', 'jasoseol'];
const EXCLUDED = /공모전|경진대회|아이디어톤|해커톤|서포터즈|기자단|체험단|봉사자|대외활동|교육생|수강생|광고문의/i;

export function identifyDetail(value, title = '', summary = '') {
  let candidate = value;
  try {
    for (let i = 0; i < 4; i += 1) {
      const outer = new URL(candidate);
      if (!/^https?:$/.test(outer.protocol) || outer.username || outer.password || outer.port) return null;
      const host = outer.hostname.toLowerCase();
      if (/^(?:www\.)?google\.[a-z.]+$/.test(host) && /^\/(?:url|aclk)$/.test(outer.pathname)) {
        candidate = outer.searchParams.get('url') || outer.searchParams.get('q') || outer.searchParams.get('adurl') || '';
        continue;
      }
      const path = outer.pathname;
      let site, id, canonical;
      if (['jobkorea.co.kr', 'www.jobkorea.co.kr', 'm.jobkorea.co.kr'].includes(host)) {
        id = path.match(/^\/Recruit\/GI_Read\/(\d+)\/?$/i)?.[1];
        site = 'jobkorea'; canonical = id && `https://www.jobkorea.co.kr/Recruit/GI_Read/${id}`;
      } else if (['saramin.co.kr', 'www.saramin.co.kr', 'm.saramin.co.kr'].includes(host)) {
        id = /^\/zf_user\/jobs\/(?:view|relay\/view|relay\/recruit-view)\/?$/i.test(path) && outer.searchParams.get('rec_idx');
        if (id && !/^\d+$/.test(id)) id = null;
        site = 'saramin'; canonical = id && `https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=${id}`;
      } else if (['linkareer.com', 'www.linkareer.com'].includes(host)) {
        id = path.match(/^\/activity\/(\d+)\/?$/i)?.[1];
        if (id && (!/채용|인턴|신입|경력직/i.test(`${title} ${summary}`) || EXCLUDED.test(`${title} ${summary}`))) return null;
        site = 'linkareer'; canonical = id && `https://linkareer.com/activity/${id}`;
      } else if (['jasoseol.com', 'www.jasoseol.com'].includes(host)) {
        id = path.match(/^\/(?:recruit|career)\/(\d+)\/?$/i)?.[1];
        site = 'jasoseol'; canonical = id && `https://jasoseol.com/recruit/${id}`;
      }
      if (!id || !canonical || EXCLUDED.test(title)) return null;
      return { site, id: String(id), canonical };
    }
  } catch { /* untrusted or invalid address */ }
  return null;
}

export function parseAlertEntry(entry, receivedAt, prefs) {
  if (!entry || typeof entry.title !== 'string' || typeof entry.summary !== 'string' || typeof entry.original_url !== 'string') return null;
  const title = entry.title.trim().slice(0, 500);
  const summary = entry.summary.trim().slice(0, 2000);
  const detail = identifyDetail(entry.original_url, title, summary);
  if (!title || !detail) return null;
  const text = `${title} ${summary}`;
  const career = text.match(/(?:경력\s*[:：]\s*)?(신입\s*[·/ㆍ,]\s*경력|신입\s*및\s*경력|경력\s*무관|신입|경력\s*\d+\s*년\s*이상|경력)/)?.[1]?.replace(/\s+/g, ' ').trim() || null;
  const deadlineMatch = text.match(/(?:마감일|접수마감|마감)\s*[:：]\s*(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  let deadline = null;
  if (deadlineMatch) {
    const iso = `${deadlineMatch[1]}-${deadlineMatch[2].padStart(2, '0')}-${deadlineMatch[3].padStart(2, '0')}`;
    const date = new Date(`${iso}T00:00:00Z`);
    if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso) deadline = iso;
  }
  const location = text.match(/(?:근무지|근무지역|지역)\s*[:：]\s*([^|,;\n]{2,50})/)?.[1]?.trim() || null;
  const company = title.match(/^\[([^\]]{2,80})\]\s*(?:.+채용|.+모집)/)?.[1] || title.match(/^(.{2,80}?)\s+[-–]\s+.+(?:채용|모집)/)?.[1] || null;
  const roles = parseArray(prefs.roles_json);
  const locations = parseArray(prefs.locations_json);
  const roleTerms = roles.flatMap(role => /품질관리|QC/i.test(role) ? [role, '품질관리', '품질 관리', '품질검사', 'QC'] : /품질보증|QA/i.test(role) ? [role, '품질보증', '품질 보증', 'QA'] : [role]);
  const roleMatch = !roles.length || roleTerms.some(term => text.toLowerCase().includes(term.toLowerCase()));
  const careerMismatch = prefs.career_level === '신입' && career && /경력/.test(career) && !/신입|무관/.test(career);
  const locationMismatch = location && locations.length && !locations.some(item => location.includes(item));
  if (careerMismatch || locationMismatch) return { excluded: true, site: detail.site };
  return {
    site: detail.site,
    job: { source_site: detail.site, source_job_id: detail.id, canonical_url: detail.canonical, company_name: company, job_title: title,
      industry: null, career_requirement: career, education_requirement: null, employment_type: null, work_location: location,
      salary: null, deadline, published_at: null, collected_at: receivedAt, match_status: '조건 확인 필요' },
  };
}

function parseArray(value) { try { const result = JSON.parse(value || '[]'); return Array.isArray(result) ? result : []; } catch { return []; } }

export async function ingestEmail(db, body) {
  if (!body || typeof body.messageId !== 'string' || !body.messageId.trim() || body.messageId.length > 255 || !Array.isArray(body.jobs) || body.jobs.length > 50 || !Number.isFinite(Date.parse(body.receivedAt))) throw new TypeError('메일 형식이 올바르지 않습니다.');
  const previous = await db.prepare('SELECT summary_json FROM email_ingest_messages WHERE message_id=?').bind(body.messageId).first();
  if (previous) return { ...JSON.parse(previous.summary_json), duplicateMessage: true };
  const prefs = await db.prepare('SELECT * FROM preferences WHERE id=1').first();
  if (!prefs) throw new Error('저장된 맞춤 조건을 찾을 수 없습니다.');
  const platforms = Object.fromEntries(SITES.map(site => [site, { newCount: 0, duplicateCount: 0, excludedCount: 0 }]));
  for (const entry of body.jobs) {
    const parsed = parseAlertEntry(entry, new Date(body.receivedAt).toISOString(), prefs);
    if (!parsed) continue;
    if (parsed.excluded) { platforms[parsed.site].excludedCount += 1; continue; }
    const legacy = await db.prepare('SELECT id,is_deleted FROM jobs WHERE source_site=? AND (source_job_id=? OR canonical_url=? OR canonical_url LIKE ? OR canonical_url LIKE ?) LIMIT 1')
      .bind(parsed.site, parsed.job.source_job_id, parsed.job.canonical_url,
        parsed.site === 'saramin' ? `%rec_idx=${parsed.job.source_job_id}&%` : `%/${parsed.job.source_job_id}?%`,
        parsed.site === 'saramin' ? `%rec_idx=${parsed.job.source_job_id}` : `%/${parsed.job.source_job_id}`).first();
    const saved = legacy ? { kind: legacy.is_deleted ? 'deleted' : 'duplicate' } : await persistNewJob(db, parsed.job);
    if (saved.kind === 'new') {
      await db.prepare('UPDATE jobs SET match_status=? WHERE source_site=? AND source_job_id=?').bind(parsed.job.match_status, parsed.site, parsed.job.source_job_id).run();
      platforms[parsed.site].newCount += 1;
    } else platforms[parsed.site].duplicateCount += 1;
  }
  const result = { ok: true, platforms };
  await db.prepare('INSERT OR IGNORE INTO email_ingest_messages(message_id,received_at,summary_json) VALUES(?,?,?)').bind(body.messageId, new Date(body.receivedAt).toISOString(), JSON.stringify(result)).run();
  return result;
}