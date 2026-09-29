import { parseRelayQuota, type RelayQuota } from './relayQuota.js';
import { diagnosticEvent } from './diagnostics.js';
/**
 * 공용 HTTP 유틸리티
 */

export interface FetchOptions extends RequestInit {
  timeout?: number;
  /** fetchJson에서 허용할 정확한 HTTP 상태입니다. 생략하면 모든 2xx를 허용합니다. */
  expectedStatus?: number;
  retries?: number;
  retryDelayMs?: number;
  retryStatusCodes?: number[];
  retryUnsafeMethods?: boolean;
  retryMethods?: string[];
  onRetry?: (event: FetchRetryEvent) => void;
}

export interface FetchRetryEvent {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  reason: 'status' | 'error';
  status?: number;
  error?: unknown;
  method: string;
  url: string;
}

export class HttpError extends Error {
  readonly quota?: RelayQuota;
  readonly status: number;
  readonly statusText: string;
  readonly bodyText: string;

  constructor(status: number, statusText: string, bodyText: string, headers?: Headers) {
    const normalizedBody = bodyText.trim().replace(/\s+/g, ' ').slice(0, 300);
    const detail = normalizedBody.length > 0 ? ` - ${normalizedBody}` : '';
    super(`API 요청 실패: ${status} ${statusText}${detail}`);
    this.name = 'HttpError';
    this.status = status;
    this.statusText = statusText;
    this.bodyText = bodyText;
    this.quota = parseRelayQuota(status, headers);
  }
}

/** HTML 원문을 노출하지 않고 예상하지 못한 응답 형식을 구분합니다. */
export class UnexpectedHtmlResponseError extends Error {
  constructor(
    readonly status: number,
    readonly contentType: string,
  ) {
    super(`JSON 대신 HTML 응답을 받았습니다 (HTTP ${status}).`);
    this.name = 'UnexpectedHtmlResponseError';
  }
}

export function createTimeoutController(timeout: number): {
  controller: AbortController;
  timeoutId: ReturnType<typeof setTimeout>;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  return { controller, timeoutId };
}

const DEFAULT_RETRY_STATUS_CODES = [408, 429, 500, 502, 503, 504, 522, 524];
const DEFAULT_RETRY_METHODS = ['GET', 'HEAD', 'OPTIONS'];

function isRetryableStatus(status: number, retryStatusCodes: number[]): boolean {
  return retryStatusCodes.includes(status);
}

function wait(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeMethod(method: string | undefined): string {
  return (method || 'GET').toUpperCase();
}

function canRetryMethod(
  method: string,
  retryMethods: string[],
  retryUnsafeMethods: boolean,
): boolean {
  return retryUnsafeMethods || retryMethods.map((item) => item.toUpperCase()).includes(method);
}

function parseRetryAfterDelayMs(response: Response): number | null {
  const retryAfter = response.headers.get('retry-after');
  if (!retryAfter) {
    return null;
  }

  const seconds = Number.parseFloat(retryAfter);
  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.trunc(seconds * 1000));
  }

  const retryDate = Date.parse(retryAfter);
  if (Number.isFinite(retryDate)) {
    return Math.max(0, retryDate - Date.now());
  }

  return null;
}

async function requestWithTimeout<T>(
  url: string,
  options: FetchOptions,
  readResponse: (response: Response) => Promise<T>,
): Promise<T> {
  const {
    timeout = 10000,
    retries = 0,
    retryDelayMs = 250,
    retryStatusCodes = DEFAULT_RETRY_STATUS_CODES,
    retryUnsafeMethods = false,
    retryMethods = DEFAULT_RETRY_METHODS,
    onRetry,
    expectedStatus: _expectedStatus,
    ...restOptions
  } = options;
  const maxAttempts = Math.max(1, Math.trunc(retries) + 1);
  const method = normalizeMethod(restOptions.method);
  const retryAllowed = canRetryMethod(method, retryMethods, retryUnsafeMethods);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { controller, timeoutId } = createTimeoutController(timeout);
    let readingResponse = false;
    const started = Date.now();
    let responseStatus: number | undefined;

    try {
      const response = await fetch(url, {
        ...restOptions,
        signal: controller.signal,
      });

      responseStatus = response.status;
      diagnosticEvent({ stage: 'http', outcome: response.ok ? 'ok' : 'error', status: response.status, durationMs: Date.now() - started });
      if (
        retryAllowed &&
        attempt < maxAttempts &&
        isRetryableStatus(response.status, retryStatusCodes)
      ) {
        const delayMs = parseRetryAfterDelayMs(response) ?? retryDelayMs;
        onRetry?.({
          attempt,
          maxAttempts,
          delayMs,
          reason: 'status',
          status: response.status,
          method,
          url,
        });
        await response.body?.cancel();
        await wait(delayMs);
        continue;
      }

      readingResponse = true;
      return await readResponse(response);
    } catch (error) {
      diagnosticEvent({ stage: 'http', outcome: 'error', status: responseStatus, durationMs: Date.now() - started });
      if (readingResponse || !retryAllowed || attempt >= maxAttempts) {
        throw error;
      }

      onRetry?.({
        attempt,
        maxAttempts,
        delayMs: retryDelayMs,
        reason: 'error',
        error,
        method,
        url,
      });
      await wait(retryDelayMs);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /* v8 ignore next */
  throw new Error('API 요청 재시도 처리 중 알 수 없는 오류가 발생했습니다.');
}

export async function fetchWithTimeout(url: string, options: FetchOptions = {}): Promise<Response> {
  return requestWithTimeout(url, options, async (response) => response);
}

async function readTextResponse(url: string, options: FetchOptions) {
  // 헤더 수신뿐 아니라 본문 읽기에도 같은 요청 제한 시간을 적용합니다.
  return requestWithTimeout(url, options, async (response) => ({
    response,
    body: await response.text(),
  }));
}

export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const { response, body } = await readTextResponse(url, options);

  if (!response.ok || (options.expectedStatus !== undefined && response.status !== options.expectedStatus)) {
    throw new HttpError(response.status, response.statusText, body, response.headers);
  }

  if (/^\s*(?:<!doctype\s+html\b|<html\b)/i.test(body)) {
    throw new UnexpectedHtmlResponseError(
      response.status,
      response.headers.get('content-type') || '',
    );
  }
  return JSON.parse(body) as T;
}

export async function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  const { response, body } = await readTextResponse(url, options);

  if (!response.ok) {
    throw new HttpError(response.status, response.statusText, body, response.headers);
  }

  return body;
}
