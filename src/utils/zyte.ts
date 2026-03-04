/**
 * Zyte Extract API 공통 유틸리티
 */

import { createTimeoutController } from './http.js';

export interface ZyteExtractResponse {
  statusCode?: number;
  httpResponseBody?: string;
  detail?: string;
  title?: string;
}

export interface ZyteExtractOptions {
  apiKey?: string;
  url: string;
  timeout?: number;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Array<{ name: string; value: string }>;
  bodyText?: string;
}

export function resolveZyteApiKey(apiKey?: string): string {
  if (apiKey && apiKey.trim().length > 0) {
    return apiKey;
  }

  /* c8 ignore start */
  if (typeof process !== 'undefined' && process.env?.ZYTE_API_KEY) {
    return process.env.ZYTE_API_KEY;
  }
  /* c8 ignore end */

  throw new Error('ZYTE_API_KEY가 설정되지 않았습니다. .env 또는 Cloudflare Worker Secret을 확인해주세요.');
}

export function encodeBasicAuth(apiKey: string): string {
  if (typeof btoa === 'function') {
    return btoa(`${apiKey}:`);
  }

  /* c8 ignore start */
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(`${apiKey}:`).toString('base64');
  }
  /* c8 ignore end */

  throw new Error('Basic 인증 인코딩을 지원하지 않는 런타임입니다.');
}

export function decodeBase64(value: string): string {
  if (typeof atob === 'function') {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  /* c8 ignore start */
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'base64').toString('utf8');
  }
  /* c8 ignore end */

  throw new Error('Base64 디코딩을 지원하지 않는 런타임입니다.');
}

export async function requestByZyte(options: ZyteExtractOptions): Promise<ZyteExtractResponse> {
  const { timeout = 15000, url, method = 'GET', headers = [], bodyText, apiKey } = options;
  const auth = encodeBasicAuth(resolveZyteApiKey(apiKey));
  const { controller, timeoutId } = createTimeoutController(timeout);

  try {
    const response = await fetch('https://api.zyte.com/v1/extract', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        url,
        httpRequestMethod: method,
        customHttpRequestHeaders: headers,
        httpRequestText: bodyText,
        httpResponseBody: true,
      }),
      signal: controller.signal,
    });

    const result = (await response.json()) as ZyteExtractResponse;

    if (!response.ok) {
      throw new Error(`Zyte API 호출 실패: ${response.status} ${result.detail || result.title || ''}`.trim());
    }

    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function decodeZyteHttpBody<TResponse>(result: ZyteExtractResponse): TResponse {
  if (!result.httpResponseBody) {
    throw new Error('Zyte HTTP 응답 본문이 비어 있습니다.');
  }

  return JSON.parse(decodeBase64(result.httpResponseBody)) as TResponse;
}
