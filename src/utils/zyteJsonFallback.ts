/**
 * 레거시 Zyte 옵션을 제거하고 무료 직접 JSON 조회만 수행합니다.
 */

import { fetchJson, type FetchOptions } from './http.js';

export interface ZyteJsonFallbackOptions extends FetchOptions {
  zyteApiKey?: string;
  zyteTags?: Record<string, string | null>;
}

export async function fetchJsonWithZyteFallback<T>(
  url: string,
  options: ZyteJsonFallbackOptions = {},
): Promise<T> {
  const { zyteApiKey: _zyteApiKey, zyteTags: _zyteTags, ...directOptions } = options;
  return fetchJson<T>(url, directOptions);
}
