/**
 * 다이소 HTTP 클라이언트
 *
 * 다이소 API 호출 시 필요한 기본 헤더를 적용합니다.
 */

import { type FetchOptions, fetchJson, fetchText, fetchWithTimeout } from '../../utils/http.js';
import { DAISOMALL_API } from './api.js';

const DAISO_AUTH_KEY = 'PRE_AUTH_ENC_KEY';

const DAISO_DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/html, */*',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
} as const;

const DAISO_DEFAULT_FETCH_OPTIONS = {
  retries: 1,
  retryDelayMs: 250,
} as const;

function withDaisoHeaders(headers: HeadersInit = {}): HeadersInit {
  return {
    ...DAISO_DEFAULT_HEADERS,
    ...headers,
  };
}

export async function daisoFetch(url: string, options: FetchOptions = {}): Promise<Response> {
  return fetchWithTimeout(url, {
    ...DAISO_DEFAULT_FETCH_OPTIONS,
    ...options,
    headers: withDaisoHeaders(options.headers),
  });
}

export async function fetchDaisoJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  return fetchJson<T>(url, {
    ...DAISO_DEFAULT_FETCH_OPTIONS,
    ...options,
    headers: withDaisoHeaders(options.headers),
  });
}

export async function fetchDaisoHtml(url: string, options: FetchOptions = {}): Promise<string> {
  return fetchText(url, {
    ...DAISO_DEFAULT_FETCH_OPTIONS,
    ...options,
    headers: withDaisoHeaders(options.headers),
  });
}

function base64FromBytes(bytes: Uint8Array): string {
  /* c8 ignore next -- Node 20 CI always provides Buffer; the fallback below is for browser-like runtimes. */
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  /* c8 ignore start -- Node 20 CI always provides Buffer; this fallback is for browser-like runtimes. */
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  if (typeof btoa === 'function') {
    return btoa(binary);
  }

  throw new Error('Base64 인코딩을 지원하지 않는 환경입니다.');
  /* c8 ignore stop */
}

async function createDaisoAuthHeader(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(DAISO_AUTH_KEY),
    { name: 'AES-CBC' },
    false,
    ['encrypt'],
  );
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv },
    key,
    encoder.encode(token),
  );

  return `${base64FromBytes(iv)}${base64FromBytes(new Uint8Array(encrypted))}`;
}

export interface DaisoAuthContext {
  authorization: string;
  dmUid: string;
  cookie: string;
}

export async function createDaisoAuthContext(): Promise<DaisoAuthContext> {
  const response = await daisoFetch(DAISOMALL_API.AUTH_REQUEST, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`다이소 인증 토큰 요청 실패: ${response.status} ${response.statusText}`);
  }

  const token = (await response.text()).trim();
  const dmUid = response.headers.get('x-dm-uid')?.trim() || '';

  if (!token) {
    throw new Error('다이소 인증 토큰이 비어 있습니다.');
  }

  if (!dmUid) {
    throw new Error('다이소 인증 응답에 X-DM-UID 헤더가 없습니다.');
  }

  const authorization = await createDaisoAuthHeader(token);
  return {
    authorization: `Bearer ${authorization}`,
    dmUid,
    cookie: `DM_UID=${dmUid}`,
  };
}

export async function fetchDaisoJsonWithAuth<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const auth = await createDaisoAuthContext();

  return fetchJson<T>(url, {
    ...DAISO_DEFAULT_FETCH_OPTIONS,
    ...options,
    headers: withDaisoHeaders({
      ...options.headers,
      Authorization: auth.authorization,
      'X-DM-UID': auth.dmUid,
      Cookie: auth.cookie,
    }),
  });
}
