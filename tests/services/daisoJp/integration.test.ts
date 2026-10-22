import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import * as z from 'zod';
import { createDaisoJpService } from '../../../src/services/daisoJp/index.js';
import { registerDaisoJpRoutes } from '../../../src/api/routes/daisoJpRoutes.js';
import { apiResultHtml } from '../../../src/pages/apiResult.js';
import { ServiceError } from '../../../src/core/errors.js';
import { searchProducts, getProduct, findStores } from '../../../src/services/daisoJp/client.js';
import { runCli } from '../../../src/cli.js';
import type { AppBindings } from '../../../src/api/response.js';
vi.mock('../../../src/services/daisoJp/client.js', () => ({
  searchProducts: vi.fn(),
  getProduct: vi.fn(),
  findStores: vi.fn(),
}));
const product = {
  id: '4550746075917',
  name: 'ステンレスボウル',
  price: 220,
  currency: 'JPY',
  onlineAvailable: true,
  storeInventorySupported: false,
};
function app() {
  const a = new Hono<{ Bindings: AppBindings }>();
  a.use('/api/*', apiResultHtml);
  registerDaisoJpRoutes(a);
  return a;
}
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });
describe('일본 다이소 연결', () => {
  it('인증된 운영 점검만 일본 API의 성공 캐시를 우회한다', async () => {
    const match = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { cached: true } })));
    vi.stubGlobal('caches', { default: { match } });
    vi.mocked(getProduct).mockResolvedValue(product as never);
    vi.mocked(searchProducts).mockResolvedValue({ products: [product] } as never);
    vi.mocked(findStores).mockResolvedValue({ stores: [] } as never);
    for (const path of ['/products/' + product.id, '/products?q=ボウル', '/stores?keyword=渋谷']) {
      const headers = { Authorization: 'Bearer test-operational-key', 'x-health-check-force-fresh': 'true' };
      const response = await app().request('/api/daiso-jp' + path, { headers }, { HEALTH_CHECK_SECRET: 'test-operational-key' });
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    expect(match).not.toHaveBeenCalled();
    const response = await app().request('/api/daiso-jp/products/' + product.id,
      { headers: { 'x-health-check-force-fresh': 'true' } }, { HEALTH_CHECK_SECRET: 'test-operational-key' });
    expect((await response.json()).data.cached).toBe(true);
    expect(match).toHaveBeenCalledTimes(1);
  });
  it('REST와 MCP 상세가 명시적 일본 중계 설정을 전달한다', async () => {
    vi.mocked(getProduct).mockResolvedValue(product as never);
    const options = { productRelay: { relayUrl: 'https://relay.example', relayToken: 'test-token' } };
    await createDaisoJpService(options).getTools()[1].handler({ id: product.id });
    expect(getProduct).toHaveBeenLastCalledWith(product.id, options);
    await app().request('/api/daiso-jp/products/' + product.id, {}, {
      DAISO_JP_PRODUCT_RELAY_ENABLED: 'true', DTRYX_RELAY_URL: 'https://relay.example', DTRYX_RELAY_TOKEN: 'test-token',
    });
    expect(getProduct).toHaveBeenLastCalledWith(product.id, { productRelay: expect.objectContaining({ relayUrl: 'https://relay.example', relayToken: 'test-token', bypassCache: false }) });
  });
  it('MCP 도구 세 가지와 입력 제약을 노출한다', async () => {
    const service = createDaisoJpService();
    expect(service.metadata.id).toBe('daiso_jp');
    const tools = service.getTools();
    expect(tools[0].metadata.outputSchema?.currency).toBeDefined();
    expect(tools[1].metadata.outputSchema?.onlineAvailable).toBeDefined();
    expect(tools[2].metadata.outputSchema?.hasNext).toBeDefined();
    expect(tools.map((t) => t.name)).toEqual([
      'daiso_jp_search_products',
      'daiso_jp_get_product',
      'daiso_jp_find_stores',
    ]);
    vi.mocked(searchProducts).mockResolvedValue({ products: [product] } as never);
    vi.mocked(getProduct).mockResolvedValue(product as never);
    vi.mocked(findStores).mockResolvedValue({ stores: [] } as never);
    for (const [i, args] of [
      [0, { query: 'ボウル' }],
      [1, { id: product.id }],
      [2, { keyword: '渋谷', page: 2 }],
    ] as const) {
      const result = await tools[i].handler(args);
      expect(result.structuredContent).toBeDefined();
      expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
    }
    expect(searchProducts).toHaveBeenCalledWith('ボウル', 1);
    expect(findStores).toHaveBeenCalledWith('渋谷', 2);
    await expect(tools[0].handler({ query: ' ' })).rejects.toThrow();
    await expect(tools[1].handler({ id: '../' })).rejects.toThrow();
    expect(
      z.object(tools[2].metadata.inputSchema).safeParse({ keyword: '渋谷', page: 1.5 }).success,
    ).toBe(false);
  });
  it('REST 상품·상세·매장을 연결하고 HTML로 읽힌다', async () => {
    vi.mocked(searchProducts).mockResolvedValue({
      country: 'JP',
      currency: 'JPY',
      products: [product],
    } as never);
    vi.mocked(getProduct).mockResolvedValue(product as never);
    vi.mocked(findStores).mockResolvedValue({ country: 'JP', stores: [] } as never);
    for (const path of [
      '/products?q=ボウル&page=2',
      '/products/' + product.id,
      '/stores?keyword=渋谷',
    ]) {
      const r = await app().request('/api/daiso-jp' + path);
      expect(r.status).toBe(200);
      expect((await r.json()).success).toBe(true);
    }
    const r = await app().request('/api/daiso-jp/products?q=ボウル&format=html');
    expect(r.headers.get('content-type')).toContain('text/html');
    const html = await r.text();
    expect(html).toContain('ステンレスボウル');
    expect(html).toContain('/browse/daiso-jp/product/4550746075917');
    expect(html).toContain('일본 매장 재고 미지원');
    expect(html).not.toContain('별도로 조회하세요');
  });
  it.each([
    '/products',
    '/products?q= ',
    '/products?q=x&page=0',
    '/products?q=x&page=NaN',
    '/products?q=x&page=1.5',
    '/products?q=x&page=101',
    '/products/bad',
    '/stores',
    '/stores?keyword=x&page=',
  ])('잘못된 입력을 원본 요청 전에 거절한다: %s', async (path) => {
    const r = await app().request('/api/daiso-jp' + path);
    expect(r.status).toBe(400);
    expect(searchProducts).not.toHaveBeenCalled();
    expect(findStores).not.toHaveBeenCalled();
    expect(getProduct).not.toHaveBeenCalled();
  });
  it('원본 실패와 예상 밖 오류를 빈 결과로 바꾸지 않는다', async () => {
    vi.mocked(searchProducts).mockRejectedValue(
      new ServiceError('DAISOJP_UPSTREAM_FAILED', '일본 다이소 요청 실패', 502, true, 403),
    );
    const r = await app().request('/api/daiso-jp/products?q=x');
    expect(r.status).toBe(502);
    expect((await r.json()).diagnostics.upstreamStatus).toBe(403);
    vi.mocked(getProduct).mockRejectedValue(new Error('secret raw upstream'));
    const x = await app().request('/api/daiso-jp/products/' + product.id);
    expect(x.status).toBe(503);
    expect(await x.text()).not.toContain('secret');
  });
  it.each([
    ['jp-products', 'ボウル', '/api/daiso-jp/products', 'q'],
    ['jp-product', product.id, '/api/daiso-jp/products/' + product.id, ''],
    ['jp-stores', '渋谷', '/api/daiso-jp/stores', 'keyword'],
  ])('CLI %s가 일본 경로를 호출한다', async (command, arg, path, key) => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ success: true, data: product })));
    const out = vi.fn();
    const err = vi.fn();
    expect(
      await runCli([command, arg, '--json'], { fetchImpl, writeOut: out, writeErr: err }),
    ).toBe(0);
    const u = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(u.pathname).toBe(path);
    if (key) expect(u.searchParams.get(key)).toBe(arg);
    expect(await runCli([command, '--help'], { writeOut: out, writeErr: err })).toBe(0);
    expect(await runCli([command], { writeOut: out, writeErr: err })).toBe(1);
  });
});
