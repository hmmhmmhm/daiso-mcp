/**
 * 롯데마트 세션 쿠키 관리
 */

import { HttpError, fetchWithTimeout } from '../../utils/http.js';
import { decodeBase64, requestByZyte } from '../../utils/zyte.js';
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

export interface LotteMartProbeAttempt {
  used: 'direct' | 'zyte';
  success: boolean;
  status: number | null;
  statusText: string | null;
  error: string | null;
  bodyPreview: string | null;
  sessionCookie: string | null;
}

type LotteMartSocketConnect = (
  address: { hostname: string; port: number },
  options?: { allowHalfOpen: boolean },
) => {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
};

export function __testOnlyCreateLotteMartSocketResponse(raw: Uint8Array): Response | null {
  const delimiter = new TextEncoder().encode('\r\n\r\n');
  let boundary = -1;
  for (let index = 0; index <= raw.length - delimiter.length; index += 1) {
    let matched = true;
    for (let inner = 0; inner < delimiter.length; inner += 1) {
      if (raw[index + inner] !== delimiter[inner]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      boundary = index;
      break;
    }
  }

  if (boundary < 0) {
    return null;
  }

  const headerText = new TextDecoder().decode(raw.slice(0, boundary));
  if (!headerText.startsWith('HTTP/')) {
    return null;
  }

  const bodyBytes = raw.slice(boundary + delimiter.length);
  const headerLinesRaw = headerText.split('\r\n');
  const statusLine = headerLinesRaw.shift() as string;
  const [, statusCodeText = '500', ...statusTextParts] = statusLine.split(' ');
  const responseHeaders = new Headers();
  for (const line of headerLinesRaw) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex < 0) {
      continue;
    }
    responseHeaders.append(line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1).trim());
  }

  return new Response(bodyBytes, {
    status: parseInt(statusCodeText, 10) || 500,
    statusText: statusTextParts.join(' ').trim(),
    headers: responseHeaders,
  });
}

/* c8 ignore start */
async function fetchLotteMartSocketResponse(url: string, init: RequestInit, sessionCookie: string): Promise<Response | null> {
  let connectFn: LotteMartSocketConnect | null = null;
  try {
    const socketsModule = await import('cloudflare:sockets');
    connectFn = socketsModule.connect as LotteMartSocketConnect;
  } catch {
    return null;
  }

  if (!connectFn) {
    return null;
  }

  const requestUrl = new URL(url);
  const headers = withLotteMartSessionCookie(
    {
      Accept: 'text/html, */*; q=0.01',
      Host: LOTTEMART_API.ORIGIN_HOST,
      Origin: 'https://company.lottemart.com',
      Referer: LOTTEMART_API.ORIGIN_REFERER,
      Connection: 'close',
      ...init.headers,
    },
    sessionCookie,
  );
  const bodyText = toBodyText(init.body) || '';
  if (bodyText.length > 0 && !headers.has('Content-Length')) {
    headers.set('Content-Length', String(new TextEncoder().encode(bodyText).length));
  }

  const headerLines = Array.from(headers.entries()).map(([name, value]) => `${name}: ${value}`);
  const path = `${requestUrl.pathname}${requestUrl.search}`;
  const requestText = [`${init.method || 'GET'} ${path} HTTP/1.1`, ...headerLines, '', bodyText].join('\r\n');
  const socket = connectFn({
    hostname: LOTTEMART_API.SOCKET_HOST,
    port: 80,
  }, { allowHalfOpen: true });
  const writer = socket.writable.getWriter();
  await writer.write(new TextEncoder().encode(requestText));
  await writer.close();

  const reader = socket.readable.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      chunks.push(value);
    }
  }
  reader.releaseLock();

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const raw = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    raw.set(chunk, offset);
    offset += chunk.length;
  }

  return __testOnlyCreateLotteMartSocketResponse(raw);
}
/* c8 ignore end */

function cacheSessionCookie(cookie: string): string {
  const normalized = cookie.trim();
  if (normalized.length === 0) {
    return '';
  }

  sessionCache = {
    expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
    cookie: normalized,
  };

  return normalized;
}

function cacheSessionCookieFromResponse(response: Response): string {
  const cookie = extractSessionCookie(response);
  return cacheSessionCookie(cookie);
}

export async function getCachedLotteMartSessionCookie(
  _timeout: number,
  forceRefresh = false,
): Promise<string> {
  if (forceRefresh) {
    sessionCache = null;
  }

  if (sessionCache && sessionCache.expiresAt > Date.now()) {
    return sessionCache.cookie;
  }

  return '';
}

export async function getFreshLotteMartSessionCookie(timeout: number): Promise<string> {
  return getCachedLotteMartSessionCookie(timeout, true);
}

export function withLotteMartSessionCookie(headers: HeadersInit | undefined, sessionCookie: string): Headers {
  const result = new Headers(headers);
  if (sessionCookie.trim().length > 0) {
    result.set('Cookie', sessionCookie);
  }
  return result;
}

async function fetchLotteMartResponse(
  url: string,
  init: RequestInit,
  timeout: number,
  sessionCookie: string,
): Promise<Response> {
  const socketResponse = await fetchLotteMartSocketResponse(url, init, sessionCookie);
  if (socketResponse) {
    return socketResponse;
  }

  return fetchWithTimeout(url, {
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

function toZyteHeaders(headers: Headers): Array<{ name: string; value: string }> {
  return Array.from(headers.entries()).map(([name, value]) => ({ name, value }));
}

function toBodyText(body: RequestInit['body']): string | undefined {
  if (typeof body === 'string') {
    return body;
  }

  if (body instanceof URLSearchParams) {
    return body.toString();
  }

  return undefined;
}

async function fetchLotteMartHtmlByZyte(
  url: string,
  init: RequestInit,
  timeout: number,
  sessionCookie: string,
  zyteApiKey: string,
): Promise<string> {
  const headers = withLotteMartSessionCookie(
    {
      Accept: 'text/html, */*; q=0.01',
      ...init.headers,
    },
    sessionCookie,
  );
  const result = await requestByZyte({
    apiKey: zyteApiKey,
    url,
    timeout,
    method: (init.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | undefined) || 'GET',
    headers: toZyteHeaders(headers),
    bodyText: toBodyText(init.body),
  });

  if (!result.httpResponseBody) {
    throw new Error('Zyte HTTP 응답 본문이 비어 있습니다.');
  }

  return decodeBase64(result.httpResponseBody);
}

function toBodyPreview(bodyText: string): string | null {
  const normalized = bodyText.trim().replace(/\s+/g, ' ');
  return normalized.length > 0 ? normalized.slice(0, 300) : null;
}

export async function probeLotteMartRequest(
  url: string,
  init: RequestInit,
  timeout: number,
  sessionCookie: string,
  zyteApiKey?: string,
): Promise<LotteMartProbeAttempt[]> {
  const attempts: LotteMartProbeAttempt[] = [];

  try {
    const response = await fetchLotteMartResponse(url, init, timeout, sessionCookie);
    const bodyText = await response.text();
    attempts.push({
      used: 'direct',
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      error: response.ok ? null : new HttpError(response.status, response.statusText, bodyText).message,
      bodyPreview: toBodyPreview(bodyText),
      sessionCookie: extractSessionCookie(response) || null,
    });
  } catch (error) {
    attempts.push({
      used: 'direct',
      success: false,
      status: null,
      statusText: null,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
      bodyPreview: null,
      sessionCookie: null,
    });
  }

  if (zyteApiKey) {
    try {
      const bodyText = await fetchLotteMartHtmlByZyte(url, init, timeout, sessionCookie, zyteApiKey);
      attempts.push({
        used: 'zyte',
        success: true,
        status: 200,
        statusText: 'OK',
        error: null,
        bodyPreview: toBodyPreview(bodyText),
        sessionCookie: sessionCookie || null,
      });
    } catch (error) {
      attempts.push({
        used: 'zyte',
        success: false,
        status: null,
        statusText: null,
        error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
        bodyPreview: null,
        sessionCookie: sessionCookie || null,
      });
    }
  }

  return attempts;
}

export async function fetchLotteMartHtml(
  url: string,
  init: RequestInit,
  timeout: number,
  sessionCookie: string,
  zyteApiKey?: string,
): Promise<string> {
  try {
    const response = await fetchLotteMartResponse(url, init, timeout, sessionCookie);
    const cachedCookie = cacheSessionCookieFromResponse(response);
    let bodyText: string;
    try {
      bodyText = await response.text();
    } catch (error) {
      if (sessionCookie.trim().length === 0 && cachedCookie.length > 0) {
        const retried = await fetchLotteMartResponse(url, init, timeout, cachedCookie);
        cacheSessionCookieFromResponse(retried);
        const retriedBodyText = await retried.text();
        if (!retried.ok) {
          throw new HttpError(retried.status, retried.statusText, retriedBodyText);
        }
        return retriedBodyText;
      }

      throw error;
    }

    if (!response.ok) {
      throw new HttpError(response.status, response.statusText, bodyText);
    }

    if (bodyText.trim().length === 0 && sessionCookie.trim().length === 0 && cachedCookie.length > 0) {
      const retried = await fetchLotteMartResponse(url, init, timeout, cachedCookie);
      cacheSessionCookieFromResponse(retried);
      const retriedBodyText = await retried.text();
      if (!retried.ok) {
        throw new HttpError(retried.status, retried.statusText, retriedBodyText);
      }
      return retriedBodyText;
    }

    return bodyText;
  } catch (error) {
    if (zyteApiKey && error instanceof Error && !error.message.includes('Zyte')) {
      const fallbackCookie = await getCachedLotteMartSessionCookie(timeout);
      return fetchLotteMartHtmlByZyte(url, init, timeout, fallbackCookie || sessionCookie, zyteApiKey);
    }

    throw error;
  }
}

export async function fetchLotteMartPageWithSession(
  path: string,
  init: RequestInit,
  timeout: number,
  sessionCookie: string,
  zyteApiKey?: string,
): Promise<string> {
  return fetchLotteMartHtml(new URL(path, LOTTEMART_API.BASE_URL).toString(), init, timeout, sessionCookie, zyteApiKey);
}

export function __testOnlyClearLotteMartSessionCache(): void {
  sessionCache = null;
}
