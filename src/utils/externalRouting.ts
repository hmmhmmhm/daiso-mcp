/** 내부 상태 바인딩을 같은 요청 수명에 연결합니다. */
import type { AppBindings } from '../api/response.js';
import { withRouteRouting } from './routeHealth.js';
import { withGeocodeProtection } from './geocodeFetch.js';
export function withExternalRouting<T>(
  env: AppBindings,
  executionCtx: ExecutionContext,
  work: () => T,
): T {
  return withGeocodeProtection(env, () =>
    withRouteRouting(env?.UPSTREAM_ROUTE_HEALTH, executionCtx?.waitUntil?.bind(executionCtx), work),
  );
}
