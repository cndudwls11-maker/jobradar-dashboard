import { COLLECTOR_REGISTRY } from './common.js';

// JobKorea robots.txt blocks known scrapers and the official API access contract is not confirmed.
// Do not scrape; enable only after receiving written permission or approved API credentials.
export async function collectJobkorea() {
  const site = COLLECTOR_REGISTRY.find((item) => item.id === 'jobkorea');
  return { site, status: 'unconnected', jobs: [], error: 'robots.txt에서 Scrapy 등 알려진 수집기를 전체 차단하며 공식 API 권한을 확인하지 못해 수집하지 않았습니다. 공식 API 또는 서면 승인이 필요합니다.' };
}