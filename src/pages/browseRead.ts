import { withBrowseReadSignal } from '../utils/browseReadSignal.js';
/** 웹 도구의 수집 주소를 구분하되 기존 API 캐시와 한도를 유지합니다. */
import type { Context, Hono } from 'hono';
import { registerBrowseJobRoutes, withBrowseJob, readBrowseText } from './browseJobs.js';
import type { AppBindings } from '../api/response.js';

type Bindings = { Bindings: AppBindings };
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function registerBrowseReadRoutes(app: Hono<Bindings>): void {
  registerBrowseJobRoutes(app);
  const forward = async (c: Context<Bindings>, id: string, suffix: string): Promise<Response> => {
    if (c.req.method !== 'GET') return c.text('GET 조회만 지원합니다.', 405);
    if (!ID.test(id) || suffix.split('/')[1] === 'read')
      return c.text('읽기 세션 경로가 올바르지 않습니다.', 400);
    const prefix = `/browse/read/${id}`;
    const scoped = (path: string) =>
      path === '/browse/quick' || path === '/browse/read' || path.startsWith('/browse/read/')
        ? path
        : prefix + path.slice('/browse'.length);
    const target = new URL(c.req.url);
    target.pathname = '/browse' + suffix;
    const requestHeaders = new Headers(c.req.raw.headers);
    requestHeaders.delete('host');
    const controller = new AbortController();
    const operation = () =>
      withBrowseReadSignal(controller.signal, () =>
        Promise.resolve(
          app.fetch(
            new Request(target, {
              method: 'GET',
              headers: requestHeaders,
              signal: controller.signal,
            }),
            c.env,
          ),
        ).then(async (source) => {
          const headers = new Headers(source.headers);
          headers.set('Cache-Control', 'no-store');
          headers.set('X-Robots-Tag', 'noindex, nofollow');
          headers.set('X-Daiso-Read-Id', id);
          const location = headers.get('Location');
          if (location === '/browse' || location?.startsWith('/browse/'))
            headers.set('Location', scoped(location));
          if (!headers.get('Content-Type')?.includes('text/html'))
            return new Response(source.body, { status: source.status, headers });
          let raw: string;
          try {
            raw = await (suffix.startsWith('/daiso/') && c.env?.BROWSE_READ_JOBS
              ? readBrowseText(source)
              : source.text());
          } catch (error) {
            if (!(error instanceof RangeError)) throw error;
            return new Response(
              '<h1>조회 결과가 웹 읽기 크기 제한을 초과했습니다.</h1><p>수량 미확인. 결과를 잘라 정상으로 표시하지 않습니다.</p>',
              {
                status: 502,
                headers: {
                  'Content-Type': 'text/html; charset=utf-8',
                  'Cache-Control': 'no-store',
                },
              },
            );
          }
          let body = raw.replace(
            /href="(\/browse(?:\/[^"]*)?)"/g,
            (_, path: string) => `href="${scoped(path)}"`,
          );
          const refresh = `/browse/read/${crypto.randomUUID()}${suffix}`
            .replaceAll('&', '&amp;')
            .replaceAll('"', '&quot;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;');
          const copyUrl = `https://mcp.aka.page${prefix}${suffix}`
            .replaceAll('&', '&amp;')
            .replaceAll('"', '&quot;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;');
          const recovery = `<details><summary>웹 읽기 접근 거절 시 복사 재전송</summary><p>아래 문장을 그대로 복사해 이 대화에 보내주세요. 접수나 문장 제시는 재고 조회 완료가 아닙니다.</p><pre>다음 주소를 웹 URL 열기 도구로 직접 열어 실제 결과를 확인해주세요: ${copyUrl}. 실패하면 오류 원문을 알려주세요.</pre><p>사용자가 재전송한 뒤 한 번 조회합니다. 단순 허용 문구나 URL 일부로 대체하지 마세요. TimeoutError는 같은 실제 링크를 한 번만 재확인하고 계속 실패하면 미확인으로 보고합니다.</p></details>`;
          const note = `<footer><p>읽기 세션: <code>${id}</code> · HTML 응답 생성: ${new Date().toISOString()}</p><p>새 주소도 기존 API 캐시·한도·권한을 사용합니다. HTML 응답 생성 시각은 원본 재고 갱신 시각이 아닙니다.</p><p><a href="${refresh}">같은 조건으로 새 응답 확인</a></p>${recovery}</footer>`;
          body = body.includes('</body>') ? body.replace('</body>', note + '</body>') : body + note;
          headers.delete('Content-Length');
          headers.delete('ETag');
          return new Response(body, { status: source.status, headers });
        }),
      );
    return suffix.startsWith('/daiso/')
      ? withBrowseJob(c, operation, () => controller.abort())
      : operation();
  };
  app.all('/browse/quick', (c) => forward(c, crypto.randomUUID(), ''));
  app.all('/browse/read', (c) => forward(c, crypto.randomUUID(), ''));
  const existing = (c: Context<Bindings>) => {
    const id = c.req.path.split('/')[3];
    return forward(c, id, c.req.path.slice(`/browse/read/${id}`.length));
  };
  app.all('/browse/read/:id', existing);
  app.all('/browse/read/:id/*', existing);
}
