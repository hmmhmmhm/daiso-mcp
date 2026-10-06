/** 인증된 운영자만 사전 경로 점검 상태를 읽거나 갱신할 수 있습니다. */
import type { Hono } from 'hono';
import { errorResponse, type AppBindings } from '../response.js';
import { authorizeOperationalRequest } from '../operationalAuth.js';
import { readRouteSnapshot } from '../../utils/routeHealth.js';
import { refreshRouteChecks } from '../../utils/routeProbes.js';

export function registerRouteHealthRoutes(app: Hono<{ Bindings: AppBindings }>): void {
  app.on(['GET', 'POST'], '/api/health/routes', async (c) => {
    const authorization = await authorizeOperationalRequest(
      c.req.raw.headers,
      c.env?.HEALTH_CHECK_SECRET,
    );
    if (authorization === 'not-configured') {
      return errorResponse(
        c,
        'HEALTH_CHECK_SECRET_NOT_CONFIGURED',
        'HEALTH_CHECK_SECRET이 설정되어 있지 않습니다.',
        503,
      );
    }
    if (authorization !== 'authorized') {
      return errorResponse(
        c,
        'UNAUTHORIZED_HEALTH_CHECK',
        '유효한 헬스 체크 시크릿 키가 필요합니다.',
        401,
      );
    }
    const namespace = c.env.UPSTREAM_ROUTE_HEALTH;
    if (!namespace)
      return errorResponse(
        c,
        'ROUTE_HEALTH_NOT_CONFIGURED',
        '경로 점검 저장소가 설정되어 있지 않습니다.',
        503,
      );
    try {
      if (c.req.method === 'POST') await refreshRouteChecks(c.env);
      return c.json({ success: true, data: await readRouteSnapshot(namespace) });
    } catch {
      return errorResponse(c, 'ROUTE_HEALTH_FAILED', '경로 점검 상태를 확인하지 못했습니다.', 503);
    }
  });
}
