import { expect, it } from 'vitest';
import { browsePageLinks } from '../../src/pages/browseLinks.js';
it('페이지 이동은 현재 검색어·지역·정렬·크기를 보존한다', () => {
  const url = new URL(
    'https://mcp.aka.page/api/daiso/products?q=핫식스&page=2&pageSize=3&sort=price&format=html&guide=old',
  );
  const links = browsePageLinks(url, { meta: { page: 2, pageSize: 3, total: 9 } });
  expect(links.map((l) => l.label)).toEqual(['이전 페이지', '다음 페이지']);
  expect(links[1].path).toContain('/page/3/pageSize/3/sort/price');
  for (const link of links) {
    expect(link.path).not.toContain('?');
    expect(link.path).not.toContain('guide');
  }
});
it('마지막 페이지와 오류·잘못된 메타데이터에서 다음 조회를 만들지 않는다', () => {
  const url = new URL('https://mcp.aka.page/api/daiso/products?q=x');
  for (const data of [
    null,
    4,
    {},
    { success: false },
    { meta: { page: -1, pageSize: 1, total: 2 } },
    { meta: { page: 1, pageSize: 3, total: 3 } },
    { meta: { page: 1, pageSize: 0, total: 3 } },
  ]) {
    expect(browsePageLinks(url, data)).toEqual([]);
  }
});
it('명시적인 hasNext와 nextPage만 사용하며 지원하지 않는 API는 연결하지 않는다', () => {
  const url = new URL('https://mcp.aka.page/api/daiso-jp/products?q=x&page=1');
  expect(browsePageLinks(url, { data: { hasNext: true } })).toHaveLength(1);
  expect(browsePageLinks(url, { data: { nextPage: 3 } })[0].path).toContain('/page/3');
  expect(browsePageLinks(url, { data: { hasNext: false } })).toEqual([]);
  expect(
    browsePageLinks(new URL('https://mcp.aka.page/api/health/checks?page=2'), {
      data: { hasNext: true },
    }),
  ).toEqual([]);
});
it('명시적 hasNext=false를 총 개수 추정으로 뒤집지 않는다', () => {
  const url = new URL('https://mcp.aka.page/api/daiso-jp/products?q=x');
  expect(
    browsePageLinks(url, { data: { hasNext: false }, meta: { page: 1, pageSize: 1, total: 100 } }),
  ).toEqual([]);
});
it.each([
  '/api/places/search?location=강남&start=1&limit=5',
  '/api/seveneleven/stores?keyword=강남&limit=2',
  '/api/oliveyoung/stores?keyword=강남&pageIdx=1',
])('다른 페이지 규약 또는 페이지 미지원 API에 page 링크를 만들지 않는다: %s', (path) => {
  expect(
    browsePageLinks(new URL(path, 'https://mcp.aka.page'), {
      meta: { page: 1, pageSize: 2, total: 100 },
    }),
  ).toEqual([]);
});
it('일본 API의 마지막 허용 페이지를 초과하는 다음 링크를 만들지 않는다', () => {
  const links = browsePageLinks(
    new URL('https://mcp.aka.page/api/daiso-jp/products?q=x&page=100'),
    { data: { hasNext: true } },
  );
  expect(links.map((l) => l.label)).toEqual(['이전 페이지']);
});
