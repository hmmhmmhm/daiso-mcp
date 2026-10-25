/** 주기 검사는 재고 중계를 소비하지 않고 직접 경로와 인증 상태만 기록합니다. */
import { cgvTransportFromBindings } from '../services/cgv/relayTransport.js';
import { ROUTE_KEYS, writeRouteChecks, type RouteCheck, type RelayCheck } from './routeHealth.js';
import { boundedRouteJson, checkDirectRoute, DirectRouteError } from './directRoutes.js';
import { HttpError } from './http.js';

export interface RouteProbeBindings {
  UPSTREAM_ROUTE_HEALTH?: DurableObjectNamespace;
  CGV_RELAY_URL?: string;
  CGV_RELAY_TOKEN?: string;
  CGV_ACCESS_CLIENT_ID?: string;
  CGV_ACCESS_CLIENT_SECRET?: string;
  OY_RELAY_URL?: string;
  OY_RELAY_TOKEN?: string;
  OY_ACCESS_CLIENT_ID?: string;
  OY_ACCESS_CLIENT_SECRET?: string;
  CONVENIENCE_RELAY_URL?: string;
  CONVENIENCE_RELAY_TOKEN?: string;
  CONVENIENCE_ACCESS_CLIENT_ID?: string;
  CONVENIENCE_ACCESS_CLIENT_SECRET?: string;
  DTRYX_RELAY_URL?: string;
  DTRYX_RELAY_TOKEN?: string;
  DTRYX_ACCESS_CLIENT_ID?: string;
  DTRYX_ACCESS_CLIENT_SECRET?: string;
}

/** 예외 원문 대신 허용된 진단 코드만 저장합니다. */
function probeFailureReason(error: unknown): string {
  if (error instanceof HttpError)
    return Number.isInteger(error.status) && error.status >= 100 && error.status <= 599
      ? `http-${error.status}`
      : 'http-error';
  if (error instanceof DirectRouteError)
    return [
      'timeout',
      'network-error',
      'invalid-response',
      'response-too-large',
      'cancelled',
      'pinned-relay',
    ].includes(error.reason)
      ? error.reason
      : 'invalid-response';
  if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
  return 'network-error';
}

async function checkRelay(
  group: RelayCheck['group'],
  rawUrl: string | undefined,
  token: string | undefined,
  id: string | undefined,
  secret: string | undefined,
): Promise<RelayCheck> {
  const checkedAt = Date.now();
  const failure = (reason: string): RelayCheck => ({ group, healthy: false, checkedAt, reason });
  if (
    !rawUrl?.trim() ||
    !token?.trim() ||
    ((id !== undefined || secret !== undefined) && (!id?.trim() || !secret?.trim()))
  )
    return failure('configuration');
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return failure('configuration');
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
  )
    return failure('configuration');
  url.pathname = `${url.pathname.replace(/\/$/, '')}${group === 'oliveyoung' ? '/health' : `/v1/${group}/health`}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
  if (id && secret) {
    headers['CF-Access-Client-Id'] = id;
    headers['CF-Access-Client-Secret'] = secret;
  }
  const attempt = async (): Promise<RelayCheck> => {
    try {
      const result = await boundedRouteJson(url, { method: 'GET', headers }, 3000);
      if (!result || typeof result !== 'object' || Array.isArray(result))
        return failure('invalid-response');
      const data = result as Record<string, unknown>;
      const healthy = group === 'oliveyoung' ? data.state === 'ready' : data.status === 'ok';
      return healthy ? { group, healthy, checkedAt } : failure('unavailable');
    } catch (error) {
      return failure(probeFailureReason(error));
    }
  };
  const first = await attempt();
  // 일시적인 전송 장애만 건강 GET으로 한 번 확인합니다. 재고 요청은 재시도하지 않습니다.
  if (
    first.reason !== 'network-error' &&
    first.reason !== 'timeout' &&
    !/^http-5\d{2}$/.test(first.reason || '')
  )
    return first;
  const confirmed = await attempt();
  return confirmed.healthy ? { ...confirmed, reason: `recovered-${first.reason}` } : confirmed;
}

export async function refreshRouteChecks(env: RouteProbeBindings): Promise<void> {
  if (!env.UPSTREAM_ROUTE_HEALTH) return;
  const checks: RouteCheck[] = [];
  const relays: RelayCheck[] = [];
  const tasks: Array<() => Promise<void>> = ROUTE_KEYS.map((key) => async () => {
    const checkedAt = Date.now();
    try {
      checks.push(await checkDirectRoute(key));
    } catch (error) {
      checks.push({ key, direct: false, checkedAt, reason: probeFailureReason(error) });
    }
  });
  const cgv = cgvTransportFromBindings(env);
  const relayTasks = [
    ['cgv', cgv.cgvRelayUrl, cgv.cgvRelayToken, cgv.cgvAccessClientId, cgv.cgvAccessClientSecret],
    [
      'oliveyoung',
      env.OY_RELAY_URL,
      env.OY_RELAY_TOKEN,
      env.OY_ACCESS_CLIENT_ID,
      env.OY_ACCESS_CLIENT_SECRET,
    ],
    [
      'convenience',
      env.CONVENIENCE_RELAY_URL,
      env.CONVENIENCE_RELAY_TOKEN,
      env.CONVENIENCE_ACCESS_CLIENT_ID,
      env.CONVENIENCE_ACCESS_CLIENT_SECRET,
    ],
    [
      'dtryx',
      env.DTRYX_RELAY_URL,
      env.DTRYX_RELAY_TOKEN,
      env.DTRYX_ACCESS_CLIENT_ID,
      env.DTRYX_ACCESS_CLIENT_SECRET,
    ],
  ] as const;
  for (const [group, url, token, id, secret] of relayTasks)
    tasks.push(async () => {
      relays.push(await checkRelay(group, url, token, id, secret));
    });
  // 직접 검사와 헬스 검사를 합쳐 최대 네 연결만 사용합니다.
  for (let offset = 0; offset < tasks.length; offset += 4)
    await Promise.all(tasks.slice(offset, offset + 4).map((task) => task()));
  checks.sort((a, b) => ROUTE_KEYS.indexOf(a.key) - ROUTE_KEYS.indexOf(b.key));
  await writeRouteChecks(env.UPSTREAM_ROUTE_HEALTH, checks, relays);
}
