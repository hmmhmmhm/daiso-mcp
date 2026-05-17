/**
 * 앱 통합 테스트 - 개별 헬스 체크 API
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import app from '../../src/index.js';
import { __testOnlyClearHealthCheckCache } from '../../src/api/healthChecks.js';
import { registerHealthRoutes } from '../../src/api/routes/healthRoutes.js';
import type { AppBindings } from '../../src/api/response.js';
import { setupFetchMock } from './testHelpers.js';

const mockFetch = vi.fn();
setupFetchMock(mockFetch);

beforeEach(() => {
  __testOnlyClearHealthCheckCache();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('GET /api/health/checks', () => {
  it('HEALTH_CHECK_SECRET이 설정되지 않으면 503을 반환한다', async () => {
    const res = await app.request('/api/health/checks');

    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('HEALTH_CHECK_SECRET_NOT_CONFIGURED');
  });

  it('시크릿 키가 없거나 틀리면 401을 반환한다', async () => {
    const missing = await app.request('/api/health/checks', undefined, {
      HEALTH_CHECK_SECRET: 'test-secret',
    });
    expect(missing.status).toBe(401);

    const invalid = await app.request(
      '/api/health/checks',
      {
        headers: { 'x-health-check-key': 'wrong-secret' },
      },
      {
        HEALTH_CHECK_SECRET: 'test-secret',
      },
    );
    expect(invalid.status).toBe(401);
  });

  it('인증 후 개별 체크를 실행하고 샘플을 포함한다', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          products: [{ productName: '코카콜라 (215ML*6입)' }],
        },
        meta: { total: 1 },
      }),
    );

    const res = await app.request(
      '/api/health/checks?check=lottemart.products&includeSamples=true&timeoutMs=1234&fresh=true',
      {
        headers: { Authorization: 'Bearer test-secret' },
      },
      {
        HEALTH_CHECK_SECRET: 'test-secret',
      },
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.checks).toHaveLength(1);
    expect(data.checks[0]).toEqual(
      expect.objectContaining({
        id: 'lottemart.products',
        service: 'lottemart',
        target: 'products',
        status: 'ok',
        sample: { first: '코카콜라 (215ML*6입)' },
      }),
    );
    expect(String(mockFetch.mock.calls[0][0])).toContain('/api/lottemart/products');
    expect(String(mockFetch.mock.calls[0][0])).toContain('timeoutMs=1234');
  });

  it('HEALTH_CHECK_BASE_URL이 있으면 내부 체크 기준 URL로 사용한다', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          products: [{ productName: '코카콜라' }],
        },
        meta: { total: 1 },
      }),
    );

    const res = await app.request(
      'https://mcp.aka.page/api/health/checks?check=lottemart.products&fresh=true',
      {
        headers: { Authorization: 'Bearer test-secret' },
      },
      {
        HEALTH_CHECK_SECRET: 'test-secret',
        HEALTH_CHECK_BASE_URL: 'https://daiso-mcp.example.workers.dev',
        HEALTH_CHECK_TRANSPORT: 'network',
      },
    );

    expect(res.status).toBe(200);
    expect(String(mockFetch.mock.calls[0][0])).toMatch(/^https:\/\/daiso-mcp\.example\.workers\.dev\/api\/lottemart\/products/);
  });

  it('HEALTH_CHECK_BASE_URL이 있으면 같은 앱으로 내부 체크를 dispatch한다', async () => {
    const testApp = new Hono<{ Bindings: AppBindings }>();
    testApp.get('/api/daiso/products', (c) =>
      c.json({
        success: true,
        data: {
          products: [{ productName: '테이프' }],
        },
        meta: { total: 1 },
      }),
    );
    registerHealthRoutes(testApp);

    const res = await testApp.request(
      '/api/health/checks?check=daiso.products&fresh=true',
      {
        headers: { Authorization: 'Bearer test-secret' },
      },
      {
        HEALTH_CHECK_SECRET: 'test-secret',
        HEALTH_CHECK_BASE_URL: 'https://daiso-mcp.example.workers.dev',
      },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(
      expect.objectContaining({
        status: 'ok',
        checks: [
          expect.objectContaining({
            id: 'daiso.products',
            status: 'ok',
          }),
        ],
      }),
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('service 필터로 여러 체크를 실행하고 실패를 집계한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: { products: [{ itemName: '콜라' }] },
          meta: { total: 1 },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ success: false, error: { message: 'upstream fail' } }, 500));

    const res = await app.request(
      '/api/health/checks?service=gs25&fresh=true',
      {
        headers: { 'x-health-check-key': 'test-secret' },
      },
      {
        HEALTH_CHECK_SECRET: 'test-secret',
      },
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('fail');
    expect(data.checks.map((check: { id: string }) => check.id)).toEqual(['gs25.products', 'gs25.stores']);
    expect(data.checks.map((check: { status: string }) => check.status)).toEqual(['ok', 'fail']);
  });

  it('대표 컬렉션 shape가 바뀌면 degraded로 감지한다', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          products: [{ unexpectedName: '콜라' }],
        },
        meta: { total: 1 },
      }),
    );

    const res = await app.request(
      '/api/health/checks?check=gs25.products&fresh=true',
      {
        headers: { Authorization: 'Bearer test-secret' },
      },
      {
        HEALTH_CHECK_SECRET: 'test-secret',
      },
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('degraded');
    expect(data.checks[0]).toEqual(
      expect.objectContaining({
        id: 'gs25.products',
        status: 'degraded',
        message: expect.stringContaining('required fields'),
      }),
    );
  });

  it('fresh가 아니면 동일한 체크 결과를 캐시한다', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: true,
        data: { products: [{ name: '상품' }] },
        meta: { total: 1 },
      }),
    );

    const requestInit = {
      headers: { Authorization: 'Bearer test-secret' },
    };
    const env = { HEALTH_CHECK_SECRET: 'test-secret' };

    const first = await app.request('/api/health/checks?check=daiso.products', requestInit, env);
    const second = await app.request('/api/health/checks?check=daiso.products', requestInit, env);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect((await second.json()).cached).toBe(true);
  });

  it('deep 모드와 y 플래그를 파싱하고 CLI 계약 체크를 실행한다', async () => {
    mockFetch.mockImplementation((input: RequestInfo | URL) =>
      Promise.resolve(
        String(input).includes('/health')
          ? jsonResponse({ status: 'ok' })
          : jsonResponse({ success: true, data: { products: [{ name: '상품' }] }, meta: { total: 1 } }),
      ),
    );

    const res = await app.request(
      '/api/health/checks?mode=deep&includeSamples=y',
      {
        headers: { Authorization: 'Bearer test-secret' },
      },
      {
        HEALTH_CHECK_SECRET: 'test-secret',
      },
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.filters.mode).toBe('deep');
    expect(data.checks).toEqual([
      expect.objectContaining({
        id: 'cli.contract',
        status: 'ok',
      }),
    ]);
  });
});
