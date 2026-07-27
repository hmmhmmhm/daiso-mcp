/**
 * 차단 응답에만 Zyte를 사용하는 JSON 전송 유틸리티
 */

import { fetchJson, HttpError, type FetchOptions } from './http.js';
import {
  decodeZyteHttpBody,
  requestByZyte,
  type ZyteExtractOptions,
  type ZyteExtractResponse,
} from './zyte.js';

export interface ZyteJsonFallbackOptions extends FetchOptions {
  zyteApiKey?: string;
  zyteTags?: Record<string, string | null>;
}

const ZYTE_FALLBACK_STATUSES = new Set([400, 403, 429]);
const ZYTE_METHODS = new Set<ZyteExtractOptions['method']>([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
]);

function normalizeMethod(method?: string): ZyteExtractOptions['method'] {
  const normalized = (method || 'GET').toUpperCase() as ZyteExtractOptions['method'];
  if (!ZYTE_METHODS.has(normalized)) {
    throw new Error(`Zyte에서 지원하지 않는 HTTP 메서드입니다: ${normalized}`);
  }
  return normalized;
}

function toZyteHeaders(headers?: HeadersInit): Array<{ name: string; value: string }> {
  const normalized = new Headers(headers);
  const result: Array<{ name: string; value: string }> = [];
  normalized.forEach((value, name) => {
    result.push({ name, value });
  });
  return result;
}

function assertSuccessfulTarget(result: ZyteExtractResponse): void {
  const status = result.statusCode;
  if (typeof status !== 'number' || status < 200 || status >= 300) {
    throw new Error(`Zyte 대상 응답 실패: ${status ?? '알 수 없음'}`);
  }
}

function hasZyteApiKey(apiKey?: string): boolean {
  if (apiKey?.trim()) {
    return true;
  }

  /* c8 ignore next */
  return typeof process !== 'undefined' && Boolean(process.env?.ZYTE_API_KEY?.trim());
}

export async function fetchJsonWithZyteFallback<T>(
  url: string,
  options: ZyteJsonFallbackOptions = {},
): Promise<T> {
  const { zyteApiKey, zyteTags, ...directOptions } = options;

  try {
    return await fetchJson<T>(url, directOptions);
  } catch (error) {
    if (!(error instanceof HttpError) || !ZYTE_FALLBACK_STATUSES.has(error.status)) {
      throw error;
    }
    if (!hasZyteApiKey(zyteApiKey)) {
      throw error;
    }
  }

  const result = await requestByZyte({
    apiKey: zyteApiKey,
    url,
    timeout: directOptions.timeout,
    retries: 0,
    method: normalizeMethod(directOptions.method),
    headers: toZyteHeaders(directOptions.headers),
    bodyText: typeof directOptions.body === 'string' ? directOptions.body : undefined,
    tags: zyteTags,
  });
  assertSuccessfulTarget(result);
  return decodeZyteHttpBody<T>(result);
}
