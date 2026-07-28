/**
 * GS25 재고 원본 요청과 Zyte 대체 경로
 */

import { fetchJson, HttpError } from '../../utils/http.js';
import { decodeZyteHttpBody, requestByZyte } from '../../utils/zyte.js';
import { Gs25UpstreamUnavailableError } from './errors.js';
import type { Gs25StoreStockResponse } from './types.js';

interface StoreStockTransportOptions {
  timeout?: number;
  zyteApiKey?: string;
  apiKey?: string;
}

function withApiKey(headers: Record<string, string>, apiKey?: string): Record<string, string> {
  const normalizedApiKey = apiKey?.trim();
  return normalizedApiKey ? { ...headers, 'Api-Key': normalizedApiKey } : headers;
}

function isAuthenticationStatus(status?: number): boolean {
  return status === 401 || status === 403;
}

export async function fetchGs25StoreStockResponse(
  url: string,
  options: StoreStockTransportOptions,
  headers: Record<string, string>,
): Promise<Gs25StoreStockResponse> {
  const requestHeaders = withApiKey(headers, options.apiKey);

  try {
    return await fetchJson<Gs25StoreStockResponse>(url, {
      method: 'GET',
      timeout: options.timeout,
      retries: 1,
      retryDelayMs: 250,
      headers: requestHeaders,
    });
  } catch (error) {
    if (!(error instanceof HttpError) || !isAuthenticationStatus(error.status)) {
      throw error;
    }

    const zyteApiKey = options.zyteApiKey?.trim();
    if (error.status === 401 || !zyteApiKey) {
      throw new Gs25UpstreamUnavailableError();
    }

    try {
      const result = await requestByZyte({
        apiKey: zyteApiKey,
        url,
        method: 'GET',
        timeout: options.timeout,
        retries: 1,
        headers: Object.entries(requestHeaders).map(([name, value]) => ({ name, value })),
        tags: { service: 'gs25' },
      });
      if (isAuthenticationStatus(result.statusCode)) {
        throw new Gs25UpstreamUnavailableError();
      }
      return decodeZyteHttpBody<Gs25StoreStockResponse>(result);
    } catch (fallbackError) {
      if (fallbackError instanceof Gs25UpstreamUnavailableError) {
        throw fallbackError;
      }
      throw new Gs25UpstreamUnavailableError();
    }
  }
}
