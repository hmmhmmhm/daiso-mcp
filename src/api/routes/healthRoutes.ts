/**
 * 운영용 상세 헬스 체크 라우트
 */

import type { Hono } from 'hono';
import { errorResponse, type AppBindings } from '../response.js';
import { runHealthChecks } from '../healthChecks.js';

function parseBoolean(value: string | undefined): boolean {
  const normalized = (value || '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'y';
}

function readHealthCheckToken(headers: Headers): string {
  const authorization = headers.get('Authorization') || '';
  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice('bearer '.length).trim();
  }

  return (headers.get('x-health-check-key') || '').trim();
}

export function registerHealthRoutes(app: Hono<{ Bindings: AppBindings }>): void {
  app.get('/api/health/checks', async (c) => {
    const secret = c.env?.HEALTH_CHECK_SECRET?.trim();
    if (!secret) {
      return errorResponse(
        c,
        'HEALTH_CHECK_SECRET_NOT_CONFIGURED',
        'HEALTH_CHECK_SECRET이 설정되어 있지 않습니다.',
        503,
      );
    }

    if (readHealthCheckToken(c.req.raw.headers) !== secret) {
      return errorResponse(c, 'UNAUTHORIZED_HEALTH_CHECK', '유효한 헬스 체크 시크릿 키가 필요합니다.', 401);
    }

    const mode = c.req.query('mode') === 'deep' ? 'deep' : 'quick';
    const timeoutMs = Number.parseInt(c.req.query('timeoutMs') || '3000', 10);
    const result = await runHealthChecks({
      baseUrl: new URL(c.req.url).origin,
      service: c.req.query('service') || undefined,
      check: c.req.query('check') || undefined,
      mode,
      timeoutMs,
      includeSamples: parseBoolean(c.req.query('includeSamples')),
      fresh: parseBoolean(c.req.query('fresh')),
    });

    return c.json(result);
  });
}
