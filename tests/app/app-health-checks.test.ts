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
      '/api/health/checks?check=lottemart.products&includeSamples=true&timeoutMs=1234&fresh=true&transport=network',
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

  it('기본 internal transport는 같은 앱으로 내부 체크를 dispatch한다', async () => {
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
      'https://mcp.aka.page/api/health/checks?check=daiso.products&fresh=true',
      {
        headers: { Authorization: 'Bearer test-secret' },
      },
      {
        HEALTH_CHECK_SECRET: 'test-secret',
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
      '/api/health/checks?service=gs25&fresh=true&transport=network',
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
      '/api/health/checks?check=gs25.products&fresh=true&transport=network',
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

  it('이마트24 상품 upstream 403은 degraded로 집계한다', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        {
          success: false,
          error: { message: 'API 요청 실패: 403 Forbidden - <!DOCTYPE html><title>403 Forbidden</title>' },
        },
        502,
      ),
    );

    const res = await app.request(
      '/api/health/checks?check=emart24.products&fresh=true&transport=network',
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
        id: 'emart24.products',
        status: 'degraded',
        message: expect.stringContaining('403 Forbidden'),
      }),
    );
  });

  it('세븐일레븐 상품 upstream Incapsula 403은 degraded로 집계한다', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        {
          success: false,
          error: {
            message:
              'API 요청 실패: 403 Forbidden - <html><META NAME="ROBOTS" CONTENT="NOINDEX, NOFOLLOW"><script src="/_Incapsula_Resource"></script>',
          },
        },
        502,
      ),
    );

    const res = await app.request(
      '/api/health/checks?check=seveneleven.products&fresh=true&transport=network',
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
        id: 'seveneleven.products',
        status: 'degraded',
        message: expect.stringContaining('403 Forbidden'),
      }),
    );
  });

  it('세븐일레븐 재고 upstream Incapsula 403은 degraded로 집계한다', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        {
          success: false,
          error: {
            message:
              'API 요청 실패: 403 Forbidden - <html><META NAME="ROBOTS" CONTENT="NOINDEX, NOFOLLOW"><script src="/_Incapsula_Resource"></script>',
          },
        },
        502,
      ),
    );

    const res = await app.request(
      '/api/health/checks?check=seveneleven.inventory&mode=deep&fresh=true&transport=network',
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
        id: 'seveneleven.inventory',
        status: 'degraded',
        message: expect.stringContaining('403 Forbidden'),
      }),
    );
  });

  it('이마트24 재고 upstream 403은 degraded로 집계한다', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        {
          success: false,
          error: { message: 'API 요청 실패: 403 Forbidden - <!DOCTYPE html><title>403 Forbidden</title>' },
        },
        502,
      ),
    );

    const res = await app.request(
      '/api/health/checks?check=emart24.inventory&mode=deep&fresh=true&transport=network',
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
        id: 'emart24.inventory',
        status: 'degraded',
        message: expect.stringContaining('403 Forbidden'),
      }),
    );
  });

  it('CLI 계약 체크에서 이마트24 upstream 403은 degraded로 집계한다', async () => {
    mockFetch.mockImplementation((input: RequestInfo | URL) =>
      Promise.resolve(
        String(input).includes('/api/emart24/products')
          ? jsonResponse(
              {
                success: false,
                error: { message: 'API 요청 실패: 403 Forbidden - <!DOCTYPE html><title>403 Forbidden</title>' },
              },
              502,
            )
          : String(input).includes('/health')
            ? jsonResponse({ status: 'ok' })
            : jsonResponse({ success: true, data: { products: [{ name: '상품' }] }, meta: { total: 1 } }),
      ),
    );

    const res = await app.request(
      '/api/health/checks?check=cli.contract&mode=deep&fresh=true&transport=network',
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
        id: 'cli.contract',
        status: 'degraded',
        message: expect.stringContaining('/api/emart24/products'),
      }),
    );
  });

  it('CLI 계약 체크에서 세븐일레븐 upstream 403은 degraded로 집계한다', async () => {
    mockFetch.mockImplementation((input: RequestInfo | URL) =>
      Promise.resolve(
        String(input).includes('/api/seveneleven/products')
          ? jsonResponse(
              {
                success: false,
                error: {
                  message:
                    'API 요청 실패: 403 Forbidden - <html><META NAME="ROBOTS" CONTENT="NOINDEX, NOFOLLOW"><script src="/_Incapsula_Resource"></script>',
                },
              },
              502,
            )
          : String(input).includes('/health')
            ? jsonResponse({ status: 'ok' })
            : jsonResponse({ success: true, data: { products: [{ name: '상품' }] }, meta: { total: 1 } }),
      ),
    );

    const res = await app.request(
      '/api/health/checks?check=cli.contract&mode=deep&fresh=true&transport=network',
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
        id: 'cli.contract',
        status: 'degraded',
        message: expect.stringContaining('/api/seveneleven/products'),
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

  it('Better Stack 모니터 요청은 fresh=true여도 캐시를 사용한다', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: true,
        data: { products: [{ name: '상품' }] },
        meta: { total: 1 },
      }),
    );

    const requestInit = {
      headers: {
        Authorization: 'Bearer test-secret',
        'User-Agent':
          'Better Stack Better Uptime Bot Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    };
    const env = { HEALTH_CHECK_SECRET: 'test-secret', HEALTH_CHECK_TRANSPORT: 'network' };

    const first = await app.request('/api/health/checks?check=daiso.products&fresh=true', requestInit, env);
    const second = await app.request('/api/health/checks?check=daiso.products&fresh=true', requestInit, env);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect((await second.json()).cached).toBe(true);
  });

  it('force fresh 헤더가 있으면 fresh=true 요청은 캐시를 우회한다', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        success: true,
        data: { products: [{ name: '상품' }] },
        meta: { total: 1 },
      }),
    );

    const requestInit = {
      headers: {
        Authorization: 'Bearer test-secret',
        'x-health-check-force-fresh': 'true',
      },
    };
    const env = { HEALTH_CHECK_SECRET: 'test-secret', HEALTH_CHECK_TRANSPORT: 'network' };

    const first = await app.request('/api/health/checks?check=daiso.products&fresh=true', requestInit, env);
    const second = await app.request('/api/health/checks?check=daiso.products&fresh=true', requestInit, env);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect((await second.json()).cached).toBe(false);
  });

  it('nginx early hints health probe는 상세 체크 없이 204를 반환한다', async () => {
    const res = await app.request(
      '/api/health/checks?mode=full&fresh=true&includeSamples=true&timeoutMs=20000',
      {
        headers: {
          Authorization: 'Bearer test-secret',
          'User-Agent': 'nginx-ssl early hints',
        },
      },
      {
        HEALTH_CHECK_SECRET: 'test-secret',
      },
    );

    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(mockFetch).not.toHaveBeenCalled();
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
      '/api/health/checks?mode=deep&includeSamples=y&transport=network',
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
    expect(data.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'cli.contract',
          status: 'ok',
        }),
        expect.objectContaining({
          id: 'oliveyoung.inventory',
          status: 'ok',
        }),
      ]),
    );
  });

  it('full 모드를 파싱하고 network transport에서는 외부 fetch와 cache bust를 사용한다', async () => {
    mockFetch.mockImplementation((input: RequestInfo | URL) =>
      Promise.resolve(
        String(input).includes('/health')
          ? jsonResponse({ status: 'ok' })
          : jsonResponse({ success: true, data: { products: [{ name: '상품' }] }, meta: { total: 1 } }),
      ),
    );

    const res = await app.request(
      'https://mcp.aka.page/api/health/checks?mode=full&transport=network&fresh=true',
      {
        headers: { Authorization: 'Bearer test-secret' },
      },
      {
        HEALTH_CHECK_SECRET: 'test-secret',
        HEALTH_CHECK_BASE_URL: 'https://daiso-mcp.example.workers.dev',
      },
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.filters.mode).toBe('full');
    expect(mockFetch).toHaveBeenCalled();
    expect(String(mockFetch.mock.calls[0][0])).toMatch(/^https:\/\/daiso-mcp\.example\.workers\.dev\//);
    expect(String(mockFetch.mock.calls[0][0])).toContain('_healthCheck=');
    expect(new Headers((mockFetch.mock.calls[0][1] as RequestInit | undefined)?.headers).get('x-health-check-key')).toBe(
      'test-secret',
    );
  });

  it('baseUrl 쿼리가 있으면 헬스 체크 기준 URL로 우선 사용한다', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          products: [{ productName: '테이프' }],
        },
        meta: { total: 1 },
      }),
    );

    const res = await app.request(
      '/api/health/checks?check=daiso.products&transport=network&baseUrl=https%3A%2F%2Fprobe.example.com&fresh=true',
      {
        headers: { Authorization: 'Bearer test-secret' },
      },
      {
        HEALTH_CHECK_SECRET: 'test-secret',
        HEALTH_CHECK_BASE_URL: 'https://daiso-mcp.example.workers.dev',
      },
    );

    expect(res.status).toBe(200);
    expect(String(mockFetch.mock.calls[0][0])).toMatch(/^https:\/\/probe\.example\.com\/api\/daiso\/products/);
    expect(
      new Headers((mockFetch.mock.calls[0][1] as RequestInit | undefined)?.headers).get('x-health-check-key'),
    ).toBeNull();
  });

  it('지원하지 않는 mode는 400을 반환한다', async () => {
    const res = await app.request(
      '/api/health/checks?mode=bad',
      {
        headers: { Authorization: 'Bearer test-secret' },
      },
      {
        HEALTH_CHECK_SECRET: 'test-secret',
      },
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('INVALID_HEALTH_CHECK_MODE');
  });
});
