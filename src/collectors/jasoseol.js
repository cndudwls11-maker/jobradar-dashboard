import { COLLECTOR_REGISTRY } from './common.js';

// robots.txt allows some public paths but does not grant republication rights. No approved API/terms clearance found.
export async function collectJasoseol() {
  const site = COLLECTOR_REGISTRY.find((item) => item.id === 'jasoseol');
  return { site, status: 'unconnected', jobs: [], error: 'robots.txt 일부 경로는 허용하지만 공식 API 및 채용정보의 자동수집·재사용 권한은 확인되지 않았습니다. 허가 전에는 수집하지 않습니다.' };
}