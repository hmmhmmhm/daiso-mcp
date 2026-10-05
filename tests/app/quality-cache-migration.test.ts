import { afterEach, expect, it, vi } from 'vitest';
import app from '../../src/index.js';

afterEach(() => vi.unstubAllGlobals());
it('개선 전 비교 캐시의 실패 결과 대신 수정된 조회를 반환한다', async () => {
  const old = Response.json({ success: true, data: { results: [], errors: [{ service: 'gs25', message: 'old 403' }] } });
  const put = vi.fn();
  vi.stubGlobal('caches', { default: {
    match: async (request: Request) => new URL(request.url).searchParams.get('__cache_prefix') === 'compare-products-v1' ? old.clone() : undefined,
    put,
  } });
  const fetcher = vi.fn(async () => Response.json({ resultSet: { result: [{ totalSize: 1, resultDocuments: [{ PD_NO: 'P', PDNM: '현재 상품', PD_PRC: '1000' }] }] } }));
  vi.stubGlobal('fetch', fetcher);
  const response = await app.request('/api/compare/products?keyword=콜라&services=daiso&limit=1');
  expect(await response.json()).toMatchObject({ data: { results: [{ code: 'P', name: '현재 상품' }], errors: [] } });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(put).toHaveBeenCalledTimes(1);
});
