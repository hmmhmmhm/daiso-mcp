/**
 * 운영용 상세 헬스 체크 라우트
 */

import type { Hono } from 'hono';
import { errorResponse, type AppBindings } from '../response.js';
import { runHealthChecks, type HealthCheckMode } from '../healthChecks.js';
import { authorizeOperationalRequest } from '../operationalAuth.js';

function parseBoolean(value: string | undefined): boolean {
  const normalized = (value || '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'y';
}

function isBetterStackHealthProbe(userAgent: string | undefined): boolean {
  const normalized = (userAgent || '').toLowerCase();
  return normalized.includes('better stack better uptime bot') || normalized === 'nginx-ssl early hints';
}

function isEarlyHintsProbe(userAgent: string | undefined): boolean {
  return (userAgent || '').trim().toLowerCase() === 'nginx-ssl early hints';
}

function canForceFresh(headers: Headers): boolean {
  return parseBoolean(headers.get('x-health-check-force-fresh') || undefined);
}

function isTrustedHealthTarget(target: RequestInfo | URL, requestUrl: string, configuredBaseUrl?: string): boolean {
  const allowedOrigins = new Set([new URL(requestUrl).origin]);
  if (configuredBaseUrl) {
    allowedOrigins.add(new URL(configuredBaseUrl).origin);
  }

  return allowedOrigins.has(new URL(String(target)).origin);
}

function parseMode(value: string | undefined): HealthCheckMode | null {
  if (!value || value === 'quick') {
    return 'quick';
  }
  if (value === 'deep' || value === 'full') {
    return value;
  }
  return null;
}

export function registerHealthRoutes(app: Hono<{ Bindings: AppBindings }>): void {
  app.get('/api/health/checks', async (c) => {
    const userAgent = c.req.header('User-Agent');
    if (isEarlyHintsProbe(userAgent)) {
      return c.body(null, 204);
    }

    const secret = c.env?.HEALTH_CHECK_SECRET?.trim();
    if (!secret) {
      return errorResponse(
        c,
        'HEALTH_CHECK_SECRET_NOT_CONFIGURED',
        'HEALTH_CHECK_SECRET이 설정되어 있지 않습니다.',
        503,
      );
    }

    if (authorizeOperationalRequest(c.req.raw.headers, secret) !== 'authorized') {
      return errorResponse(c, 'UNAUTHORIZED_HEALTH_CHECK', '유효한 헬스 체크 시크릿 키가 필요합니다.', 401);
    }

    const mode = parseMode(c.req.query('mode'));
    if (!mode) {
      return errorResponse(c, 'INVALID_HEALTH_CHECK_MODE', 'mode는 quick, deep, full 중 하나여야 합니다.', 400);
    }

    const timeoutMs = Number.parseInt(c.req.query('timeoutMs') || '3000', 10);
    const slowThresholdMs = Number.parseInt(
      c.req.query('slowThresholdMs') || c.env?.HEALTH_CHECK_SLOW_THRESHOLD_MS || '0',
      10,
    );
    const baseUrl = c.req.query('baseUrl')?.trim() || c.env?.HEALTH_CHECK_BASE_URL?.trim() || new URL(c.req.url).origin;
    const transport = c.req.query('transport') || c.env?.HEALTH_CHECK_TRANSPORT || 'internal';
    const cacheBust = parseBoolean(c.req.query('cacheBust')) || transport === 'network';
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (isTrustedHealthTarget(input, c.req.url, c.env?.HEALTH_CHECK_BASE_URL)) {
        headers.set('x-health-check-key', secret);
      }
      const requestInit = { ...init, headers };

      return transport !== 'network'
        ? app.fetch(new Request(input, requestInit), c.env)
        : globalThis.fetch(input, requestInit);
    };
    const result = await runHealthChecks({
      baseUrl,
      service: c.req.query('service') || undefined,
      check: c.req.query('check') || undefined,
      mode,
      timeoutMs,
      slowThresholdMs,
      includeSamples: parseBoolean(c.req.query('includeSamples')),
      fresh:
        parseBoolean(c.req.query('fresh')) &&
        canForceFresh(c.req.raw.headers) &&
        !isBetterStackHealthProbe(userAgent),
      cacheBust,
      fetchImpl,
    });

    return c.json(result);
  });
}
