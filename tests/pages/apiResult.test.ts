import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { apiResultHtml } from '../../src/pages/apiResult.js';
import type { AppBindings } from '../../src/api/response.js';
import app from '../../src/index.js';
import { buildDiscoveryAssets } from '../../src/pages/discovery.js';

function fixture() {
  const a = new Hono<{ Bindings: AppBindings }>();
  a.use('/api/*', apiResultHtml);
  a.all('/api/daiso/products', c => c.json({ success: true, data: { products: [{ id: '123&"', name: '<script>alert(1)</script>', price: 1000 }, { id: 7 }, { id: { nested: true } }, { id: false }], nested: { null: null, flag: false, missing: [] } }, meta: { total: 1 } }, 200, { 'Cache-Control': 'public, max-age=30', 'ETag': 'json-tag', 'Content-Length': '1', 'Retry-After': '5' }));
  a.get('/api/daiso/products/:id', c => c.json({ id: 7, other: {} }));
  a.get('/api/error', c => c.json({ success: false, error: { code: 'UPSTREAM_DOWN', message: '조회 실패 <>&' } }, 503));
  a.get('/api/null', c => c.json(null));
  a.get('/api/false', c => c.json({ success: false }));
  a.get('/api/no-type', () => new Response(new Uint8Array([65])));
  a.get('/api/other-products', c => c.json([{ id: 7 }, { id: { nested: true } }, { id: false }]));
  a.get('/api/string', c => c.json('문자열'));
  a.get('/api/bad', c => c.body('broken', 200, { 'Content-Type': 'application/json' }));
  a.get('/api/text', c => c.text('원문'));
  return a;
}

describe('GET HTML 결과', () => {
  it('기본 JSON과 POST 및 HEAD는 유지한다', async () => {
    const a = fixture();
    for (const [method, path] of [['GET','/api/daiso/products'], ['GET','/api/daiso/products?format=json'], ['POST','/api/daiso/products?format=html'], ['HEAD','/api/daiso/products?format=html']]) {
      const res = await a.request(path, { method });
      expect(res.headers.get('Content-Type')).toContain('application/json');
    }
  });
  it('실제 데이터를 HTML로 표시하고 위험한 문자열을 escape하며 원본과 상세 링크를 만든다', async () => {
    const res = await fixture().request('/api/daiso/products?q=%22%3C&pageSize=3&format=html');
    const body = await res.text();
    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=30');
    expect(res.headers.get('Retry-After')).toBe('5');
    expect(res.headers.get('ETag')).toBeNull();
    expect(res.headers.get('Content-Length')).toBeNull();
    expect(body).toContain('조회 성공'); expect(body).toContain('1000');
    expect(body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(body).not.toContain('<script');
    expect(body).toContain('/api/daiso/products/123%26%22?format=html');
    expect(body).toContain('q=%22%3C&amp;pageSize=3');
    expect(body).toContain('null'); expect(body).toContain('false'); expect(body).toContain('빈 목록');
    expect(body).toContain('total');
  });
  it('조회 오류의 상태와 내용을 보존하고 성공으로 표시하지 않는다', async () => {
    const res = await fixture().request('/api/error?format=html');
    expect(res.status).toBe(503);
    const body = await res.text(); expect(body).toContain('조회 실패'); expect(body).toContain('UPSTREAM_DOWN'); expect(body).not.toContain('조회 성공');
  });
  it('JSON scalar도 표시하고 비JSON 또는 잘못된 JSON은 그대로 유지한다', async () => {
    const a = fixture();
    expect(await (await a.request('/api/string?format=html')).text()).toContain('문자열');
    expect(await (await a.request('/api/text?format=html')).text()).toBe('원문');
    expect(await (await a.request('/api/bad?format=html')).text()).toBe('broken');
    expect(await (await a.request('/api/no-type?format=html')).text()).toBe('A');
    expect(await (await a.request('/api/null?format=html')).text()).toContain('null');
    expect(await (await a.request('/api/false?format=html')).text()).toContain('조회 실패');
    expect(await (await a.request('/api/other-products?format=html')).text()).toContain('nested');
  });
  it('운영 앱에도 등록되어 기존 검증 오류를 HTML로 제공한다', async () => {
    const res = await app.request('/api/daiso/products?format=html');
    expect(res.status).toBe(400); expect(res.headers.get('Content-Type')).toContain('text/html');
    expect(await res.text()).toContain('MISSING_QUERY');
  });
  it('셸 없는 에이전트에게 HTML GET을 안내하며 txt charset을 명시한다', () => {
    const assets = buildDiscoveryAssets({ services: [], tools: [] });
    expect(assets['discovery.html']).toContain('pageSize=3&amp;format=html');
    expect(assets['llms.txt']).toContain('pageSize=3&format=html');
    expect(assets['_headers']).toContain('/llms.txt\n  Content-Type: text/plain; charset=utf-8');
  });
});
