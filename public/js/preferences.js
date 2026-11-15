export const ALL_LOCATIONS = '전체 (지역 상관없음)';

export function togglePreferredLocation(locations, value) {
  if (value === ALL_LOCATIONS) return [];
  return locations.includes(value) ? locations.filter((item) => item !== value) : [...locations.filter((item) => item !== ALL_LOCATIONS), value];
}