import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { AppBindings } from '../../src/api/response.js';
import { registerBrowseRoutes } from '../../src/pages/browse.js';

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
function fixture() {
  const app = new Hono<{ Bindings: AppBindings }>();
  const hits: URL[] = [];
  registerBrowseRoutes(app);
  app.get('/api/daiso/products', (c) => {
    hits.push(new URL(c.req.url));
    return c.html(
      `<main>response ${hits.length}<a href="/browse/daiso/product/58450">상세</a><a href="/browse/compose/daiso/inventory/58450/~">지역 선택</a><a href="https://cdn.daisomall.co.kr/image.jpg">이미지</a><a href="/guide/latest">안내</a></main>`,
    );
  });
  app.get('/api/daiso/products/:id', (c) => c.html(`<main>상품 ${c.req.param('id')}</main>`));
  app.get('/api/daiso/stores', (c) => c.html('<main>실패</main>', 503));
  return { app, hits };
}
async function seed(app: ReturnType<typeof fixture>['app']) {
  const response = await app.request('/browse/read');
  expect(response.status).toBe(200);
  const body = await response.text();
  const prefix = body.match(new RegExp(`href="(/browse/read/${uuid})/compose"`))?.[1];
  expect(prefix).toBeTruthy();
  return { prefix: prefix!, response, body };
}

describe('웹 수집본과 구분할 수 있는 읽기 세션 링크', () => {
  it('원본 API 호출 없이 실제 입력 링크와 새 응답 링크를 발급한다', async () => {
    const { app, hits } = fixture();
    const { prefix, response, body } = await seed(app);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(body).toContain('원본 재고 갱신');
    const input = await app.request(prefix + '/compose/daiso/products/~');
    expect(await input.text()).toContain(prefix + '/compose/daiso/products/~/ko-0');
    expect(hits).toHaveLength(0);
  });
  it('API 조건은 그대로 전달하고 실제 상품·지역 링크에만 세션을 유지한다', async () => {
    const { app, hits } = fixture();
    const { prefix } = await seed(app);
    const response = await app.request(prefix + '/daiso/products/연필/pageSize/3');
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(hits).toHaveLength(1);
    expect(Object.fromEntries(hits[0].searchParams)).toEqual({ q: '연필', pageSize: '3', format: 'html' });
    expect(body).toContain(`href="${prefix}/daiso/product/58450"`);
    expect(body).toContain(`href="${prefix}/compose/daiso/inventory/58450/~"`);
    expect(body).toContain('href="https://cdn.daisomall.co.kr/image.jpg"');
    expect(body).toContain('href="/guide/latest"');
    expect(body).not.toContain(prefix + '/read/');
  });
  it('새 응답 링크의 ID와 응답을 바꾸면서 같은 검색 조건을 보존한다', async () => {
    const { app, hits } = fixture();
    const { prefix } = await seed(app);
    const response = await app.request(prefix + '/daiso/products/연필/pageSize/3');
    const body = await response.text();
    const refresh = body.match(/href="([^"]+)">같은 조건으로 새 응답 확인/)!;
    expect(refresh).not.toBeNull();
    expect(refresh[1]).not.toContain(prefix + '/');
    expect(refresh[1]).toMatch(new RegExp(`^/browse/read/${uuid}/daiso/products/`));
    expect(await (await app.request(refresh[1])).text()).toContain('response 2');
    expect(hits[1].search).toBe(hits[0].search);
  });
  it('기존 실패 상태를 성공으로 바꾸지 않는다', async () => {
    const { app } = fixture();
    const { prefix } = await seed(app);
    const response = await app.request(prefix + '/daiso/stores/안산');
    expect(response.status).toBe(503);
    expect(await response.text()).toContain('실패');
  });
  it('내부 리디렉션도 같은 세션 안에서만 이동한다', async () => {
    const { app } = fixture();
    const { prefix } = await seed(app);
    const response = await app.request(prefix + '/');
    expect(response.status).toBe(307);
    expect(response.headers.get('Location')).toBe(prefix);
  });
  it.each(['invalid', '00000000-0000-0000-0000-000000000000'])('잘못된 ID를 거절한다: %s', async (id) => {
    const { app, hits } = fixture();
    expect((await app.request(`/browse/read/${id}/daiso/products/a`)).status).toBe(400);
    expect(hits).toHaveLength(0);
  });
  it('중첩 read와 관리·외부 URL 경로는 전달하지 않는다', async () => {
    const { app, hits } = fixture();
    const { prefix } = await seed(app);
    expect((await app.request(prefix + '/read/again/compose')).status).toBe(400);
    expect((await app.request(prefix + '/api/health/checks')).status).toBe(404);
    expect((await app.request(prefix + '/https://example.com')).status).toBe(404);
    expect(hits).toHaveLength(0);
  });
  it('세션 쓰기 요청을 거절하고 API를 호출하지 않는다', async () => {
    const { app, hits } = fixture();
    const response = await app.request('/browse/read', { method: 'POST' });
    expect(response.status).toBe(405);
    expect(hits).toHaveLength(0);
  });
});
