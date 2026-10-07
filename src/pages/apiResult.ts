/** 웹 읽기 에이전트용 공개 GET 결과 표시 */
import { WEB_READ_RULE } from './agentStart.js';
import type { MiddlewareHandler } from 'hono';
import type { AppBindings } from '../api/response.js';

function escapeHtml(value: unknown): string {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** 모든 필드와 배열 순서를 보존하고 외부 문자열을 HTML로 해석하지 않습니다. */
function renderValue(value: unknown, productLinks: boolean): string {
  if (value === null || typeof value !== 'object') return escapeHtml(value);
  if (Array.isArray(value)) {
    return value.length ? `<ol>${value.map(item => `<li>${renderValue(item, productLinks)}</li>`).join('')}</ol>` : '<p>빈 목록</p>';
  }
  return `<dl>${Object.entries(value).map(([key, item]) => {
    const rendered = renderValue(item, productLinks);
    const detail = productLinks && key === 'id' && (typeof item === 'string' || typeof item === 'number')
      ? ` <a href="/api/daiso/products/${encodeURIComponent(String(item))}?format=html">상품 상세</a>` : '';
    return `<dt>${escapeHtml(key)}</dt><dd>${rendered}${detail}</dd>`;
  }).join('')}</dl>`;
}

export const apiResultHtml: MiddlewareHandler<{ Bindings: AppBindings }> = async (c, next) => {
  await next();
  if (c.req.method !== 'GET' || c.req.query('format') !== 'html' || !c.res.headers.get('Content-Type')?.includes('application/json')) return;
  let data: unknown;
  try { data = await c.res.clone().json(); } catch { return; }
  const url = new URL(c.req.url);
  url.searchParams.delete('format');
  const source = escapeHtml(url.pathname + url.search);
  const failed = c.res.status >= 400 || (data as { success?: boolean } | null)?.success === false;
  const title = failed ? '조회 실패' : '조회 성공';
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>${title} — 다이소 MCP</title>
<style>body{font-family:system-ui,sans-serif;max-width:900px;margin:32px auto;padding:0 20px;line-height:1.6;overflow-wrap:anywhere}dt{font-weight:600}dd{margin-bottom:12px}li{border-bottom:1px solid #ddd;padding:12px 0}a{color:#075bb5}</style></head><body><main><h1>${title}</h1>
<p><strong>${escapeHtml(WEB_READ_RULE)}</strong></p>
<p>요청: <code>${source}</code> · HTTP ${c.res.status}</p><p>실제 API 조회 결과입니다. 오류를 상품 없음이나 재고 0으로 해석하지 마세요. 매장 재고는 상품 ID와 매장명 또는 사용자 위치를 확인한 뒤 별도로 조회하세요.</p>
${renderValue(data, url.pathname === '/api/daiso/products')}
<p><a href="${source}">개발자용 JSON 원본 (웹 읽기용 아님)</a> · <a href="/">설치 없는 조회 안내</a> · <a href="/prompt">API 경로와 필수 파라미터 안내</a></p>
<p>다른 공개 GET 조회도 기존 파라미터에 <code>format=html</code>을 추가하면 HTML로 읽을 수 있습니다. 웹 읽기만으로 MCP 연결이 생기는 것은 아닙니다.</p></main></body></html>`;
  const headers = new Headers(c.res.headers);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
  c.res = new Response(html, { status: c.res.status, headers });
  // Hono는 응답 교체 시 기존 헤더를 병합하므로 교체 후 원본 표현의 헤더를 제거합니다.
  for (const name of ['Content-Length', 'Content-Encoding', 'ETag', 'Last-Modified', 'Content-MD5', 'Digest']) c.res.headers.delete(name);
};
