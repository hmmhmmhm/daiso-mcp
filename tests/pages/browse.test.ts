import { describe, expect, it } from 'vitest';
import { ACTION_QUERY_DEFINITIONS } from '../../src/api/actionsProxy.js';
import { toBrowsePath, browseApiUrl } from '../../src/pages/browsePaths.js';
import app from '../../src/index.js';

const origin = 'https://mcp.aka.page';
describe('쿼리 없는 웹 조회 경로', () => {
  it.each([
    [
      '/api/daiso/products?q=핫식스&pageSize=3&format=html',
      '/browse/daiso/products/핫식스/pageSize/3',
    ],
    ['/api/daiso/stores?keyword=강남역', '/browse/daiso/stores/강남역'],
    ['/api/daiso/inventory?productId=105603886', '/browse/daiso/inventory/105603886'],
    [
      '/api/daiso/inventory?productId=105603886&keyword=강남역&pageSize=2',
      '/browse/daiso/inventory/105603886/강남역/pageSize/2',
    ],
    ['/api/daiso/products/105603886', '/browse/daiso/product/105603886'],
    ['/api/daiso-jp/products/4550746075917', '/browse/daiso-jp/product/4550746075917'],
    [
      '/api/daiso/stores?sido=서울&gugun=마포구',
      '/browse/query/daiso/stores/sido/서울/gugun/마포구',
    ],
    ['/api/opinet/stations/around?lat=37&lng=127', '/browse/opinet/stations/around/lat/37/lng/127'],
  ])('실제 조회 조건을 경로로 보존한다: %s', (api, expected) => {
    const path = toBrowsePath(new URL(api, origin))!;
    expect(decodeURIComponent(path)).toBe(expected);
    expect(path).not.toContain('?');
    const target = browseApiUrl(new URL(path, origin))!;
    const source = new URL(api, origin);
    source.searchParams.set('format', 'html');
    expect(target.pathname).toBe(source.pathname);
    expect(Object.fromEntries(target.searchParams)).toEqual(
      Object.fromEntries(source.searchParams),
    );
  });
  it('모든 현재 지원 읽기 경로가 왕복 가능하고 쓰기·관리 경로를 제외한다', () => {
    for (const def of ACTION_QUERY_DEFINITIONS.filter(
      (d) => d.action !== 'submitDeveloperRequest',
    )) {
      const url = new URL(def.targetPath.replace(':productId', '123'), origin);
      url.searchParams.set('limit', '3');
      const path = toBrowsePath(url)!;
      expect(path).toMatch(/^\/browse\//);
      expect(browseApiUrl(new URL(path, origin))!.pathname).toBe(url.pathname);
    }
    for (const path of [
      '/api/health/checks',
      '/api/feedback/requests',
      '/api/lottemart/stores',
      '/api/actions/query',
      '/api/unknown',
    ]) {
      expect(toBrowsePath(new URL(path, origin))).toBeNull();
    }
  });
  it.each(['한글 & /? # % +', '.', '..', '', '~', '~.', '~..', 'pageSize', 'q', '<script>'])(
    '특수 값을 한 번만 인코딩하여 보존한다: %s',
    (value) => {
      const url = new URL('/api/daiso/products', origin);
      url.searchParams.set('q', value);
      const path = toBrowsePath(url)!;
      expect(browseApiUrl(new URL(path, origin))!.searchParams.get('q')).toBe(value);
    },
  );
  it.each([
    '/browse/daiso/products/%ZZ',
    '/browse/daiso/products/핫식스/pageSize',
    '/browse/query/daiso/products/q/a/q/b',
    '/browse/query/daiso/products/__proto__/x',
    '/browse/query/daiso/products/format/json',
    '/browse/query/daiso/products/q/%00',
    '/browse/daiso/products/a?q=b',
  ])('잘못된 조건을 외부 호출 전에 거절한다: %s', (path) => {
    expect(() => browseApiUrl(new URL(path, origin))).toThrow();
  });
  it('쿼리는 추적값만 무시하고 원본 API 형식을 HTML로 고정한다', () => {
    const url = browseApiUrl(
      new URL('/browse/daiso/products/핫식스?utm_source=chatgpt.com', origin),
    )!;
    expect(url.searchParams.get('q')).toBe('핫식스');
    expect(url.searchParams.get('format')).toBe('html');
    expect(url.searchParams.has('utm_source')).toBe(false);
  });
  it('운영 앱이 HTML 목록과 입력 오류를 반환하며 임의 API·쓰기는 노출하지 않는다', async () => {
    const index = await app.request('/browse');
    expect(index.status).toBe(200);
    expect(index.headers.get('Content-Type')).toContain('text/html');
    expect(await index.text()).toContain('/browse/daiso/products/');
    const missing = await app.request('/browse/daiso/product');
    expect(missing.status).toBe(400);
    expect(missing.headers.get('Content-Type')).toContain('text/html');
    for (const path of [
      '/browse/health/checks',
      '/browse/feedback/requests',
      '/browse/lottemart/stores',
    ]) {
      const r = await app.request(path);
      expect(r.status).toBe(404);
    }
    expect((await app.request('/browse/daiso/products/x', { method: 'POST' })).status).toBe(405);
  });
});

it('외부 호출 전에 과도하게 긴 경로를 거절한다', () => {
  expect(() => browseApiUrl(new URL('/browse/daiso/products/' + 'a'.repeat(8200), origin))).toThrow(
    '너무 깁니다',
  );
});
it.each(['%ZZ', '%ED%A0%80'])(
  '구형 상세 URL의 잘못된 인코딩은 링크 변환 실패로만 처리한다: %s',
  (id) => {
    expect(toBrowsePath(new URL('/api/daiso/products/' + id, origin))).toBeNull();
  },
);
it('디렉터리 형태의 진입 주소도 최신 웹 조회 목록으로 연결한다', async () => {
  const res = await app.request('/browse/');
  expect(res.status).toBe(307);
  expect(res.headers.get('Location')).toBe('/browse');
});
