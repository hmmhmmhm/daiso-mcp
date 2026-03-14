/**
 * 공용 HTTP 유틸리티
 */

export interface FetchOptions extends RequestInit {
  timeout?: number;
}

export class HttpError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly bodyText: string;

  constructor(status: number, statusText: string, bodyText: string) {
    const normalizedBody = bodyText.trim().replace(/\s+/g, ' ').slice(0, 300);
    const detail = normalizedBody.length > 0 ? ` - ${normalizedBody}` : '';
    super(`API 요청 실패: ${status} ${statusText}${detail}`);
    this.name = 'HttpError';
    this.status = status;
    this.statusText = statusText;
    this.bodyText = bodyText;
  }
}

export function createTimeoutController(
  timeout: number,
): { controller: AbortController; timeoutId: ReturnType<typeof setTimeout> } {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  return { controller, timeoutId };
}

export async function fetchWithTimeout(url: string, options: FetchOptions = {}): Promise<Response> {
  const { timeout = 10000, ...restOptions } = options;
  const { controller, timeoutId } = createTimeoutController(timeout);

  try {
    return await fetch(url, {
      ...restOptions,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const response = await fetchWithTimeout(url, options);

  if (!response.ok) {
    throw new HttpError(response.status, response.statusText, await response.text());
  }

  return response.json() as Promise<T>;
}

export async function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  const response = await fetchWithTimeout(url, options);

  if (!response.ok) {
    throw new HttpError(response.status, response.statusText, await response.text());
  }

  return response.text();
}
