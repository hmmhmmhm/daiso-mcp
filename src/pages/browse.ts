/** 기존 API의 보호·캐시·응답을 그대로 사용하는 웹 조회 진입점입니다. */
import type { Hono } from 'hono';
import type { AppBindings } from '../api/response.js';
import { BROWSE_ROUTES, browseApiUrl } from './browsePaths.js';

function page(content: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>DAISO MCP 웹 조회</title></head><body><main>${content}<p><a href="/guide/latest">최신 사용 안내</a> · <a href="/browse">전체 웹 조회</a></p></main></body></html>`,
    {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
}

export function registerBrowseRoutes(app: Hono<{ Bindings: AppBindings }>): void {
  app.get('/browse', () =>
    page(
      `<h1>설치 없이 웹으로 조회하기</h1><p>open/WebFetch로 아래 링크를 여세요. 모든 결과는 HTML입니다. format이나 쿼리 문자열은 필요 없습니다.</p><p><a href="/browse/daiso/products/%EC%88%98%EB%82%A9%EB%B0%95%EC%8A%A4/pageSize/3">수납박스 상품 3개 조회</a> · <a href="/browse/daiso/products/%ED%95%AB%EC%8B%9D%EC%8A%A4">핫식스 검색</a> · <a href="/browse/daiso/stores/%EA%B0%95%EB%82%A8%EC%97%AD">강남역 매장 검색</a></p><p>주요 검색어 뒤에는 /page/2/pageSize/10처럼 조건 이름과 값을 붙입니다. 주요 검색어 없이 조건만 사용하려면 /browse/query/서비스/기능/조건/값을 사용하세요. 상품 검색은 재고 확인이 아닙니다. 실제 상품 ID와 사용자 지역으로 재고를 별도 조회하세요.</p><ul>${BROWSE_ROUTES.map((r) => `<li><a href="${r.path}">${r.title}</a>: <code>${r.path}</code>${r.positional.length ? ' 뒤에 ' + r.positional.join(', ') + ' 값을 순서대로 추가' : ''}</li>`).join('')}</ul>`,
    ),
  );
  app.get('/browse/', (c) => c.redirect('/browse', 307));
  app.all('/browse/*', async (c) => {
    if (c.req.method !== 'GET') return page('<h1>GET 조회만 지원합니다.</h1>', 405);
    let target: URL | null;
    try {
      target = browseApiUrl(new URL(c.req.url));
    } catch {
      return page(
        '<h1>조회 조건이 올바르지 않습니다.</h1><p>경로의 이름·값 쌍, 중복 조건과 문자 인코딩을 확인해주세요.</p>',
        400,
      );
    }
    if (!target) return page('<h1>지원하지 않는 웹 조회 경로입니다.</h1>', 404);
    const headers = new Headers(c.req.raw.headers);
    headers.delete('host');
    return app.fetch(
      new Request(target, { method: 'GET', headers, signal: c.req.raw.signal }),
      c.env,
    );
  });
}
