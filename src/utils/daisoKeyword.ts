/**
 * 다이소 매장 검색 키워드 보정
 */

/**
 * 역/공백/서비스명이 섞인 검색어를 다이소 매장 검색용으로 보정합니다.
 */
export function buildDaisoStoreKeywordVariants(rawKeyword: string): string[] {
  const base = rawKeyword.trim();
  if (!base) {
    return [];
  }

  const compact = base.replace(/\s+/g, '');
  const withoutNoise = compact.replace(/(다이소|근처|주변)/g, '');
  const withoutStation = withoutNoise.replace(/역$/g, '');

  const candidates = [
    base,
    compact,
    withoutNoise,
    withoutStation,
    withoutStation.replace(/(중앙)(역)?$/g, '$1'),
  ].map((item) => item.trim());

  const unique: string[] = [];
  for (const item of candidates) {
    if (!item || unique.includes(item)) {
      continue;
    }
    unique.push(item);
  }

  return unique;
}
