import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { apiResultHtml } from '../../src/pages/apiResult.js';
import { buildDiscoveryAssets } from '../../src/pages/discovery.js';
import { buildAgentStartText } from '../../src/pages/agentStart.js';

function fixture(products: unknown[]) {
  const a = new Hono();
  a.use('/api/*', apiResultHtml);
  a.get('/api/daiso/products', (c) =>
    c.json({ success: true, data: { products }, meta: { total: 9 } }),
  );
  return a;
}

describe('실제 상품 이미지 카드', () => {
  it('상품 이름·이미지·ID를 같은 카드에 연결하고 전체 원본 필드를 보존한다', async () => {
    const r = await fixture([
      {
        id: 'p1',
        name: '<상품>',
        imageUrl: 'https://cdn.example/p.png?l=ko&size=2',
        price: 5000,
        extra: { unknown: true },
      },
      { id: 'p2', name: '사진 없음' },
    ]).request('/api/daiso/products?format=html');
    const html = await r.text();
    const cards = html.match(/<article class="product-card">[\s\S]*?<\/article>/g)!;
    expect(cards).toHaveLength(2);
    expect(cards[0]).toContain('<h2>&lt;상품&gt;</h2>');
    expect(cards[0]).toContain('src="https://cdn.example/p.png?l=ko&amp;size=2"');
    expect(cards[0]).toContain('alt="&lt;상품&gt;"');
    expect(cards[0]).toContain('원본 상품 이미지');
    expect(cards[0]).toContain('p1');
    expect(cards[0]).toContain('5000');
    expect(cards[0]).toContain('unknown');
    expect(cards[1]).toContain('이미지 없음');
    expect(cards[1]).not.toContain('<img');
    expect(html).toContain('total');
    expect(r.headers.get('Content-Security-Policy')).toContain('img-src https:');
  });

  it.each([
    null,
    42,
    '',
    'broken',
    'javascript:alert(1)',
    'data:image/png;base64,xxx',
    'http://cdn.example/p.png',
    'https://user:pass@cdn.example/p.png',
    'https://:pass@cdn.example/p.png',
  ])('안전하지 않거나 없는 이미지 %s는 외부 대체 없이 생략한다', async (imageUrl) => {
    const html = await (
      await fixture([{ id: 'p', name: '상품', imageUrl }]).request(
        '/api/daiso/products?format=html',
      )
    ).text();
    expect(html).not.toContain('<img');
    expect(html).toContain('이미지 없음');
  });

  it('속성 탈출 문자열을 이스케이프하고 이름 없는 원본과 비객체도 보존한다', async () => {
    const products = [
      { id: 'x', name: '" onerror="evil', imageUrl: 'https://cdn.example/p" onerror="evil' },
      { id: 'no-name' },
      null,
      7,
    ];
    const html = await (await fixture(products).request('/api/daiso/products?format=html')).text();
    expect(html).not.toContain(' onerror="evil');
    expect(html).toContain('&quot; onerror=&quot;evil');
    expect(html).toContain('no-name');
    expect(html).toContain('null');
    const json = await (await fixture(products).request('/api/daiso/products')).json();
    expect(json.data.products).toEqual(products);
  });

  it.each(['58951', 58951])(
    '실제 상세 응답의 productId %s에서 지역 선택으로 이어지고 JSON은 유지한다',
    async (productId) => {
      const a = new Hono();
      a.use('/api/*', apiResultHtml);
      const payload = {
        success: true,
        data: { productId, productName: '다용도 철사 2P SET', currentPrice: 1000 },
      };
      a.get('/api/daiso/products/:id', (c) => c.json(payload));
      const response = await a.request('/api/daiso/products/58951?format=html');
      expect(await response.text()).toContain(
        'href="/browse/compose/daiso/inventory/58951/~">매장 지역 선택</a>',
      );
      expect(await (await a.request('/api/daiso/products/58951')).json()).toEqual(payload);
    },
  );

  it('검색 설명과 공통 안내에 HTML GET 우선과 버전을 표시한다', () => {
    const assets = buildDiscoveryAssets({ services: [], tools: [] });
    expect(assets['discovery.html']).toMatch(/name="description" content="ChatGPT.*browse\//);
    for (const text of [assets['discovery.html'], buildAgentStartText('https://example.com')]) {
      expect(text).toContain('안내 버전: 2026-10-27.3');
      expect(text).toContain('갱신일: 2026-10-27');
    }
  });
});
