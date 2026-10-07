import { parseSevenStockFailure, EXTERNAL_SERVICE_RETRY_HINT } from './sevenStockFailure.js';
/** 편의점 공통 릴레이 설정과 인증 전송입니다. */
import { requestDirectRoute } from './directRoutes.js';
import { isRouteKey, routeOperation } from './routeHealth.js';
import { ServiceError } from '../core/errors.js';
import { diagnosticHeaders } from './diagnostics.js';
import { isValidDtryxRelayUrl } from '../services/dtryx/transport.js';
import { createTimeoutController, parseRetryAfterDelayMs } from './http.js';
import { parseRelayQuota } from './relayQuota.js';
export interface ConvenienceTransportOptions {
  convenienceRelayUrl?: string;
  convenienceRelayToken?: string;
  convenienceAccessClientId?: string;
  convenienceAccessClientSecret?: string;
}
export function convenienceTransportFromBindings(bindings?: {
  CONVENIENCE_RELAY_URL?: string;
  CONVENIENCE_RELAY_TOKEN?: string;
  CONVENIENCE_ACCESS_CLIENT_ID?: string;
  CONVENIENCE_ACCESS_CLIENT_SECRET?: string;
}): ConvenienceTransportOptions {
  return {
    convenienceRelayUrl: bindings?.CONVENIENCE_RELAY_URL,
    convenienceRelayToken: bindings?.CONVENIENCE_RELAY_TOKEN,
    convenienceAccessClientId: bindings?.CONVENIENCE_ACCESS_CLIENT_ID,
    convenienceAccessClientSecret: bindings?.CONVENIENCE_ACCESS_CLIENT_SECRET,
  };
}
export function hasConvenienceRelay(options: ConvenienceTransportOptions): boolean {
  return [
    options.convenienceRelayUrl,
    options.convenienceRelayToken,
    options.convenienceAccessClientId,
    options.convenienceAccessClientSecret,
  ].some((v) => v !== undefined);
}
export async function requestConvenienceRelay<T>(
  operation: string,
  body: unknown,
  options: ConvenienceTransportOptions,
  timeout = 15000,
): Promise<T> {
  validateRelay(options);
  if (!isRouteKey(operation)) return requestConvenienceRelayRaw(operation, body, options, timeout);
  return routeOperation(
    operation,
    timeout,
    (ms) => requestDirectRoute<T>(operation, body, ms),
    (ms) => requestConvenienceRelayRaw<T>(operation, body, options, ms),
  );
}
function validateRelay(options: ConvenienceTransportOptions): void {
  const {
    convenienceRelayUrl: url,
    convenienceRelayToken: token,
    convenienceAccessClientId: id,
    convenienceAccessClientSecret: secret,
  } = options;
  const access = id !== undefined || secret !== undefined;
  if (
    !isValidDtryxRelayUrl(url) ||
    !token?.trim() ||
    (access && (!id?.trim() || !secret?.trim()))
  ) {
    throw new ServiceError(
      'CONVENIENCE_RELAY_CONFIG_ERROR',
      '편의점 릴레이 URL, 토큰 및 Access 설정을 확인하세요.',
      503,
      false,
    );
  }
}

async function requestConvenienceRelayRaw<T>(
  operation: string,
  body: unknown,
  options: ConvenienceTransportOptions,
  timeout = 15000,
): Promise<T> {
  const {
    convenienceRelayUrl: url,
    convenienceRelayToken: token,
    convenienceAccessClientId: id,
    convenienceAccessClientSecret: secret,
  } = options;
  const access = id !== undefined || secret !== undefined;
  const headers: Record<string, string> = {
    ...diagnosticHeaders(),
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
  if (access) {
    headers['CF-Access-Client-Id'] = id!;
    headers['CF-Access-Client-Secret'] = secret!;
  }
  let requestBody: string | undefined;
  try {
    requestBody = JSON.stringify(body);
  } catch {
    throw new ServiceError(
      'CONVENIENCE_RELAY_FAILED',
      '편의점 릴레이 요청에 실패했습니다.',
      502,
      false,
    );
  }
  const retryRead = operation === 'gs25-stock' || operation === 'gs25-products';
  const budget = retryRead ? Math.min(timeout, 15000) : timeout;
  const deadline = Date.now() + budget;
  const maxAttempts = retryRead ? 2 : 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const remaining = deadline - Date.now();
    if (retryRead && remaining <= 0) {
      throw new ServiceError(
        'CONVENIENCE_RELAY_TIMEOUT',
        '편의점 릴레이 요청 시간이 초과되었습니다.',
        504,
        true,
      );
    }
    const attemptTimeout =
      retryRead && attempt === 1 ? Math.max(1, Math.floor((budget - 250) / 2)) : remaining;
    const { controller, timeoutId } = createTimeoutController(Math.min(attemptTimeout, remaining));
    let readingResponse = false;
    try {
      const response = await fetch(`${url!.replace(/\/$/, '')}/v1/convenience/${operation}`, {
        method: 'POST',
        headers,
        body: requestBody,
        redirect: 'manual',
        signal: controller.signal,
      });
      if (response.status !== 200) {
        if (operation === 'seven-stock' && response.status === 502) {
          const data: unknown = await response.json().catch(() => undefined);
          const failure = parseSevenStockFailure(
            data && typeof data === 'object'
              ? (data as Record<string, unknown>).upstreamError
              : undefined,
          );
          if (failure)
            throw new ServiceError(
              'CONVENIENCE_RELAY_FAILED',
              `${failure.message} ${EXTERNAL_SERVICE_RETRY_HINT}`,
              502,
              false,
              failure.status,
              undefined,
              failure,
            );
        } else void response.body?.cancel().catch(() => undefined);
        const status = response.status;
        const delay = parseRetryAfterDelayMs(response) ?? 250;
        if (
          retryRead &&
          attempt < maxAttempts &&
          [502, 503, 504].includes(status) &&
          delay < deadline - Date.now()
        ) {
          clearTimeout(timeoutId);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw new ServiceError(
          'CONVENIENCE_RELAY_FAILED',
          '편의점 릴레이 요청에 실패했습니다.',
          status === 429 || status === 503 || status === 504 ? status : 502,
          status === 429 || status >= 500,
          status,
          parseRelayQuota(status, response.headers),
        );
      }
      readingResponse = true;
      const data: unknown = await response.json();
      if (
        !data ||
        typeof data !== 'object' ||
        Array.isArray(data) ||
        ('success' in data && data.success === false) ||
        'error' in data ||
        ('resp_cd' in data && data.resp_cd !== '0000')
      )
        throw Error('Invalid response');
      return data as T;
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      if (!readingResponse && retryRead && attempt < maxAttempts && 250 < deadline - Date.now()) {
        clearTimeout(timeoutId);
        await new Promise((resolve) => setTimeout(resolve, 250));
        continue;
      }
      if (controller.signal.aborted)
        throw new ServiceError(
          'CONVENIENCE_RELAY_TIMEOUT',
          '편의점 릴레이 요청 시간이 초과되었습니다.',
          504,
          true,
        );
      throw new ServiceError(
        'CONVENIENCE_RELAY_FAILED',
        '편의점 릴레이 요청에 실패했습니다.',
        502,
        true,
      );
    } finally {
      clearTimeout(timeoutId);
      controller.abort();
    }
  }
  /* v8 ignore next */
  throw new Error('편의점 릴레이 요청을 완료하지 못했습니다.');
}
