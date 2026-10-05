import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import app from '../../src/index.js';
import { registerCompareRoutes } from '../../src/api/routes/compareRoutes.js';
import { renderApiEnvelope } from '../../src/cliRenderer.js';

const handler = vi.hoisted(() => vi.fn());
vi.mock('../../src/api/compareHandlers.js', () => ({ handleCompareProducts: handler }));
afterEach(() => { vi.unstubAllGlobals(); handler.mockReset(); });

function installCache() {
  const entries = new Map<string, Response>();
  const match = vi.fn(async (request: Request) => entries.get(request.url)?.clone());
  const put = vi.fn(async (request: Request, response: Response) => { entries.set(request.url, response.clone()); });
  vi.stubGlobal('caches', { default: { match, put } });
  return { entries, match, put };
}

const complete = { success: true, data: { results: [{ name: '콜라', price: 1300 }], errors: [] } };
const partial = { success: true, data: { ...complete.data, errors: [{ service: 'emart24', message: 'HTTP 403' }] } };
const url = '/api/compare/products?keyword=콜라';

describe('비교 캐시 복구', () => {
  it('부분 실패 다음 요청에서 원본을 재조회하고 복구된 결과만 캐시한다', async () => {
    const cache = installCache();
    handler.mockResolvedValueOnce(Response.json(partial)).mockResolvedValueOnce(Response.json(complete));
    const first = await app.request(url);
    expect(await first.json()).toEqual(partial);
    const recovered = await app.request(url);
    expect(await recovered.json()).toEqual(complete);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(first.headers.get('Cache-Control')).toBe('no-store');
    expect(cache.put).toHaveBeenCalledTimes(1);
    const cached = await app.request(url);
    expect(await cached.json()).toEqual(complete);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(cached.headers.get('Cache-Control')).toContain('max-age=600');
  });

  it('기존 v2 캐시를 건너뛴다', async () => {
    const cache = installCache();
    cache.entries.set(new URL(`${url}&__cache_prefix=compare-products-v2`, 'http://localhost').href, Response.json(partial));
    handler.mockResolvedValue(Response.json(complete));
    const response = await app.request(url);
    expect(await response.json()).toEqual(complete);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(cache.put.mock.calls[0][0].url).toContain('compare-products-v3');
  });

  it.each([null, [], {}, { success: false, data: complete.data }, { success: true },
    { success: true, data: null }, { success: true, data: {} },
    { success: true, data: { results: [], errors: 'unknown' } },
    { success: true, data: { results: null, errors: [] } },
  ])('잘못된 비교 응답을 저장하지 않는다: %j', async (payload) => {
    const cache = installCache();
    handler.mockResolvedValue(Response.json(payload));
    const response = await app.request(url);
    expect(await response.json()).toEqual(payload);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('JSON 파싱 실패 응답도 저장하지 않는다', async () => {
    const cache = installCache();
    handler.mockResolvedValue(new Response('invalid json'));
    const response = await app.request(url);
    expect(await response.text()).toBe('invalid json');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('캐시 없는 환경의 부분 실패도 no-store를 반환한다', async () => {
    vi.stubGlobal('caches', undefined);
    handler.mockResolvedValue(Response.json(partial));
    const route = new Hono();
    registerCompareRoutes(route);
    const response = await route.request(url);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual(partial);
  });

  it('HTTP 오류를 저장하지 않고 no-store를 반환한다', async () => {
    const cache = installCache();
    handler.mockResolvedValue(Response.json({ success: false, error: 'failure' }, { status: 500 }));
    const response = await app.request(url);
    expect(response.status).toBe(500);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(cache.put).not.toHaveBeenCalled();
  });
});

describe('비교 CLI 부분 실패', () => {
  it('실패 서비스와 원인을 표시하고 성공 결과를 보존한다', () => {
    const output = renderApiEnvelope('compare', new URL(url, 'https://example.com'), partial);
    expect(output).toContain('일부 서비스 조회 실패');
    expect(output).toContain('emart24: HTTP 403');
    expect(output).toContain('콜라');
    expect(output).not.toContain('요청 성공:');
  });
  it('알 수 없는 서비스 오류도 누락하지 않는다', () => {
    const output = renderApiEnvelope('compare', new URL(url, 'https://example.com'), {
      success: true, data: { results: [], errors: [{ service: 'unknown', message: '장애' }, '읽기 실패', {}] },
    });
    expect(output).toContain('unknown: 장애');
    expect(output).toContain('읽기 실패');
    expect(output).toContain('-: -');
  });
  it('정상 비교는 성공으로 표시한다', () => {
    expect(renderApiEnvelope('compare', new URL(url, 'https://example.com'), complete)).toContain('요청 성공:');
  });
});
