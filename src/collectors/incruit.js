import { COLLECTOR_REGISTRY } from './common.js';

// Incruit robots.txt ends with User-agent: * / Disallow: /; public crawl is not used.
export async function collectIncruit() {
  const site = COLLECTOR_REGISTRY.find((item) => item.id === 'incruit');
  return { site, status: 'unconnected', jobs: [], error: '인크루트 robots.txt의 일반 User-agent 전체 경로 차단을 확인했습니다. API 또는 명시적 서면 허가 없이 수집할 수 없습니다.' };
}