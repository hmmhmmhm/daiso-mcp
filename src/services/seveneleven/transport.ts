/** 세븐일레븐 공개 JSON API의 직접·중계 전송입니다. */
import { withSevenElevenReadCache } from './readCache.js';
import { fetchJsonWithZyteFallback } from '../../utils/zyteJsonFallback.js';
import { SEVENELEVEN_API } from './api.js';
import type { SevenElevenApiEnvelope } from './types.js';
import {
  hasConvenienceRelay,
  requestConvenienceRelay,
  type ConvenienceTransportOptions,
} from '../../utils/convenienceTransport.js';
export interface SevenElevenRequestOptions extends ConvenienceTransportOptions {
  timeout?: number;
  zyteApiKey?: string;
}

export const SEVENELEVEN_DEFAULT_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Linux; Android 15)',
} as const;
export const SEVENELEVEN_DEFAULT_FETCH_OPTIONS = {
  retries: 1,
  retryDelayMs: 250,
} as const;

export async function requestSevenElevenJson<T>(
  path: string,
  method: 'GET' | 'POST',
  body: unknown,
  options: SevenElevenRequestOptions = {},
): Promise<SevenElevenApiEnvelope<T>> {
  const { timeout = 15000, zyteApiKey } = options;
  if (hasConvenienceRelay(options)) {
    const operations: Record<string, string> = {
      [SEVENELEVEN_API.SEARCH_GOODS_PATH]: 'seven-goods',
      [SEVENELEVEN_API.SEARCH_STORE_PATH]: 'seven-store',
      [SEVENELEVEN_API.SEARCH_POPWORD_PATH]: 'seven-popwords',
      [SEVENELEVEN_API.PRODUCT_PAGES_PATH]: 'seven-pages',
      [SEVENELEVEN_API.PRODUCT_ISSUES_PATH]: 'seven-issues',
      [SEVENELEVEN_API.EXHIBITION_MAIN_PATH]: 'seven-exhibitions',
    };
    const parsed = new URL(path, SEVENELEVEN_API.BASE_URL);
    return requestConvenienceRelay(
      operations[parsed.pathname],
      parsed.pathname === SEVENELEVEN_API.SEARCH_POPWORD_PATH
        ? { label: parsed.searchParams.get('label') }
        : body || {},
      options,
      timeout,
    );
  }
  const url = `${SEVENELEVEN_API.BASE_URL}${path}`;

  return withSevenElevenReadCache(path, body, timeout, () =>
    fetchJsonWithZyteFallback<SevenElevenApiEnvelope<T>>(url, {
      ...SEVENELEVEN_DEFAULT_FETCH_OPTIONS,
      method,
      retryUnsafeMethods: method === 'POST',
      timeout,
      headers: SEVENELEVEN_DEFAULT_HEADERS,
      body: method === 'POST' ? JSON.stringify(body || {}) : undefined,
      zyteApiKey,
      zyteTags: { service: 'seveneleven' },
    }),
  );
}
