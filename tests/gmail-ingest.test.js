import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { URL } from 'node:url';

const source = readFileSync(new URL('../apps-script/gmail-ingest.gs', import.meta.url), 'utf8');
function harness({ threads = [], fetchStatus = 200, fetchBody = '{"ok":true}' } = {}) {
  const props = new Map();
  const calls = [];
  const done = { name: 'done' };
  const context = {
    URL, console: { error: vi.fn() },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: vi.fn() }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => props.get(key) || null, setProperty: (key, value) => props.set(key, value) }) },
    GmailApp: {
      getUserLabelByName: name => name === '채용알림' ? { getThreads: (offset, size) => threads.slice(offset, offset + size) } : name === 'JobRadar/processed' ? done : null,
      createLabel: () => done,
    },
    UrlFetchApp: { fetch: (url, options) => { calls.push({ url, options }); return { getResponseCode: () => fetchStatus, getContentText: () => fetchBody }; } },
  };
  props.set('JOBRADAR_INGEST_URL', 'https://worker.example/api/email-ingest');
  props.set('JOBRADAR_INGEST_TOKEN', 'secret');
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, calls, props, done };
}
function msg(id, html) { return { getId: () => id, getDate: () => new Date('2026-11-15T08:30:00Z'), getBody: () => html }; }
function thread(messages) { return { messages, added: [], getMessages() { return this.messages; }, addLabel(label) { this.added.push(label); } }; }

afterEach(() => vi.restoreAllMocks());

describe('Apps Script Gmail alert extraction', () => {
  it('parses realistic multi-result Google HTML, summaries and original links, deduplicating repeated links', () => {
    const html = `<!doctype html><html><body><table><tr><td>
      <div class="result"><a href="https://www.google.com/url?url=https%3A%2F%2Fwww.jobkorea.co.kr%2FRecruit%2FGI_Read%2F123456%3Futm_source%3Dgoogle&amp;usg=tracker"><b>품질관리 담당자 채용</b></a>
      <div class="snippet">서울 본사 품질관리 담당 경력직 모집. 접수는 11월 30일까지입니다.</div></div>
      <div class="result"><a href="https://www.google.com/url?q=https%3A%2F%2Fm.jobkorea.co.kr%2FRecruit%2FGI_Read%2F789012%3Ffrom%3Dalert"><b>생산기술 신입사원</b></a>
      <span>천안 사업장에서 생산기술 신입 직원을 모집합니다.</span></div>
      <a href="https://www.google.com/url?q=https%3A%2F%2Fwww.jobkorea.co.kr%2FRecruit%2FGI_Read%2F123456%3Futm_source%3Dgoogle"><b>품질관리 담당자 채용</b></a><div>duplicate entry text ignored</div>
      <a href="https://tracker.example/click?dest=jobkorea">악성 추적 링크</a>
    </td></tr></table></body></html>`;
    const h = harness();
    const entries = h.context.parseAlertHtml_(html);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ title: '품질관리 담당자 채용', original_url: 'https://www.jobkorea.co.kr/Recruit/GI_Read/123456?utm_source=google' });
    expect(entries[0].summary).toContain('서울 본사 품질관리 담당 경력직 모집');
    expect(entries[1]).toMatchObject({ title: '생산기술 신입사원', original_url: 'https://m.jobkorea.co.kr/Recruit/GI_Read/789012?from=alert' });
    expect(entries[1].summary).toContain('천안 사업장');
  });

  it('sends only message envelope and entries, then acknowledges and labels the completed thread', () => {
    const t = thread([msg('m-1', '<a href="https://jobkorea.co.kr/Recruit/GI_Read/123456">공고</a><div>요약입니다.</div>')]);
    const h = harness({ threads: [t] });
    h.context.ingestJobAlerts();
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].options.headers.Authorization).toBe('Bearer secret');
    const payload = JSON.parse(h.calls[0].options.payload);
    expect(Object.keys(payload).sort()).toEqual(['jobs', 'messageId', 'receivedAt']);
    expect(Object.keys(payload.jobs[0]).sort()).toEqual(['original_url', 'summary', 'title']);
    expect(payload.messageId).toBe('m-1');
    expect(t.added).toEqual([h.done]);
    expect(h.props.get('JOBRADAR_ACKED_MESSAGE_IDS')).toContain('m-1');
  });

  it('sends empty jobs for no-link message but does not complete after endpoint error', () => {
    const noLink = thread([msg('no-links', '<html><p>Google Alerts: no results found.</p></html>')]);
    const h = harness({ threads: [noLink], fetchStatus: 503, fetchBody: 'unavailable' });
    h.context.ingestJobAlerts();
    expect(JSON.parse(h.calls[0].options.payload).jobs).toEqual([]);
    expect(noLink.added).toEqual([]);
    expect(h.props.get('JOBRADAR_ACKED_MESSAGE_IDS')).toBeUndefined();
  });

  it('does not resend an acknowledged old message; ingests future message in same labeled thread', () => {
    const t = thread([msg('old-id', '<p>already sent</p>')]);
    const h = harness({ threads: [t] });
    h.props.set('JOBRADAR_ACKED_MESSAGE_IDS', JSON.stringify({ 'old-id': true }));
    t.messages.push(msg('new-id', '<p>new alert</p>'));
    h.context.ingestJobAlerts();
    expect(h.calls).toHaveLength(1);
    expect(JSON.parse(h.calls[0].options.payload).messageId).toBe('new-id');
    expect(t.added).toEqual([h.done]);
  });
});
