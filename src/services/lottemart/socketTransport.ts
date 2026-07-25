/**
 * 롯데마트 HTTP 소켓 전송
 */

import { LOTTEMART_API } from './api.js';

export type LotteMartSocketConnect = (
  address: { hostname: string; port: number },
  options?: { allowHalfOpen: boolean },
) => {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
};

function withSocketTimeout<T>(operation: Promise<T>, timeout: number): Promise<T | null> {
  const timeoutMs = Math.max(1, Math.trunc(timeout));

  return new Promise<T | null>((resolve, reject) => {
    const timeoutId = setTimeout(() => resolve(null), timeoutMs);
    operation.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

export function withLotteMartSessionCookie(headers: HeadersInit | undefined, sessionCookie: string): Headers {
  const result = new Headers(headers);
  if (sessionCookie.trim().length > 0) {
    result.set('Cookie', sessionCookie);
  }
  return result;
}

export function toLotteMartBodyText(body: RequestInit['body']): string | undefined {
  if (typeof body === 'string') {
    return body;
  }

  if (body instanceof URLSearchParams) {
    return body.toString();
  }

  return undefined;
}

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

export async function __testOnlyFetchLotteMartSocketResponse(
  url: string,
  init: RequestInit,
  sessionCookie: string,
  connectFn: LotteMartSocketConnect,
  timeout: number,
): Promise<Response | null> {
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
  const bodyText = toLotteMartBodyText(init.body) || '';
  if (bodyText.length > 0 && !headers.has('Content-Length')) {
    headers.set('Content-Length', String(new TextEncoder().encode(bodyText).length));
  }

  const headerLines = Array.from(headers.entries()).map(([name, value]) => `${name}: ${value}`);
  const path = `${requestUrl.pathname}${requestUrl.search}`;
  const requestText = [`${init.method || 'GET'} ${path} HTTP/1.1`, ...headerLines, '', bodyText].join('\r\n');
  const socket = connectFn(
    {
      hostname: LOTTEMART_API.SOCKET_HOST,
      port: 80,
    },
    { allowHalfOpen: true },
  );
  const writer = socket.writable.getWriter();
  const encodedRequest = new TextEncoder().encode(requestText);
  if ((await withSocketTimeout(writer.write(encodedRequest), timeout)) === null) {
    void writer.abort().catch(Boolean);
    return null;
  }
  if ((await withSocketTimeout(writer.close(), timeout)) === null) {
    void writer.abort().catch(Boolean);
    return null;
  }

  const reader = socket.readable.getReader();
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const readResult = await withSocketTimeout(reader.read(), timeout);
      if (readResult === null) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      const { value, done } = readResult;
      if (done) {
        break;
      }
      chunks.push(value as Uint8Array);
    }
  } finally {
    reader.releaseLock();
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const raw = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    raw.set(chunk, offset);
    offset += chunk.length;
  }

  return __testOnlyCreateLotteMartSocketResponse(raw);
}

/* c8 ignore start */
export async function fetchLotteMartSocketResponse(
  url: string,
  init: RequestInit,
  sessionCookie: string,
  timeout: number,
): Promise<Response | null> {
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

  return __testOnlyFetchLotteMartSocketResponse(url, init, sessionCookie, connectFn, timeout);
}
/* c8 ignore end */
