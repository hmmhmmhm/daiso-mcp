/** 일본 상세만 기존 인증 HTTP 중계에 명시적으로 연결합니다. */
import { ServiceError } from '../../core/errors.js';
import { diagnosticHeaders } from '../../utils/diagnostics.js';
import { parseRelayQuota } from '../../utils/relayQuota.js';
import { dtryxTransportFromBindings, isValidDtryxRelayUrl, type DtryxTransportOptions } from '../dtryx/transport.js';
import { parseProductDetail } from './parser.js';
import type { JapanProduct } from './types.js';
export interface JapanProductRelayOptions extends DtryxTransportOptions { bypassCache?: boolean }
export interface JapanTransportOptions { productRelay?: JapanProductRelayOptions }
export function japanProductTransportFromBindings(bindings?: {
 DAISO_JP_PRODUCT_RELAY_ENABLED?: string;
 DTRYX_RELAY_URL?: string; DTRYX_RELAY_TOKEN?: string;
 DTRYX_ACCESS_CLIENT_ID?: string; DTRYX_ACCESS_CLIENT_SECRET?: string;
}, bypassCache = false): JapanTransportOptions {
 return bindings?.DAISO_JP_PRODUCT_RELAY_ENABLED === 'true'
  ? { productRelay: { ...dtryxTransportFromBindings(bindings), bypassCache } } : {};
}
export async function requestJapanProductRelay(id: string, options: JapanProductRelayOptions): Promise<JapanProduct> {
 const { relayUrl, relayToken, accessClientId, accessClientSecret } = options;
 if (!isValidDtryxRelayUrl(relayUrl) || !relayToken?.trim() ||
  ((accessClientId !== undefined || accessClientSecret !== undefined) && (!accessClientId?.trim() || !accessClientSecret?.trim()))) {
  throw new ServiceError('DAISO_JP_RELAY_CONFIG_ERROR', '일본 다이소 중계 설정을 확인하세요.', 503, false);
 }
 const headers: Record<string, string> = { ...diagnosticHeaders(), Authorization: `Bearer ${relayToken}`, 'Content-Type': 'application/json' };
 if (options.bypassCache) headers['x-relay-cache-bypass'] = 'true';
 if (accessClientId && accessClientSecret) {
  headers['CF-Access-Client-Id'] = accessClientId;
  headers['CF-Access-Client-Secret'] = accessClientSecret;
 }
 const controller = new AbortController();
 let timer: ReturnType<typeof setTimeout>;
 const timeout = new Promise<never>((_, reject) => {
  timer = setTimeout(() => { controller.abort(); reject(new ServiceError('DAISO_JP_RELAY_TIMEOUT', '일본 다이소 중계 요청 시간이 초과되었습니다.', 504, true)); }, 15000);
 });
 try {
  const work = (async () => {
   const response = await fetch(`${relayUrl!.replace(/\/$/, '')}/v1/dtryx/daiso-jp-product`, {
    method: 'POST', redirect: 'manual', headers, body: JSON.stringify({ id }), signal: controller.signal,
   });
   if (response.status !== 200) {
    void response.body?.cancel().catch(() => undefined);
    const status = response.status;
    throw new ServiceError('DAISO_JP_RELAY_FAILED', '일본 다이소 중계 요청에 실패했습니다.',
     status === 429 || status === 503 || status === 504 ? status : 502,
     status === 429 || status >= 500, status, parseRelayQuota(status, response.headers));
   }
   return parseProductDetail(await response.json(), id);
  })();
  return await Promise.race([work, timeout]);
 } catch (error) {
  if (error instanceof ServiceError) throw error;
  throw new ServiceError('DAISO_JP_RELAY_FAILED', '일본 다이소 중계 응답을 확인할 수 없습니다.', 502, true);
 } finally { clearTimeout(timer!); }
}
