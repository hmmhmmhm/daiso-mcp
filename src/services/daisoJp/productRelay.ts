/** 일본 상세와 제한된 검색 대체를 기존 인증 HTTP 중계에 연결합니다. */
import * as z from 'zod';
import { ServiceError } from '../../core/errors.js';
import { diagnosticHeaders } from '../../utils/diagnostics.js';
import { parseRelayQuota, type RelayQuota } from '../../utils/relayQuota.js';
import { parseRetryAfterDelayMs } from '../../utils/http.js';
import {
  dtryxTransportFromBindings,
  isValidDtryxRelayUrl,
  type DtryxTransportOptions,
} from '../dtryx/transport.js';
import { parseProductDetail, parseProductSearch } from './parser.js';
import type { JapanProduct } from './types.js';
export interface JapanProductRelayOptions extends DtryxTransportOptions {
  bypassCache?: boolean;
}
export interface JapanTransportOptions {
  productRelay?: JapanProductRelayOptions;
}
/** 인증 중계가 명시적으로 확인한 원본 제한이며 자체 한도와 구분합니다. */
export class JapanProductRateLimitError extends ServiceError {
  constructor(retryAfter?: number) {
    super(
      'DAISO_JP_RELAY_FAILED',
      '일본 다이소 중계 요청에 실패했습니다.',
      429,
      true,
      429,
      undefined,
      undefined,
      retryAfter,
    );
  }
}
export class JapanRelayQuotaError extends ServiceError {
  constructor(upstreamStatus: number, quota: RelayQuota) {
    super(
      'DAISO_JP_RELAY_FAILED',
      '일본 다이소 중계 요청에 실패했습니다.',
      429,
      true,
      upstreamStatus,
      quota,
      undefined,
      quota.retryAfter,
    );
  }
}
export function japanProductTransportFromBindings(
  bindings?: {
    DAISO_JP_PRODUCT_RELAY_ENABLED?: string;
    DTRYX_RELAY_URL?: string;
    DTRYX_RELAY_TOKEN?: string;
    DTRYX_ACCESS_CLIENT_ID?: string;
    DTRYX_ACCESS_CLIENT_SECRET?: string;
  },
  bypassCache = false,
): JapanTransportOptions {
  return bindings?.DAISO_JP_PRODUCT_RELAY_ENABLED === 'true'
    ? { productRelay: { ...dtryxTransportFromBindings(bindings), bypassCache } }
    : {};
}
async function requestJapanRelay<T>(
  operation: 'daiso-jp-product' | 'daiso-jp-search',
  body: unknown,
  options: JapanProductRelayOptions,
  parse: (value: unknown) => T,
): Promise<T> {
  const { relayUrl, relayToken, accessClientId, accessClientSecret } = options;
  if (
    !isValidDtryxRelayUrl(relayUrl) ||
    !relayToken?.trim() ||
    ((accessClientId !== undefined || accessClientSecret !== undefined) &&
      (!accessClientId?.trim() || !accessClientSecret?.trim()))
  ) {
    throw new ServiceError(
      'DAISO_JP_RELAY_CONFIG_ERROR',
      '일본 다이소 중계 설정을 확인하세요.',
      503,
      false,
    );
  }
  const headers: Record<string, string> = {
    ...diagnosticHeaders(),
    Authorization: `Bearer ${relayToken}`,
    'Content-Type': 'application/json',
  };
  if (options.bypassCache) headers['x-relay-cache-bypass'] = 'true';
  if (accessClientId && accessClientSecret) {
    headers['CF-Access-Client-Id'] = accessClientId;
    headers['CF-Access-Client-Secret'] = accessClientSecret;
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(
        new ServiceError(
          'DAISO_JP_RELAY_TIMEOUT',
          '일본 다이소 중계 요청 시간이 초과되었습니다.',
          504,
          true,
        ),
      );
    }, 15000);
  });
  try {
    const work = (async () => {
      const response = await fetch(`${relayUrl!.replace(/\/$/, '')}/v1/dtryx/${operation}`, {
        method: 'POST',
        redirect: 'manual',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (response.status !== 200) {
        void response.body?.cancel().catch(() => undefined);
        const status = response.status;
        const delay = status === 429 ? parseRetryAfterDelayMs(response) : null;
        const upstreamStatus = /^[1-5]\d{2}$/.test(
          response.headers.get('x-relay-upstream-status') ?? '',
        )
          ? Number(response.headers.get('x-relay-upstream-status'))
          : status;
        const retryAfter =
          delay === null ? undefined : Math.max(1, Math.min(86400, Math.ceil(delay / 1000)));
        if (
          status === 429 &&
          response.headers.get('x-relay-upstream-status') === '429' &&
          response.headers.get('x-relay-quota-reason') === null
        )
          throw new JapanProductRateLimitError(retryAfter);
        const quota = parseRelayQuota(status, response.headers);
        if (quota) throw new JapanRelayQuotaError(upstreamStatus, quota);
        throw new ServiceError(
          'DAISO_JP_RELAY_FAILED',
          '일본 다이소 중계 요청에 실패했습니다.',
          status === 429 || status === 503 || status === 504 ? status : 502,
          status === 429 || status >= 500,
          upstreamStatus,
          undefined,
          undefined,
          retryAfter,
        );
      }
      return parse(await response.json());
    })();
    return await Promise.race([work, timeout]);
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(
      'DAISO_JP_RELAY_FAILED',
      '일본 다이소 중계 응답을 확인할 수 없습니다.',
      502,
      true,
    );
  } finally {
    clearTimeout(timer!);
  }
}

export function requestJapanProductRelay(
  id: string,
  options: JapanProductRelayOptions,
): Promise<JapanProduct> {
  return requestJapanRelay('daiso-jp-product', { id }, options, (value) =>
    parseProductDetail(value, id),
  );
}

export function requestJapanSearchRelay(
  query: string,
  page: number,
  options: JapanProductRelayOptions,
) {
  return requestJapanRelay('daiso-jp-search', { query, page }, options, (value) =>
    parseProductSearch(z.object({ html: z.string() }).parse(value).html),
  );
}
