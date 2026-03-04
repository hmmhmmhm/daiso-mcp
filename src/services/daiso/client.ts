/**
 * 다이소 HTTP 클라이언트
 *
 * 다이소 API 호출 시 필요한 기본 헤더를 적용합니다.
 */

import { type FetchOptions, fetchJson, fetchText, fetchWithTimeout } from '../../utils/http.js';

const DAISO_DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/html, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
} as const;

function withDaisoHeaders(headers: HeadersInit = {}): HeadersInit {
  return {
    ...DAISO_DEFAULT_HEADERS,
    ...headers,
  };
}

export async function daisoFetch(url: string, options: FetchOptions = {}): Promise<Response> {
  return fetchWithTimeout(url, {
    ...options,
    headers: withDaisoHeaders(options.headers),
  });
}

export async function fetchDaisoJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  return fetchJson<T>(url, {
    ...options,
    headers: withDaisoHeaders(options.headers),
  });
}

export async function fetchDaisoHtml(url: string, options: FetchOptions = {}): Promise<string> {
  return fetchText(url, {
    ...options,
    headers: withDaisoHeaders(options.headers),
  });
}
