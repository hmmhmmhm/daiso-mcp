import { requestDirectRoute } from '../../utils/directRoutes.js';
import { routeOperation, type RouteKey } from '../../utils/routeHealth.js';
import { diagnosticHeaders, relayConsumer } from '../../utils/diagnostics.js';
/** 올리브영 무료 직접 요청 및 운영자가 설정한 브라우저 릴레이 전송. */
import { createRelayCooldown, relayCredentialScope } from '../../utils/relayQuota.js';
import { HttpError, fetchJson } from '../../utils/http.js';
import { toOliveyoungRelayError } from './errors.js';
import { OLIVEYOUNG_API } from './api.js';
import type { OliveyoungApiResponse } from './types.js';

const cooldown = createRelayCooldown();
const MAX_BUSY_RETRIES = 24;

/** 소비자의 일시 점유는 유한한 대기로 복구하고 취소 시 타이머를 정리합니다. */
function waitForBusy(delay: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(new DOMException('Request cancelled', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, delay);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

export interface OliveyoungRequestOptions {
  /** 기존 호출부와의 호환용이며 유료 요청에는 사용하지 않습니다. */
  apiKey?: string;
  timeout?: number;
  signal?: AbortSignal;
  relayUrl?: string;
  relayToken?: string;
  accessClientId?: string;
  accessClientSecret?: string;
}

/** 설정 진단과 실제 요청에 같은 릴레이 URL 규칙을 적용합니다. */
export function isValidOliveyoungRelayUrl(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  let relay: URL;
  try {
    relay = new URL(value);
  } catch {
    return false;
  }
  return !(
    relay.username ||
    relay.password ||
    relay.search ||
    relay.hash ||
    (relay.protocol !== 'https:' &&
      !(relay.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(relay.hostname)))
  );
}

const operationKeys: Record<string, RouteKey> = {
  [OLIVEYOUNG_API.STORE_FINDER_PATH]: 'oy-find-store',
  [OLIVEYOUNG_API.PRODUCT_SEARCH_PATH]: 'oy-product-search',
  [OLIVEYOUNG_API.STOCK_GOODS_INFO_PATH]: 'oy-goods-info',
  [OLIVEYOUNG_API.STOCK_STORES_PATH]: 'oy-stock-stores',
};
export async function requestOliveyoung(
  path: string,
  body: Record<string, unknown>,
  options: OliveyoungRequestOptions = {},
): Promise<OliveyoungApiResponse> {
  const key = operationKeys[path];
  if (!options.relayUrl || !key) return requestOliveyoungRaw(path, body, options);
  validateRelay(options);
  return routeOperation(
    key,
    options.timeout ?? 60000,
    (ms) => requestDirectRoute<OliveyoungApiResponse>(key, body, ms, options.signal),
    (ms) => requestOliveyoungRaw(path, body, { ...options, timeout: ms }),
    options.signal,
  );
}
function validateRelay(options: OliveyoungRequestOptions): void {
  if (!isValidOliveyoungRelayUrl(options.relayUrl)) {
    throw new Error('올리브영 릴레이 URL은 HTTPS 또는 로컬 HTTP 주소여야 합니다.');
  }
  if (!options.relayToken?.trim()) throw new Error('OY_RELAY_TOKEN이 필요합니다.');
  if (options.accessClientId !== undefined || options.accessClientSecret !== undefined) {
    if (!options.accessClientId?.trim() || !options.accessClientSecret?.trim()) {
      throw new Error('올리브영 Access 서비스 토큰 설정이 필요합니다.');
    }
  }
}

async function requestOliveyoungRaw(
  path: string,
  body: Record<string, unknown>,
  options: OliveyoungRequestOptions = {},
): Promise<OliveyoungApiResponse> {
  const { relayUrl, relayToken, timeout = relayUrl ? 60000 : 15000 } = options;
  const deadline = Date.now() + timeout;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  };
  let scope = '';
  let consumer = 'legacy';
  let url = `${OLIVEYOUNG_API.BASE_URL}${path}`;
  if (relayUrl) {
    validateRelay(options);
    url = `${relayUrl.replace(/\/$/, '')}/v1/oliveyoung/${path.split('/').pop()}`;
    Object.assign(headers, diagnosticHeaders());
    headers.Authorization = `Bearer ${relayToken}`;
    consumer = (await relayConsumer(relayToken!)) || 'legacy';
    if (consumer !== 'legacy') headers['x-relay-consumer'] = consumer;
    const { accessClientId, accessClientSecret } = options;
    if (accessClientId !== undefined || accessClientSecret !== undefined) {
      headers['CF-Access-Client-Id'] = accessClientId!;
      headers['CF-Access-Client-Secret'] = accessClientSecret!;
    }
  } else {
    // 공식 사이트 직접 조회용 헤더는 운영자 릴레이에 전달하지 않습니다.
    headers['User-Agent'] =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';
    headers.Origin = OLIVEYOUNG_API.BASE_URL;
    headers.Referer = `${OLIVEYOUNG_API.BASE_URL}/`;
    headers['Accept-Language'] = 'ko-KR,ko;q=0.9';
  }
  if (relayUrl) {
    scope = await relayCredentialScope([
      relayUrl.replace(/\/$/, ''),
      relayToken,
      options.accessClientId,
      options.accessClientSecret,
    ]);
  }
  let busyRetries = 0;
  while (true) {
    let result: OliveyoungApiResponse;
    const cachedQuota = relayUrl ? cooldown.get(scope, consumer) : undefined;
    try {
      const remaining = deadline - Date.now();
      if (options.signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
      if (remaining <= 0) throw new DOMException('Request deadline exceeded', 'AbortError');
      if (cachedQuota)
        throw new HttpError(
          429,
          '',
          '',
          new Headers({
            'x-relay-quota-reason': cachedQuota.quotaReason,
            'retry-after': String(cachedQuota.retryAfter),
          }),
        );
      result = await fetchJson<OliveyoungApiResponse>(url, {
        method: 'POST',
        // Workers는 error 모드를 지원하지 않으므로 따라가지 않고 아래 200 검사로 거절합니다.
        redirect: 'manual',
        headers,
        body: JSON.stringify(body),
        timeout: remaining,
        signal: options.signal,
        retries: 0,
        expectedStatus: 200,
      });
    } catch (error) {
      if (relayUrl) {
        if (error instanceof HttpError && error.quota) {
          if (!cachedQuota) cooldown.set(scope, consumer, error.quota);
          if (error.quota.quotaReason === 'consumer-busy' && busyRetries < MAX_BUSY_RETRIES) {
            const delay = (busyRetries === 0 ? 1000 : 2000) + Math.floor(Math.random() * 250);
            if (deadline - Date.now() > delay) {
              busyRetries += 1;
              try {
                await waitForBusy(delay, options.signal);
              } catch (cancelled) {
                throw toOliveyoungRelayError(cancelled);
              }
              continue;
            }
          }
        }
        throw toOliveyoungRelayError(error);
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('올리브영 API 요청 시간 초과');
      }
      throw new Error(
        '올리브영 직접 요청 실패. 운영자는 OY_RELAY_URL과 OY_RELAY_TOKEN으로 브라우저 릴레이를 설정해주세요.',
        { cause: error },
      );
    }
    if (result?.status !== 'SUCCESS') {
      if (relayUrl) throw toOliveyoungRelayError(new SyntaxError());
      throw new Error(`올리브영 API 상태 오류: ${result?.status || 'UNKNOWN'}`);
    }
    return result;
  }
}
