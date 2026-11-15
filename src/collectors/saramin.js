import { COLLECTOR_REGISTRY } from './common.js';

// Saramin provides an official job API, but the site explicitly requires an application and approval.
// This adapter intentionally performs no request until an approved key and its current API contract are configured.
export async function collectSaramin(_preferences, env) {
  const site = COLLECTOR_REGISTRY.find((item) => item.id === 'saramin');
  if (!env.SARAMIN_API_KEY) return { site, status: 'unconnected', jobs: [], error: '사람인 채용정보 API는 공식 이용 신청 및 승인 후 발급된 access-key가 필요합니다.' };
  return { site, status: 'unconnected', jobs: [], error: '키는 설정되어 있으나 현재 API 명세/승인 범위를 확인하지 않아 호출하지 않았습니다. 승인된 명세에 맞춰 어댑터 구현을 완료해야 합니다.' };
}