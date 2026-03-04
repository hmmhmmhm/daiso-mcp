/**
 * HTTP 요청 유틸리티
 */

import {
  type FetchOptions,
  fetchJson as fetchJsonByHttp,
  fetchText as fetchTextByHttp,
  fetchWithTimeout,
} from './http.js';

export type { FetchOptions } from './http.js';

// JSON 응답을 위한 fetch
export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  return fetchJsonByHttp<T>(url, options);
}

// HTML 응답을 위한 fetch
export async function fetchHtml(url: string, options: FetchOptions = {}): Promise<string> {
  return fetchTextByHttp(url, options);
}

// 하위 호환을 위한 별칭 (기존 이름 유지)
export const daisoFetch = fetchWithTimeout;
