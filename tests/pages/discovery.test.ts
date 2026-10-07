import { describe, expect, it } from 'vitest';
import app from '../../src/index.js';
import { buildDiscoveryAssets } from '../../src/pages/discovery.js';

describe('공개 발견 자산', () => {
  it('브라우저 GET은 HTML이고 JSON 클라이언트와 명시적 메타데이터 경로는 JSON이다', async () => {
    const res = await app.fetch(new Request('https://mcp.aka.page/'));
    expect(res.headers.get('Content-Type')).toContain('text/html');
    expect(await res.text()).toContain('설치 없이');
    const metadata = await app.request('/root.json');
    expect(metadata.headers.get('Content-Type')).toContain('application/json');
    expect((await metadata.json()).totalTools).toBe(41);
  });
  it('현재 레지스트리의 목록을 그대로 제공하며 설치 없는 첫 조회를 연결한다', async () => {
    const info = await (await app.request('/', { headers: { Accept: 'application/json' } })).json();
    const assets = buildDiscoveryAssets(info);
    expect(JSON.parse(assets['root.json'])).toEqual(info);
    expect(info.totalTools).toBe(41);
    expect(info.services.some((s: { id: string }) => s.id === 'lottemart')).toBe(false);
    expect(assets['discovery.html']).toContain('<html lang="ko">');
    expect(assets['discovery.html']).toContain('설치 없이');
    expect(assets['discovery.html']).toContain('daiso_search_products');
    expect(assets['discovery.html']).toContain('/api/daiso/products?q=');
    expect(assets['discovery.html']).toContain('https://mcp.aka.page/');
    expect(assets['discovery.html']).not.toContain('lottemart');
    expect(assets['discovery.html']).not.toContain('Zyte');
    expect(assets['discovery.html']).not.toContain('<script');
    expect(assets['llms.txt']).toContain('루트 POST');
  });

  it('hmart.app처럼 검색 및 주요 AI 봇을 명시적으로 허용하고 sitemap을 연결한다', () => {
    const assets = buildDiscoveryAssets({ services: [], tools: [] });
    for (const bot of ['*', 'ChatGPT-User', 'OAI-SearchBot', 'GPTBot', 'Claude-User', 'PerplexityBot']) {
      expect(assets['robots.txt']).toContain(`User-agent: ${bot}\nAllow: /`);
    }
    expect(assets['robots.txt']).toContain('Sitemap: https://mcp.aka.page/sitemap.xml');
    expect(assets['sitemap.xml']).toContain('<loc>https://mcp.aka.page/</loc>');
    expect(assets['sitemap.xml']).toContain('<loc>https://mcp.aka.page/llms.txt</loc>');
    expect(assets['_headers']).toContain('Access-Control-Allow-Origin: *');
  });

  it('레지스트리 문자열을 HTML 문법으로 해석하지 않는다', () => {
    const assets = buildDiscoveryAssets({ services: [{ name: '<a>"&\'>' }], tools: [] });
    expect(assets['discovery.html']).toContain('&lt;a&gt;&quot;&amp;&#39;&gt;');
    expect(assets['discovery.html']).not.toContain('<a>');
  });
});
