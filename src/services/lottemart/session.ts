/**
 * 롯데마트 세션 쿠키 관리
 */

import { fetchWithTimeout } from '../../utils/http.js';
import { fetchText } from '../../utils/http.js';
import { LOTTEMART_API } from './api.js';

const SESSION_CACHE_TTL_MS = 5 * 60 * 1000;
let sessionCache: { expiresAt: number; cookie: string } | null = null;

function extractSessionCookie(response: Response): string {
  const cookieHeaders = response.headers as Headers & { getSetCookie?: () => string[] };
  const cookieCandidates = cookieHeaders.getSetCookie
    ? cookieHeaders.getSetCookie()
    : [response.headers.get('set-cookie') || ''];
  const matched = cookieCandidates
    .flatMap((value: string) => value.split(','))
    .map((value: string) => value.trim())
    .find((value: string) => value.startsWith('ASPSESSIONID'));

  return matched ? matched.split(';')[0].trim() : '';
}

export async function getFreshLotteMartSessionCookie(timeout: number): Promise<string> {
  const response = await fetchWithTimeout(`${LOTTEMART_API.BASE_URL}/mobiledowa/`, {
    method: 'GET',
    timeout,
    headers: {
      Accept: 'text/html, */*; q=0.01',
    },
  });

  const cookie = extractSessionCookie(response);
  if (cookie.trim().length > 0) {
    sessionCache = {
      expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
      cookie,
    };
  }

  return cookie;
}

export async function getCachedLotteMartSessionCookie(
  timeout: number,
  forceRefresh = false,
): Promise<string> {
  if (!forceRefresh && sessionCache && sessionCache.expiresAt > Date.now()) {
    return sessionCache.cookie;
  }

  const cookie = await getFreshLotteMartSessionCookie(timeout);
  sessionCache = {
    expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
    cookie,
  };
  return cookie;
}

export function withLotteMartSessionCookie(headers: HeadersInit | undefined, sessionCookie: string): Headers {
  const result = new Headers(headers);
  if (sessionCookie.trim().length > 0) {
    result.set('Cookie', sessionCookie);
  }
  return result;
}

export async function fetchLotteMartHtml(
  url: string,
  init: RequestInit,
  timeout: number,
  sessionCookie: string,
): Promise<string> {
  return fetchText(url, {
    ...init,
    timeout,
    headers: withLotteMartSessionCookie(
      {
        Accept: 'text/html, */*; q=0.01',
        ...init.headers,
      },
      sessionCookie,
    ),
  });
}

export async function fetchLotteMartPageWithSession(
  path: string,
  init: RequestInit,
  timeout: number,
  sessionCookie: string,
): Promise<string> {
  return fetchLotteMartHtml(`${LOTTEMART_API.BASE_URL}${path}`, init, timeout, sessionCookie);
}

export function __testOnlyClearLotteMartSessionCache(): void {
  sessionCache = null;
}
