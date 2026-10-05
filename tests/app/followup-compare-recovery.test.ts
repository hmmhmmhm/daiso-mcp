import { afterEach, expect, it, vi } from 'vitest';
import app from '../../src/index.js';

afterEach(() => vi.unstubAllGlobals());

it('이마트24 403 이후 같은 검색의 원본을 재호출해 정상 가격을 복구한다', async () => {
  const entries = new Map<string, Response>();
  const put = vi.fn(async (request: Request, response: Response) => { entries.set(request.url, response.clone()); });
  vi.stubGlobal('caches', { default: {
    match: async (request: Request) => entries.get(request.url)?.clone(), put,
  } });
  let recovering = false;
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes('everse.emart24.co.kr')) {
      return recovering ? Response.json({ totalCnt: 1, productList: [{ pluCd: 'E', goodsNm: '복구 콜라', viewPrice: 1300 }] })
        : new Response('Forbidden', { status: 403 });
    }
    return Response.json({ resultSet: { result: [{ totalSize: 1, resultDocuments: [{ PD_NO: 'D', PDNM: '다이소 콜라', PD_PRC: '1500' }] }] } });
  });
  vi.stubGlobal('fetch', fetcher);
  const url = '/api/compare/products?keyword=콜라&services=daiso,emart24&limit=1';
  const first = await app.request(url);
  expect(await first.json()).toMatchObject({ success: true, data: {
    results: [{ service: 'daiso' }], errors: [{ service: 'emart24', message: expect.stringContaining('403') }],
  } });
  const emartCalls = () => fetcher.mock.calls.filter(([input]) => String(input).includes('everse.emart24.co.kr')).length;
  expect(emartCalls()).toBe(2);
  expect(put).not.toHaveBeenCalled();
  recovering = true;
  const recovered = await app.request(url);
  expect(await recovered.json()).toMatchObject({ success: true, data: {
    results: [{ service: 'emart24', name: '복구 콜라' }, { service: 'daiso' }], errors: [], bestPrice: { price: 1300 },
  } });
  expect(first.headers.get('Cache-Control')).toBe('no-store');
  expect(fetcher).toHaveBeenCalledTimes(5);
  expect(emartCalls()).toBe(3);
  expect(put).toHaveBeenCalledTimes(1);
  await app.request(url);
  expect(fetcher).toHaveBeenCalledTimes(5);
  expect(emartCalls()).toBe(3);
});
