/** 내부 바인딩을 통해서만 접근하는 경로별 상태 저장소입니다. */
import {
  ROUTE_COOLDOWN_MS,
  isRouteKey,
  validRelayCheck,
  validRouteCheck,
  validTime,
  type RelayCheck,
  type RouteCheck,
  type RouteSnapshot,
} from '../utils/routeHealth.js';
const STORAGE_KEY = 'snapshot';
const empty = (): RouteSnapshot => ({ routes: {}, relays: {} });
export class UpstreamRouteHealth {
  constructor(private readonly state: DurableObjectState) {}
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (request.method === 'GET' && path === '/snapshot')
      return Response.json((await this.state.storage.get<RouteSnapshot>(STORAGE_KEY)) || empty());
    if (request.method !== 'POST' || !['/checks', '/failure'].includes(path))
      return new Response(null, { status: 404 });
    let input: Record<string, unknown>;
    try {
      const text = await request.text();
      if (text.length > 16384) return new Response(null, { status: 400 });
      const value: unknown = JSON.parse(text);
      if (!value || typeof value !== 'object' || Array.isArray(value))
        return new Response(null, { status: 400 });
      input = value as Record<string, unknown>;
    } catch {
      return new Response(null, { status: 400 });
    }
    if (path === '/checks') {
      if (
        !Array.isArray(input.checks) ||
        input.checks.length > 20 ||
        !input.checks.every(validRouteCheck) ||
        !Array.isArray(input.relays) ||
        input.relays.length > 3 ||
        !input.relays.every(validRelayCheck)
      )
        return new Response(null, { status: 400 });
      await this.state.storage.transaction(async (storage) => {
        const snapshot = (await storage.get<RouteSnapshot>(STORAGE_KEY)) || empty();
        for (const row of input.checks as RouteCheck[]) {
          const old = snapshot.routes[row.key];
          if (old && (row.checkedAt < old.checkedAt || row.checkedAt <= (old.failedAt ?? -1)))
            continue;
          const blocked = (old?.blockedUntil || 0) > Date.now();
          snapshot.routes[row.key] = {
            key: row.key,
            direct: row.key !== 'gs25-stock' && !blocked && row.direct,
            checkedAt: row.checkedAt,
            ...(row.reason === undefined ? {} : { reason: row.reason }),
            ...(old?.failedAt === undefined ? {} : { failedAt: old.failedAt }),
            ...(old?.blockedUntil === undefined ? {} : { blockedUntil: old.blockedUntil }),
          };
        }
        for (const row of input.relays as RelayCheck[]) {
          if (row.checkedAt < (snapshot.relays[row.group]?.checkedAt || 0)) continue;
          snapshot.relays[row.group] = {
            group: row.group,
            healthy: row.healthy,
            checkedAt: row.checkedAt,
            ...(row.reason === undefined ? {} : { reason: row.reason }),
          };
        }
        await storage.put(STORAGE_KEY, snapshot);
      });
    } else {
      if (!isRouteKey(input.key) || !validTime(input.at))
        return new Response(null, { status: 400 });
      const key = input.key;
      const at = input.at;
      await this.state.storage.transaction(async (storage) => {
        const snapshot = (await storage.get<RouteSnapshot>(STORAGE_KEY)) || empty();
        const old = snapshot.routes[key];
        if (!old || (at >= (old.failedAt ?? 0) && old.checkedAt < at + ROUTE_COOLDOWN_MS))
          snapshot.routes[key] = {
            key,
            direct: false,
            checkedAt: Math.max(old?.checkedAt ?? at, at),
            reason: 'unavailable',
            failedAt: at,
            blockedUntil: at + ROUTE_COOLDOWN_MS,
          };
        await storage.put(STORAGE_KEY, snapshot);
      });
    }
    return new Response(null, { status: 204 });
  }
}
