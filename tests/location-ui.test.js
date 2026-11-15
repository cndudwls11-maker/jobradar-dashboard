import { describe, expect, it } from 'vitest';
import { togglePreferredLocation } from '../public/js/preferences.js';

describe('preferred location selection', () => {
  it('treats the all-locations option as an empty unrestricted selection', () => {
    expect(togglePreferredLocation(['서울', '천안'], '전체 (지역 상관없음)')).toEqual([]);
  });

  it('selecting a specific location replaces the unrestricted selection', () => {
    expect(togglePreferredLocation([], '충청남도')).toEqual(['충청남도']);
  });

  it('allows multiple preferred locations and toggles an existing one off', () => {
    expect(togglePreferredLocation(['충청남도'], '서울')).toEqual(['충청남도', '서울']);
    expect(togglePreferredLocation(['충청남도', '서울'], '서울')).toEqual(['충청남도']);
  });
});