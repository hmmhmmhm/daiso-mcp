/** 웹 도구의 수집 주소를 구분하되 기존 API 캐시와 한도를 유지합니다. */
import type { Context, Hono } from 'hono';
import type { AppBindings } from '../api/response.js';

type Bindings = { Bindings: AppBindings };
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function registerBrowseReadRoutes(app: Hono<Bindings>): void {
  const forward = async (c: Context<Bindings>, id: string, suffix: string): Promise<Response> => {
    if (c.req.method !== 'GET') return c.text('GET 조회만 지원합니다.', 405);
    if (!ID.test(id) || suffix.split('/')[1] === 'read')
      return c.text('읽기 세션 경로가 올바르지 않습니다.', 400);
    const prefix = `/browse/read/${id}`;
    const scoped = (path: string) =>
      path === '/browse/read' || path.startsWith('/browse/read/')
        ? path
        : prefix + path.slice('/browse'.length);
    const target = new URL(c.req.url);
    target.pathname = '/browse' + suffix;
    const requestHeaders = new Headers(c.req.raw.headers);
    requestHeaders.delete('host');
    const source = await app.fetch(
      new Request(target, { method: 'GET', headers: requestHeaders, signal: c.req.raw.signal }),
      c.env,
    );
    const headers = new Headers(source.headers);
    headers.set('Cache-Control', 'no-store');
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    headers.set('X-Daiso-Read-Id', id);
    const location = headers.get('Location');
    if (location === '/browse' || location?.startsWith('/browse/'))
      headers.set('Location', scoped(location));
    if (!headers.get('Content-Type')?.includes('text/html'))
      return new Response(source.body, { status: source.status, headers });
    let body = (await source.text()).replace(
      /href="(\/browse(?:\/[^"]*)?)"/g,
      (_, path: string) => `href="${scoped(path)}"`,
    );
    const refresh = `/browse/read/${crypto.randomUUID()}${suffix}`
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
    const note = `<footer><p>읽기 세션: <code>${id}</code> · HTML 응답 생성: ${new Date().toISOString()}</p><p>새 주소도 기존 API 캐시·한도·권한을 사용합니다. HTML 응답 생성 시각은 원본 재고 갱신 시각이 아닙니다.</p><p><a href="${refresh}">같은 조건으로 새 응답 확인</a></p></footer>`;
    body = body.includes('</body>') ? body.replace('</body>', note + '</body>') : body + note;
    headers.delete('Content-Length');
    headers.delete('ETag');
    return new Response(body, { status: source.status, headers });
  };
  app.all('/browse/read', (c) => forward(c, crypto.randomUUID(), ''));
  const existing = (c: Context<Bindings>) => {
    const id = c.req.path.split('/')[3];
    return forward(c, id, c.req.path.slice(`/browse/read/${id}`.length));
  };
  app.all('/browse/read/:id', existing);
  app.all('/browse/read/:id/*', existing);
}
