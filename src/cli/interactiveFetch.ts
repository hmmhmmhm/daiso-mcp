/**
 * 인터랙티브 CLI API 호출 헬퍼
 */

import { buildDaisoStoreKeywordVariants, parseStores } from '../utils/cliInteractiveHelpers.js';
import type { FetchLike, InteractiveStore } from './interactiveTypes.js';

const BASE_URL = 'https://mcp.aka.page';

export async function fetchEnvelope(
  fetchImpl: FetchLike,
  path: string,
  query: Record<string, string> = {},
): Promise<unknown> {
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  const response = await fetchImpl(url.toString());
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} (${url.pathname})`);
  }

  return (await response.json()) as unknown;
}

export async function fetchStoresWithKeywordFallback(
  fetchImpl: FetchLike,
  service: 'daiso' | 'oliveyoung' | 'cu',
  keyword: string,
): Promise<{ stores: InteractiveStore[]; matchedKeyword: string }> {
  const candidates = service === 'daiso' ? buildDaisoStoreKeywordVariants(keyword) : [keyword];
  const keywords = candidates.length > 0 ? candidates : [keyword];

  for (const currentKeyword of keywords) {
    const payload = await fetchEnvelope(fetchImpl, `/api/${service}/stores`, {
      keyword: currentKeyword,
      limit: '10',
    });
    const stores = parseStores(payload);
    if (stores.length > 0) {
      return { stores, matchedKeyword: currentKeyword };
    }
  }

  return { stores: [], matchedKeyword: keyword };
}
