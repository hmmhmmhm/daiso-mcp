import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import app from '../../src/index.js';
import { buildDiscoveryAssets } from '../../src/pages/discovery.js';
import { apiResultHtml } from '../../src/pages/apiResult.js';

const version = '2026-10-27.2';
describe('최신 안내 경로와 원본 이미지', () => {
  it.each(['/guide/latest', '/guide/2026-10-21.2', '/guide/unknown'])('%s는 캐시 없이 현재 버전으로 연결한다', async path => {
    const r = await app.request(path);
    expect(r.status).toBe(307);
    expect(r.headers.get('Location')).toBe('/guide/'+version);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
  });
  it('현재 버전은 최신 조회 링크와 이미지 검색 금지 안내를 제공한다', async () => {
    const r = await app.request('/guide/'+version); const text = await r.text();
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    expect(text).toContain('안내 버전: '+version);
    expect(text).toContain('/browse/read');
    expect(text).toContain('image_query');
    expect(text).toContain('이미지 검색');
  });
  it('현재 안내는 웹 도구가 실제 링크 ID로 선택할 수 있는 HTML을 제공한다', async () => {
    const response = await app.request('/guide/' + version);
    const text = await response.text();
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(text).toContain('<a href="/browse/read">웹 조회 시작</a>');
    expect(text).toContain('<a href="/guide/latest">최신 안내 확인</a>');
    expect(text).toContain('응답 생성 시각');
    expect(text).toContain('<html lang="ko">');
  });
  it('llms.txt의 UTF-8 평문 계약은 HTML 안내와 별도로 보존한다', async () => {
    const response = await app.request('/llms.txt');
    expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(await response.text()).not.toContain('<a href=');
  });
  it('프롬프트의 전체 웹 조회 예제는 쿼리 없는 browse 경로다', async () => {
    const text=await (await app.request('/prompt')).text();
    const urls=text.match(/https?:\/\/[^\s]+\/browse\/[^\s]+/g)!;
    expect(urls.length).toBeGreaterThan(30);
    for(const url of urls) {
      expect(url).not.toContain('?');
      expect(url).not.toContain('guide=');
    }
  });
  it('발견 HTML/robots/sitemap에서 현재 버전 안내를 발견한다', () => {
    const a = buildDiscoveryAssets({ services: [], tools: [] });
    for (const key of ['discovery.html','robots.txt','sitemap.xml']) expect(a[key]).toContain('/guide/'+version);
    expect(a['discovery.html']).toContain('/browse/read');
    expect(a['_headers']).toContain('Cache-Control: no-store');
  });
  it('HTML 후속 링크와 원본 Markdown은 현재 버전을 사용하고 JSON 캐시는 유지한다', async () => {
    const a = new Hono(); a.use('/api/*', apiResultHtml);
    a.get('/api/daiso/products', c => c.json({ data: { products: [{ id:'p1',name:'상품[1]\\표기\n이름',imageUrl:'https://cdn.example/p.png?l=ko&x=2' }] } },200,{'Cache-Control':'public, max-age=30'}));
    const r = await a.request('/api/daiso/products?format=html&guide=old');const text = await r.text();
    expect(text).toContain('href="/browse/daiso/product/p1"');
    expect(text).toContain('복사할 원본 이미지 Markdown');
    expect(text).toContain('![');
    expect(text).toContain('https://cdn.example/p.png?l=ko&amp;x=2');
    expect(text).toContain('상품\\[1\\]\\\\표기 이름');
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    const raw=await a.request('/api/daiso/products');
    expect(raw.headers.get('Cache-Control')).toBe('public, max-age=30');
    expect((await raw.json()).data.products[0].imageUrl).toBe('https://cdn.example/p.png?l=ko&x=2');
  });
});
