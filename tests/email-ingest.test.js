import { describe, expect, it } from 'vitest';
import { identifyDetail, ingestEmail, parseAlertEntry } from '../src/services/email-ingest.js';

const prefs = { roles_json: '["품질관리(QC)"]', locations_json: '[]', career_level: '신입' };
function database() {
  const state = { jobs: [], messages: new Map(), failInsert: false };
  return { state, prepare(sql) { return { values: [], bind(...values) { this.values = values; return this; },
    async first() {
      if (sql.includes('FROM preferences')) return prefs;
      if (sql.includes('FROM email_ingest_messages')) return state.messages.get(this.values[0]) || null;
      if (sql.includes('SELECT id,is_deleted FROM jobs')) return state.jobs.find(j => j.site === this.values[0] && j.id === this.values[1]) || null;
      if (sql.includes('source_job_id = ?')) return state.jobs.find(j => j.site === this.values[0] && j.id === this.values[1]) || null;
      if (sql.includes('canonical_url = ?')) return state.jobs.find(j => j.site === this.values[0] && j.url === this.values[1]) || null;
      return null;
    },
    async run() {
      if (sql.includes('INSERT OR IGNORE INTO jobs')) {
        if (state.failInsert) throw new Error('D1 unavailable');
        state.jobs.push({ site: this.values[0], id: this.values[1], url: this.values[2], is_deleted: 0 });
      }
      if (sql.includes('INSERT OR IGNORE INTO email_ingest_messages')) state.messages.set(this.values[0], { summary_json: this.values[2] });
      return { success: true, meta: { changes: 1 } };
    },
  }; } };
}

describe('authenticated email ingestion', () => {
  it('normalizes actual platform details and rejects company pages, ads and contests', () => {
    expect(identifyDetail('https://www.google.com/url?url=https%3A%2F%2Fm.jobkorea.co.kr%2FRecruit%2FGI_Read%2F48951021%3Fsc%3D226', '품질 채용')).toEqual({ site: 'jobkorea', id: '48951021', canonical: 'https://www.jobkorea.co.kr/Recruit/GI_Read/48951021' });
    expect(identifyDetail('https://www.saramin.co.kr/zf_user/jobs/relay/view?utm_source=x&rec_idx=55234567', '채용').canonical).toContain('rec_idx=55234567');
    expect(identifyDetail('https://linkareer.com/activity/341970', 'QC 품질 채용')?.id).toBe('341970');
    expect(identifyDetail('https://linkareer.com/activity/341970', '품질 아이디어 공모전')).toBeNull();
    expect(identifyDetail('https://linkareer.com/activity/341970', '공모전 운영직원 채용')).toBeNull();
    expect(identifyDetail('https://jasoseol.com/career/107242', '품질관리 채용').canonical).toBe('https://jasoseol.com/recruit/107242');
    expect(identifyDetail('https://www.jobkorea.co.kr/Company/49795566/Recruit', '채용')).toBeNull();
    expect(identifyDetail('https://www.jobkorea.co.kr.evil.example/Recruit/GI_Read/123456', '채용')).toBeNull();
  });
  it('excludes clearly experienced-only postings but keeps unknown information unconfirmed', () => {
    const entry = { original_url: 'https://m.jobkorea.co.kr/Recruit/GI_Read/48951021', title: '품질관리 채용', summary: '경력: 경력 8년 이상, 마감일: 2026-06-08.' };
    expect(parseAlertEntry(entry, '2026-11-15T08:30:00Z', prefs).excluded).toBe(true);
    const result = parseAlertEntry({ ...entry, summary: '회사 정보 확인 필요' }, '2026-11-15T08:30:00Z', prefs);
    expect(result.job).toMatchObject({ career_requirement: null, deadline: null, match_status: '조건 확인 필요' });
  });
  it('acknowledges only after persistence, and retries do not insert duplicate jobs', async () => {
    const db = database();
    const body = { messageId: 'm1', receivedAt: '2026-11-15T08:30:00Z', jobs: [{ title: '품질관리 채용', summary: '', original_url: 'https://m.jobkorea.co.kr/Recruit/GI_Read/48951021?sc=226' }] };
    db.state.failInsert = true;
    await expect(ingestEmail(db, body)).rejects.toThrow('D1 unavailable');
    expect(db.state.messages.size).toBe(0);
    db.state.failInsert = false;
    expect((await ingestEmail(db, body)).platforms.jobkorea.newCount).toBe(1);
    expect((await ingestEmail(db, body)).duplicateMessage).toBe(true);
    expect(db.state.jobs).toHaveLength(1);
    expect((await ingestEmail(db, { ...body, messageId: 'm2' })).platforms.jobkorea.duplicateCount).toBe(1);
  });
});