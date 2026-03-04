/**
 * CGV 전송 계층
 *
 * 서명 헤더 생성, 직접 호출, Zyte fallback을 담당합니다.
 */

import { createTimeoutController } from '../../utils/http.js';
import { decodeZyteHttpBody, requestByZyte } from '../../utils/zyte.js';
import { CGV_API } from './api.js';

function toBase64(bytes: Uint8Array): string {
  /* c8 ignore start */
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  /* c8 ignore end */

  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  if (typeof btoa === 'function') {
    return btoa(binary);
  }

  /* c8 ignore next */
  throw new Error('Base64 인코딩을 지원하지 않는 런타임입니다.');
}

async function createSignature(pathname: string, bodyText: string, timestamp: string): Promise<string> {
  const payload = `${timestamp}|${pathname}|${bodyText}`;
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(CGV_API.SIGNING_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return toBase64(new Uint8Array(signed));
}

async function parseJsonResponse<TResponse>(response: Response): Promise<TResponse> {
  const text = await response.text();

  try {
    return JSON.parse(text) as TResponse;
  } catch {
    throw new Error(text.slice(0, 120) || 'CGV API 응답 파싱 실패');
  }
}

async function requestByZyteCgv<TResponse>(
  path: string,
  searchParams: URLSearchParams,
  timeout: number,
  apiKey: string,
): Promise<TResponse> {
  const url = `${CGV_API.BASE_URL}${path}?${searchParams.toString()}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await createSignature(path, '', timestamp);
  const result = await requestByZyte({
    apiKey,
    timeout,
    url,
    headers: [
      { name: 'Accept', value: 'application/json' },
      { name: 'Accept-Language', value: 'ko-KR' },
      { name: 'X-TIMESTAMP', value: timestamp },
      { name: 'X-SIGNATURE', value: signature },
    ],
  });

  return decodeZyteHttpBody<TResponse>(result);
}

export async function requestCgv<TResponse>(
  path: string,
  searchParams: URLSearchParams,
  timeout = 15000,
  zyteApiKey?: string,
): Promise<TResponse> {
  const url = `${CGV_API.BASE_URL}${path}?${searchParams.toString()}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await createSignature(path, '', timestamp);
  const { controller, timeoutId } = createTimeoutController(timeout);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'ko-KR',
        'X-TIMESTAMP': timestamp,
        'X-SIGNATURE': signature,
      },
      signal: controller.signal,
    });

    if (response.ok) {
      return await parseJsonResponse<TResponse>(response);
    }

    if (response.status === 403 && zyteApiKey) {
      return await requestByZyteCgv<TResponse>(path, searchParams, timeout, zyteApiKey);
    }

    throw new Error(`CGV API 호출 실패: ${response.status}`);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('CGV API 요청 시간 초과');
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
