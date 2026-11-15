export const COLLECTOR_REGISTRY = [
  { id: 'saramin', name: '사람인', docs: 'https://oapi.saramin.co.kr/', requiresApproval: true },
  { id: 'jobkorea', name: '잡코리아', docs: 'https://www.jobkorea.co.kr/robots.txt', requiresApproval: true },
  { id: 'incruit', name: '인크루트', docs: 'https://www.incruit.com/robots.txt', requiresApproval: true },
  { id: 'jasoseol', name: '자소설닷컴', docs: 'https://jasoseol.com/robots.txt', requiresApproval: true },
];

export async function findExisting(db, job) {
  if (job.source_job_id) {
    const byId = await db.prepare('SELECT id, is_deleted FROM jobs WHERE source_site = ? AND source_job_id = ?')
      .bind(job.source_site, job.source_job_id).first();
    if (byId) return byId;
  }
  return db.prepare('SELECT id, is_deleted FROM jobs WHERE source_site = ? AND canonical_url = ?')
    .bind(job.source_site, job.canonical_url).first();
}

export async function persistNewJob(db, job) {
  const existing = await findExisting(db, job);
  if (existing) return { kind: existing.is_deleted ? 'deleted' : 'duplicate', id: existing.id };
  const result = await db.prepare(`
    INSERT OR IGNORE INTO jobs (
      source_site, source_job_id, canonical_url, company_name, job_title, industry,
      career_requirement, education_requirement, employment_type, work_location,
      salary, deadline, published_at, collected_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    job.source_site, job.source_job_id, job.canonical_url, job.company_name, job.job_title,
    job.industry, job.career_requirement, job.education_requirement, job.employment_type,
    job.work_location, job.salary, job.deadline, job.published_at, job.collected_at,
  ).run();
  return result.meta?.changes ? { kind: 'new' } : { kind: 'duplicate' };
}

export function matchesPreferences(job, prefs) {
  const industries = safeArray(prefs.industries_json);
  const companies = safeArray(prefs.companies_json);
  const roles = safeArray(prefs.roles_json);
  const hasIndustryCompany = industries.length > 0 || companies.length > 0;
  const industryOrCompanyMatches = !hasIndustryCompany ||
    industries.some((value) => contains(job.industry, value)) ||
    companies.some((value) => contains(job.company_name, value));
  const roleMatches = roles.length === 0 || roles.some((value) =>
    contains(job.job_title, value) || contains(job.industry, value));
  const careerMatches = !prefs.career_level || prefs.career_level === '전체' ||
    !job.career_requirement || job.career_requirement.includes(prefs.career_level) ||
    (prefs.career_level === '신입/경력' && /신입|경력/.test(job.career_requirement));
  return industryOrCompanyMatches && roleMatches && careerMatches;
}

function contains(value, needle) {
  return typeof value === 'string' && value.toLocaleLowerCase('ko').includes(needle.toLocaleLowerCase('ko'));
}

function safeArray(value) {
  try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}