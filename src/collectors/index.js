import { collectSaramin } from './saramin.js';
import { collectJobkorea } from './jobkorea.js';
import { collectIncruit } from './incruit.js';
import { collectJasoseol } from './jasoseol.js';

export const collectors = [collectSaramin, collectJobkorea, collectIncruit, collectJasoseol];

export async function collectAll(preferences, env) {
  return Promise.all(collectors.map(async (collector) => {
    try { return await collector(preferences, env); }
    catch (error) {
      return { site: { id: collector.name }, status: 'failed', jobs: [], error: error instanceof Error ? error.message : '알 수 없는 수집 오류' };
    }
  }));
}