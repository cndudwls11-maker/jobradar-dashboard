/* Google Apps Script Gmail ingestion for Google Alerts. Configure Script Properties:
 * JOBRADAR_INGEST_URL (HTTPS /api/email-ingest), JOBRADAR_INGEST_TOKEN (Bearer token).
 * Run ingestJobAlerts() on a time-driven trigger.
 */
var JOBRADAR_LABEL = '채용알림';
var JOBRADAR_DONE_LABEL = 'JobRadar/processed';
var JOBRADAR_URL_PROPERTY = 'JOBRADAR_INGEST_URL';
var JOBRADAR_TOKEN_PROPERTY = 'JOBRADAR_INGEST_TOKEN';
var JOBRADAR_MESSAGE_PROPERTY = 'JOBRADAR_ACKED_MESSAGE_IDS';
var JOBRADAR_ACK_LIMIT = 100;

function ingestJobAlerts() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Another Gmail ingestion run is active.');
  try {
    var props = PropertiesService.getScriptProperties();
    var endpoint = String(props.getProperty(JOBRADAR_URL_PROPERTY) || '').trim();
    var token = String(props.getProperty(JOBRADAR_TOKEN_PROPERTY) || '').trim();
    if (!endpoint || !token) throw new Error('Set JOBRADAR_INGEST_URL and JOBRADAR_INGEST_TOKEN.');
    if (!/^https:\/\//i.test(endpoint)) throw new Error('Ingest endpoint must use HTTPS.');
    var inputLabel = GmailApp.getUserLabelByName(JOBRADAR_LABEL);
    if (!inputLabel) return;
    var doneLabel = GmailApp.getUserLabelByName(JOBRADAR_DONE_LABEL) || GmailApp.createLabel(JOBRADAR_DONE_LABEL);
    var acked = readAckedIds_(props);
    var checked = 0;
    for (var offset = 0; offset < 1000; offset += 100) {
      var threads = inputLabel.getThreads(offset, 100);
      threads.forEach(function(thread) {
      var threadHasUnacked = false;
      thread.getMessages().forEach(function(message) {
        var id = message.getId();
        if (acked[id]) return;
        threadHasUnacked = true;
        try {
          var payload = { messageId: id, receivedAt: message.getDate().toISOString(), jobs: parseAlertHtml_(message.getBody()) };
          var response = UrlFetchApp.fetch(endpoint, { method: 'post', contentType: 'application/json',
            headers: { Authorization: 'Bearer ' + token }, payload: JSON.stringify(payload), muteHttpExceptions: true });
          var body;
          try { body = JSON.parse(response.getContentText()); } catch (ignored) { body = null; }
          if (response.getResponseCode() < 200 || response.getResponseCode() >= 300 || !body || body.ok !== true) {
            throw new Error('Ingest endpoint did not acknowledge message (HTTP ' + response.getResponseCode() + ').');
          }
          acked[id] = true;
          writeAckedIds_(props, acked);
        } catch (error) { console.error('Gmail ingestion failed for ' + id + ': ' + error); }
      });
      // Message IDs are authoritative. A later message in this thread is not skipped.
      var allAcked = thread.getMessages().every(function(message) { return !!acked[message.getId()]; });
      if (threadHasUnacked && allAcked) thread.addLabel(doneLabel);
      });
      checked += threads.length;
      if (threads.length < 100) break;
    }
  } finally { lock.releaseLock(); }
}

function parseAlertHtml_(html) {
  html = String(html || '');
  var results = [], seen = {};
  var anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi, match;
  while ((match = anchorRe.exec(html)) !== null) {
    var hm = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(match[1]);
    if (!hm) continue;
    var href = decodeHtml_(hm[1] || hm[2] || hm[3] || '').trim();
    var title = cleanHtmlText_(match[2]);
    if (!title || !href || /^javascript:/i.test(href)) continue;
    var original = unwrapGoogleUrl_(href);
    if (!isPlatformUrl_(original)) continue;
    var key = original.toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;
    results.push({ title: title.slice(0, 500), summary: nearbySummary_(html, match.index, anchorRe.lastIndex, match[2]), original_url: original.slice(0, 2048) });
  }
  return results;
}

function unwrapGoogleUrl_(href) {
  var candidate = href;
  for (var i = 0; i < 3; i += 1) {
    try {
      var url = new URL(decodeHtml_(candidate), 'https://www.google.com/');
      var host = url.hostname.toLowerCase();
      if ((host === 'google.com' || /\.google\.com$/.test(host)) && /^(?:\/url|\/aclk)$/i.test(url.pathname)) {
        var target = url.searchParams.get('url') || url.searchParams.get('q') || url.searchParams.get('adurl');
        if (target) { candidate = target; continue; }
      }
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
    } catch (ignored) { return ''; }
  }
  try { return new URL(candidate).href; } catch (ignored) { return ''; }
}

function nearbySummary_(html, start, end, anchorInner) {
  var after = html.slice(end, Math.min(html.length, end + 1400));
  // Google Alerts snippets normally appear in adjacent table cells or result divs.
  var summary = cleanHtmlText_(after.replace(/^\s*(?:<\/[^>]+>\s*)*/, '').split(/<a\b/i)[0]);
  if (!summary || summary.length < 12) {
    var before = html.slice(Math.max(0, start - 800), start);
    var chunks = before.match(/<(?:div|font|span)\b[^>]*>[\s\S]*?<\/(?:div|font|span)>/gi) || [];
    if (chunks.length) summary = cleanHtmlText_(chunks[chunks.length - 1]);
  }
  if (summary === cleanHtmlText_(anchorInner)) return '';
  return summary.replace(/\s+/g, ' ').trim().slice(0, 2000);
}

function cleanHtmlText_(html) {
  return decodeHtml_(String(html || '').replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ').trim();
}

function decodeHtml_(text) {
  return String(text || '').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, function(_, n) { return String.fromCharCode(Number(n)); })
    .replace(/&#x([\da-f]+);/gi, function(_, n) { return String.fromCharCode(parseInt(n, 16)); });
}

function readAckedIds_(props) {
  try { return JSON.parse(props.getProperty(JOBRADAR_MESSAGE_PROPERTY) || '{}') || {}; }
  catch (ignored) { return {}; }
}
function writeAckedIds_(props, ids) {
  var keys = Object.keys(ids);
  if (keys.length > JOBRADAR_ACK_LIMIT) {
    var trimmed = {};
    keys.slice(keys.length - JOBRADAR_ACK_LIMIT).forEach(function(key) { trimmed[key] = true; });
    ids = trimmed;
  }
  props.setProperty(JOBRADAR_MESSAGE_PROPERTY, JSON.stringify(ids));
}

function isPlatformUrl_(value) {
  try {
    var url = new URL(value), host = url.hostname.toLowerCase().replace(/^www\./, '');
    return (url.protocol === 'https:' || url.protocol === 'http:') &&
      ['saramin.co.kr', 'jobkorea.co.kr', 'm.jobkorea.co.kr', 'incruit.com', 'jasoseol.com', 'linkareer.com'].indexOf(host) >= 0;
  } catch (ignored) { return false; }
}
