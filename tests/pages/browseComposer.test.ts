/** 실제 링크만 선택하여 임의 검색어와 상품별 지역을 입력합니다. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import app from '../../src/index.js';
import { renderBrowseComposer } from '../../src/pages/browseComposer.js';
import { browseApiUrl } from '../../src/pages/browsePaths.js';
import { Hono } from 'hono';
import { apiResultHtml } from '../../src/pages/apiResult.js';

afterEach(() => vi.unstubAllGlobals());

async function walk(start: string, labels: string[]) {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const open = async (path: string) => {
    const response = await app.request(path);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    return response.text();
  };
  let body = await open(start);
  for (const label of labels) {
    const links = [...body.matchAll(/href="([^"]+)">([^<]+)<\/a>/g)];
    const link = links.find((match) => match[2] === label);
    expect(link, `링크 없음: ${label}`).toBeDefined();
    body = await open(link![1]);
  }
  expect(fetch).not.toHaveBeenCalled();
  return body;
}

describe('웹 링크 검색어 입력', () => {
  it('API 호출 없이 한글·영문·숫자를 선택하여 실제 상품 조회 링크를 만든다', async () => {
    const body = await walk('/browse/compose/daiso/products/~', [
      '초성 ㅇ',
      '중성 ㅕ',
      '연',
      '초성 ㅍ',
      '중성 ㅣ',
      '필',
      'a',
      '7',
    ]);
    expect(body).toContain('/browse/daiso/products/%EC%97%B0%ED%95%84a7/pageSize/3');
    expect(body).not.toContain('synthetic');
  });
  it('선택한 상품 ID를 유지하며 지역을 입력하고 지우거나 초기화한다', async () => {
    let body = await walk('/browse/compose/daiso/inventory/58450/~', [
      '초성 ㄱ',
      '중성 ㅏ',
      '강',
      '초성 ㄴ',
      '중성 ㅏ',
      '남',
    ]);
    expect(body).toContain('선택한 상품 ID: <code>58450</code>');
    const path = '/browse/daiso/inventory/58450/%EA%B0%95%EB%82%A8/pageSize/3';
    expect(body).toContain(path);
    const target = browseApiUrl(new URL(path, 'https://mcp.aka.page'))!;
    expect(Object.fromEntries(target.searchParams)).toEqual({
      productId: '58450',
      keyword: '강남',
      pageSize: '3',
      format: 'html',
    });
    body = await walk('/browse/compose/daiso/inventory/58450/강남', ['한 글자 지우기']);
    expect(body).toContain('/browse/daiso/inventory/58450/%EA%B0%95/pageSize/3');
    body = await walk('/browse/compose/daiso/inventory/58450/강남', ['처음부터']);
    expect(body).toContain('선택한 상품 ID: <code>58450</code>');
    expect(body).not.toContain('입력한 검색어로 실제 조회');
  });
  it('매장 검색은 영문·숫자·공백·하이픈을 보존하고 빈 검색을 금지한다', async () => {
    const body = await walk('/browse/compose/daiso/stores/~', ['A', '공백', '1', '-']);
    expect(body).toContain('/browse/daiso/stores/A%201-/limit/3');
    const empty = renderBrowseComposer(
      new URL('https://mcp.aka.page/browse/compose/daiso/stores/%20'),
    )!;
    expect(empty).not.toContain('입력한 검색어로 실제 조회');
    const index = await app.request('/browse/compose');
    expect(index.status).toBe(200);
    expect(await index.text()).toContain('/browse/compose/daiso/products/~');
  });
  it.each([
    '/other',
    '/browse/compose/daiso/unknown/~',
    '/browse/compose/daiso/products',
    '/browse/compose/daiso/inventory/~',
    '/browse/compose/daiso/inventory/0/~',
    '/browse/compose/daiso/inventory',
    '/browse/compose/daiso/inventory/123456789012345678901/~',
    '/browse/compose/daiso/products/%ZZ',
    '/browse/compose/daiso/products/%3Cscript%3E',
    '/browse/compose/daiso/products/~/unknown',
    '/browse/compose/daiso/products/~/ko-19',
    '/browse/compose/daiso/products/~/ko-0-21',
    '/browse/compose/daiso/products/~/ko-0/extra',
    '/browse/compose/daiso/products/~?q=ignored',
    `/browse/compose/daiso/products/${'a'.repeat(33)}`,
    `/browse/compose/daiso/products/${'a'.repeat(32)}/ko-0`,
    `/browse/compose/daiso/products/${'a'.repeat(513)}`,
  ])('잘못된 입력은 원본 조회 전에 거절한다: %s', (path) => {
    expect(renderBrowseComposer(new URL(path, 'https://mcp.aka.page'))).toBeNull();
  });
  it('최대 길이에서는 문자 선택만 멈추고 올바른 조회 링크는 유지한다', () => {
    const text = '가'.repeat(32);
    const body = renderBrowseComposer(
      new URL(
        `/browse/compose/daiso/products/${text}?utm_source=chatgpt&guide=current`,
        'https://mcp.aka.page',
      ),
    )!;
    expect(body).not.toContain('초성 ㄱ');
    expect(body).toContain('입력한 검색어로 실제 조회');
  });
  it('HTTP 오류와 잘못된 메서드도 HTML로 반환하며 원본을 호출하지 않는다', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const response = await app.request('/browse/compose/daiso/products/~/invalid');
    expect(response.status).toBe(400);
    expect(response.headers.get('x-robots-tag')).toContain('noindex');
    expect(response.headers.get('content-type')).toContain('text/html');
    expect((await app.request('/browse/compose/daiso/products/~', { method: 'POST' })).status).toBe(
      405,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it('실제 상품 HTML에서 지역 선택으로 연결하고 지역 없는 재고를 바로 조회하지 않는다', async () => {
    const fixture = new Hono();
    fixture.use('/api/*', apiResultHtml);
    fixture.get('/api/daiso/products', (c) =>
      c.json({ success: true, data: { products: [{ id: '58450', name: '전문가용 2B 연필' }] } }),
    );
    const body = await (await fixture.request('/api/daiso/products?format=html')).text();
    expect(body).toContain('href="/browse/compose/daiso/inventory/58450/~"');
    expect(body).not.toContain('href="/browse/daiso/inventory/58450"');
  });
});
