import { describe, expect, it } from 'vitest';
import { matchesPreferences, persistNewJob } from '../src/collectors/common.js';
import { collectAll } from '../src/collectors/index.js';
import { normalizeUrl, validateJob, parseList } from '../src/services/validation.js';

const sample = {
  source_site: 'saramin', source_job_id: 'job-1', company_name: '한빛철강', job_title: '품질관리(QC)',
  industry: '철강 제조업', career_requirement: '신입', education_requirement: null,
  employment_type: '정규직', work_location: '충남 천안', salary: null, deadline: null,
  original_url: 'https://www.saramin.co.kr/zf_user/jobs/view?rec_idx=1&utm_source=test#apply',
  published_at: '2026-11-14T00:00:00Z', collected_at: '2026-11-15T00:00:00Z',
};

describe('input normalization', () => {
  it('canonicalizes tracking query and host and strips fragment', () => {
    expect(normalizeUrl(sample.original_url)).toBe('https://saramin.co.kr/zf_user/jobs/view?rec_idx=1');
  });
  it('normalizes a job and preserves missing data as null', () => {
    const job = validateJob(sample);
    expect(job.canonical_url).toBe('https://saramin.co.kr/zf_user/jobs/view?rec_idx=1');
    expect(job.education_requirement).toBeNull();
    expect(job.deadline).toBeNull();
  });
  it('rejects non-HTTPS URL, invalid source, malformed dates, and oversized lists', () => {
    expect(() => normalizeUrl('http://example.com/job')).toThrow();
    expect(() => validateJob({ ...sample, source_site: 'unknown' })).toThrow();
    expect(() => validateJob({ ...sample, deadline: 'not-a-date' })).toThrow();
    expect(() => parseList(Array.from({ length: 51 }, (_, i) => `${i}`), '직무')).toThrow();
  });
});

describe('preference matching', () => {
  const prefs = { industries_json: '["금속 제조업","철강 제조업"]', companies_json: '["다른 기업"]', roles_json: '["품질관리","생산기술"]', career_level: '신입' };
  it('uses OR within group and AND between industry/company, role, and career conditions', () => {
    expect(matchesPreferences({ industry: '철강 제조업', company_name: '한빛철강', job_title: '품질관리(QC)', career_requirement: '신입' }, prefs)).toBe(true);
    expect(matchesPreferences({ industry: '교육', company_name: '다른 기업', job_title: '생산기술', career_requirement: '신입' }, prefs)).toBe(true);
    expect(matchesPreferences({ industry: '철강 제조업', company_name: '한빛철강', job_title: '영업', career_requirement: '신입' }, prefs)).toBe(false);
    expect(matchesPreferences({ industry: '철강 제조업', company_name: '한빛철강', job_title: '품질관리', career_requirement: '경력' }, prefs)).toBe(false);
  });
  it('allows unknown career detail rather than silently discarding a matching posting', () => {
    expect(matchesPreferences({ industry: '철강 제조업', company_name: '한빛철강', job_title: '품질관리', career_requirement: null }, prefs)).toBe(true);
  });
});

describe('persistent ingestion semantics', () => {
  it('does not restore or reset a deleted duplicate and reports duplicate/deleted separately', async () => {
    const calls = [];
    const db = { prepare(sql) { return { bind(...values) { calls.push({ sql, values }); return {
      async first() { return { id: 7, is_deleted: 1 }; },
      async run() { throw new Error('insert should not occur for existing deleted job'); },
    }; } }; } };
    const job = validateJob(sample);
    expect(await persistNewJob(db, job)).toEqual({ kind: 'deleted', id: 7 });
    expect(calls).toHaveLength(1);
  });
  it('runs each collector independently and labels unavailable sites unconnected, not successful', async () => {
    const results = await collectAll({}, {});
    expect(results).toHaveLength(4);
    expect(results.every((result) => result.status === 'unconnected')).toBe(true);
    expect(results.every((result) => result.jobs.length === 0)).toBe(true);
  });
});