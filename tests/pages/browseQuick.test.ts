import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { AppBindings } from '../../src/api/response.js';
import { apiResultHtml } from '../../src/pages/apiResult.js';
import { registerBrowseRoutes } from '../../src/pages/browse.js';

function fixture() {
  const app = new Hono<{ Bindings: AppBindings }>();
  const hits: URL[] = [];
  app.use('/api/*', apiResultHtml);
  app.get('/api/daiso/products', (c) => {
    hits.push(new URL(c.req.url));
    return c.json({
      success: true,
      data: { products: [{ id: '900001', name: '테스트 지갑', price: 1000 }] },
    });
  });
  app.get('/api/daiso/inventory', (c) => {
    hits.push(new URL(c.req.url));
    return c.json({
      success: true,
      data: {
        productId: c.req.query('productId'),
        storeInventory: {
          totalStores: 1,
          unknownStockCount: 0,
          stores: [{ store: { name: '테스트 강남역점', storeCode: 'TEST' }, quantity: 7 }],
        },
      },
    });
  });
  registerBrowseRoutes(app);
  return { app, hits };
}
async function follow(app: ReturnType<typeof fixture>['app'], body: string, label: string) {
  const links = [...body.matchAll(/href="([^"]+)">([^<]+)<\/a>/g)];
  const href = links.find((x) => x[2] === label)?.[1];
  expect(href, `실제 링크 없음: ${label}`).toBeDefined();
  const response = await app.request(href!);
  expect(response.status).toBe(200);
  return response.text();
}
describe('첫 조회의 실제 링크 왕복 축소', () => {
  it('시작·상품·지역선택·재고4페이지로 끝내고 원본 API는 각1회만 호출한다', async () => {
    const { app, hits } = fixture();
    const first = await app.request('/browse/quick');
    expect(first.status).toBe(200);
    let body = await first.text();
    expect(hits).toHaveLength(0);
    body = await follow(app, body, '지갑');
    expect(hits).toHaveLength(1);
    expect(hits[0].searchParams.get('q')).toBe('지갑');
    body = await follow(app, body, '매장 지역 선택');
    expect(hits).toHaveLength(1);
    expect(body).toContain('900001');
    body = await follow(app, body, '강남역');
    expect(hits).toHaveLength(2);
    expect(hits[1].pathname).toBe('/api/daiso/inventory');
    expect(Object.fromEntries(hits[1].searchParams)).toMatchObject({
      productId: '900001',
      keyword: '강남역',
      pageSize: '3',
      format: 'html',
    });
    expect(body).toContain('테스트 강남역점');
    expect(body).toContain('quantity');
  });
  it('추천 목록 밖 입력은 대체하지 않고 기존 글자 선택을 유지한다', async () => {
    const { app, hits } = fixture();
    const body = await (await app.request('/browse/compose/daiso/products/~')).text();
    expect(body).toContain('빠른 상품 검색');
    expect(body).toContain('초성 ㄱ');
    expect(body).toContain('일치');
    const partial = await (await app.request('/browse/compose/daiso/products/연')).text();
    expect(partial).toContain('현재 입력');
    expect(partial).toContain('%EC%97%B0/pageSize/3');
    expect(hits).toHaveLength(0);
  });
  it('상품과 지역의 빠른 선택을 폭넓게 제공하고 원문과 경로가 일치한다', async () => {
    const { app, hits } = fixture();
    for (const mode of ['products', 'stores']) {
      const body = await (await app.request(`/browse/compose/daiso/${mode}/~`)).text();
      const links = [...body.matchAll(/href="([^" ]+)">([^<]+)<\/a>/g)].filter((x) =>
        x[1].startsWith(`/browse/daiso/${mode}/`),
      );
      expect(links.length).toBeGreaterThanOrEqual(24);
      for (const [, href, label] of links) {
        expect(decodeURIComponent(href.split('/')[4])).toBe(label);
      }
    }
    const body = await (await app.request('/browse/compose/daiso/stores/외딴동네')).text();
    expect(body).not.toContain('빠른 지역 선택');
    expect(body).toContain(encodeURIComponent('외딴동네'));
    expect(hits).toHaveLength(0);
  });
  it('기존 읽기 시작과 매장 입력에서도 빠른 선택을 제공하고 GET만 허용한다', async () => {
    const { app, hits } = fixture();
    const body = await (await app.request('/browse/read')).text();
    expect(body).toMatch(/href="\/browse\/read\/[0-9a-f-]+\/daiso\/products\//);
    const places = await (await app.request('/browse/compose/daiso/stores/~')).text();
    expect(places).toContain('/browse/daiso/stores/');
    expect(places).toContain('강남역');
    expect((await app.request('/browse/quick', { method: 'POST' })).status).toBe(405);
    expect(hits).toHaveLength(0);
  });
});
