/**
 * 롯데마트 매장 검색 키워드 보정
 */

export function buildLotteMartKeywordVariants(rawKeyword: string): string[] {
  const base = rawKeyword.trim();
  if (!base) {
    return [];
  }

  const compact = base.replace(/\s+/g, '');
  const withoutNoise = compact.replace(/(롯데마트|근처|주변)/g, '');
  const tokens = base
    .split(/\s+/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .filter((value) => !['롯데마트', '근처', '주변'].includes(value));
  const normalizedTokens = tokens
    .map((value) => value.replace(/역$/g, '').trim())
    .filter((value) => value.length > 0);
  const primaryToken = normalizedTokens[0] || tokens[0] || '';

  const candidates = [
    base,
    compact,
    withoutNoise,
    primaryToken,
    ...(tokens.length <= 1 ? tokens : []),
    ...(normalizedTokens.length <= 1 ? normalizedTokens : []),
  ];

  return [...new Set(candidates.map((value) => value.trim()).filter((value) => value.length > 0))];
}
