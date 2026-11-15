export const SITES = ['saramin', 'jobkorea', 'incruit', 'jasoseol', 'linkareer'];
export const CAREER_LEVELS = ['신입', '경력', '신입/경력', '전체'];

export function normalizeUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('원본 URL은 HTTPS여야 합니다.');
  url.hash = '';
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_.+|fbclid|gclid|ref|tracking)$/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString();
}

export function validateJob(job) {
  if (!job || typeof job !== 'object' || !SITES.includes(job.source_site)) throw new Error('공고 출처가 올바르지 않습니다.');
  if (typeof job.original_url !== 'string' || job.original_url.length > 2048) throw new Error('원문 URL이 올바르지 않습니다.');
  const url = new URL(job.original_url);
  if (!url.hostname || !url.protocol.startsWith('https:')) throw new Error('원문 URL은 HTTPS여야 합니다.');
  return {
    source_site: job.source_site,
    source_job_id: clean(job.source_job_id, 200),
    canonical_url: normalizeUrl(job.original_url),
    company_name: clean(job.company_name, 300),
    job_title: clean(job.job_title, 500),
    industry: clean(job.industry, 200),
    career_requirement: clean(job.career_requirement, 200),
    education_requirement: clean(job.education_requirement, 200),
    employment_type: clean(job.employment_type, 100),
    work_location: clean(job.work_location, 300),
    salary: clean(job.salary, 200),
    deadline: isoDate(job.deadline),
    published_at: isoDateTime(job.published_at),
    collected_at: isoDateTime(job.collected_at) || new Date().toISOString(),
  };
}

export function validateManualJob(input) {
  const job = validateJob(input);
  if (!job.company_name || !job.job_title) throw new Error('회사명과 공고 제목은 필수입니다.');
  return job;
}

function clean(value, max) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error('문자열 필드가 올바르지 않습니다.');
  return String(value).trim().slice(0, max) || null;
}

function isoDate(value) {
  if (!value) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new Error('마감일 형식이 올바르지 않습니다.');
  return value;
}

function isoDateTime(value) {
  if (!value) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new Error('날짜 형식이 올바르지 않습니다.');
  return new Date(value).toISOString();
}

export function parseList(value, fieldName) {
  if (!Array.isArray(value) || value.length > 50 || value.some((item) => typeof item !== 'string' || item.length > 100)) {
    throw new Error(`${fieldName}는 문자열 목록(최대 50개)이어야 합니다.`);
  }
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))];
}