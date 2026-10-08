/** 주기 검사는 재고 중계를 소비하지 않고 직접 경로와 인증 상태만 기록합니다. */
import { cgvTransportFromBindings } from '../services/cgv/relayTransport.js';
import { ROUTE_KEYS, writeRouteChecks, type RouteCheck, type RelayCheck } from './routeHealth.js';
import { boundedRouteJson, checkDirectRoute } from './directRoutes.js';

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
  try {
    const result = await boundedRouteJson(url, { method: 'GET', headers }, 3000);
    if (!result || typeof result !== 'object' || Array.isArray(result))
      return failure('invalid-response');
    const data = result as Record<string, unknown>;
    const healthy = group === 'oliveyoung' ? data.state === 'ready' : data.status === 'ok';
    return healthy ? { group, healthy, checkedAt } : failure('unavailable');
  } catch {
    return failure('network-error');
  }
}

export async function refreshRouteChecks(env: RouteProbeBindings): Promise<void> {
  if (!env.UPSTREAM_ROUTE_HEALTH) return;
  const checks: RouteCheck[] = [];
  const relays: RelayCheck[] = [];
  const tasks: Array<() => Promise<void>> = ROUTE_KEYS.map((key) => async () => {
    const checkedAt = Date.now();
    try {
      checks.push(await checkDirectRoute(key));
    } catch {
      checks.push({ key, direct: false, checkedAt, reason: 'network-error' });
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
