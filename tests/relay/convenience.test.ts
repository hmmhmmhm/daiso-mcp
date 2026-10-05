import { describe, expect, it, vi } from 'vitest';
import { createConvenienceRelay } from '../../scripts/relay/convenience.js';
const req = (operation: string, body: unknown) =>
  new Request(`http://localhost/v1/convenience/${operation}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer convenience' },
    body: JSON.stringify(body),
  });
describe('편의점 고정 작업 중계', () => {
  it('CU 검색 원본을 보존하고 별도 예산을 소비한다', async () => {
    const data = { resp_cd: '0000', data: { stockResult: { result: { rows: [] } } } };
    const fetcher = vi.fn(async () => Response.json(data));
    const takeQuota = vi.fn(async () => true);
    const relay = createConvenienceRelay('convenience', { fetcher, takeQuota });
    const response = await relay(
      req('cu-stock', {
        searchWord: '과자',
        prevSearchWord: '',
        spellModifyUseYn: 'Y',
        offset: 0,
        limit: 20,
        searchSort: 'recom',
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(data);
    const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.href).toBe('https://www.pocketcu.co.kr/api/search/rest/stock/main');
    expect(init.redirect).toBe('manual');
    expect(takeQuota).toHaveBeenCalledTimes(1);
  });
  it('임의 프록시 필드와 실패 JSON은 거절한다', async () => {
    const fetcher = vi.fn(async () => Response.json({ success: false, code: 500 }));
    const relay = createConvenienceRelay('convenience', { fetcher, takeQuota: async () => true });
    expect(
      (
        await relay(
          req('seven-goods', { query: '커피', pageNo: 0, pageSize: 20, url: 'https://evil' }),
        )
      ).status,
    ).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      (await relay(req('seven-goods', { query: '커피', pageNo: 0, pageSize: 20 }))).status,
    ).toBe(502);
  });
});
it('성공 검색만 캐시하고 실패 응답은 예산과 재시도를 유지한다', async () => {
  const fetcher = vi.fn(async () => Response.json({ SearchQueryResult: {} }));
  const takeQuota = vi.fn(async () => true);
  const relay = createConvenienceRelay('convenience', { fetcher, takeQuota });
  expect((await relay(req('gs25-products', { query: '과자' }))).status).toBe(200);
  expect((await relay(req('gs25-products', { query: '과자' }))).status).toBe(200);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(takeQuota).toHaveBeenCalledTimes(1);
});
it.each([
  [
    'seven-stock',
    { smCd: '1', stokMngCd: '1', stokMngQty: 1, stockApplicationRate: '1', storeList: ['s'] },
    { data: { storeList: [{ storeCd: 's', stock: 'unknown' }] } },
  ],
  [
    'gs25-stock',
    { serviceCode: '01', realTimeStockYn: 'Y', itemCode: '1', apiKey: 'key' },
    { stores: [{ storeCode: 's' }] },
  ],
])('잘못된 재고를 0으로 바꾸지 않는다 %s', async (operation, body, data) => {
  const relay = createConvenienceRelay('convenience', {
    fetcher: async () => Response.json(data),
    takeQuota: async () => true,
  });
  expect((await relay(req(operation as string, body))).status).toBe(502);
});
const storeBody = {
  latVal: '37',
  longVal: '127',
  baseLatVal: '37',
  baseLongVal: '127',
  tabId: '2',
  filterSvcList: [],
  filterAdtList: [],
  stockCdcYn: 'N',
  searchStock: false,
  pickupType: 'change',
  getRoute: 'IOS',
  areaTplNo: '0',
  childMealPickUpYn: 'N',
  isCurrentSearch: 'N',
  pageType: 'search_improve',
  searchWord: '',
  isRecommend: '',
  recommendId: '',
  jipCd: '',
  itemCd: '',
  item_cd: '',
  onItemNo: '',
};
const realStockBody = {
  smCd: '1',
  stokMngCd: '1',
  stokMngQty: 1,
  stockApplicationRate: '1',
  storeList: ['s'],
};
it.each([
  ['cu-prime', {}, {}, 'https://www.pocketcu.co.kr/api/search/display/stock', 'POST'],
  ['cu-store', storeBody, { storeList: [] }, 'https://www.pocketcu.co.kr/api/store', 'POST'],
  [
    'seven-store',
    { collection: 'store', query: '강남', sort: 'Date/desc', listCount: 100 },
    { success: true, code: 200, data: {} },
    'https://new.7-elevenapp.co.kr/api/v1/open/search/store',
    'POST',
  ],
  [
    'seven-popwords',
    { label: 'home' },
    { data: [] },
    'https://new.7-elevenapp.co.kr/api/v1/open/search/popword?label=home',
    'POST',
  ],
  [
    'seven-stock-meta',
    { itemCd: '123' },
    { itemCd: '123', smCd: '1' },
    'https://new.7-elevenapp.co.kr/api/v1/open/product/search/stock?itemCd=123',
    'GET',
  ],
  [
    'seven-stock',
    realStockBody,
    { data: { storeList: [{ storeCd: 's', stock: -1 }] } },
    'https://new.7-elevenapp.co.kr/api/v1/open/real-stock/multi/01/stocks',
    'POST',
  ],
  ['seven-pages', {}, { data: [] }, 'https://new.7-elevenapp.co.kr/api/v1/product/pages', 'GET'],
  ['seven-issues', {}, { data: [] }, 'https://new.7-elevenapp.co.kr/api/v1/product/issues', 'GET'],
  [
    'seven-exhibitions',
    {},
    { data: [] },
    'https://new.7-elevenapp.co.kr/api/v1/exhibition/main/list',
    'GET',
  ],
  [
    'gs25-stock',
    { serviceCode: '01', realTimeStockYn: 'Y', apiKey: 'worker-key' },
    { stores: [] },
    'https://b2c-bff.woodongs.com/api/bff/v2/store/stock?serviceCode=01&realTimeStockYn=Y',
    'GET',
  ],
])('공식 작업 %s만 지정된 URL로 전송한다', async (operation, body, data, expectedUrl, method) => {
  const fetcher = vi.fn(async () => Response.json(data));
  const relay = createConvenienceRelay('convenience', { fetcher, takeQuota: async () => true });
  expect(await (await relay(req(operation as string, body))).json()).toEqual(data);
  const [url, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
  expect(url.href).toBe(expectedUrl);
  expect(init.method).toBe(method);
  expect(init.headers).not.toHaveProperty('Authorization');
  expect(url.search).not.toContain('worker-key');
});
it('인증키 없이 GS25 재고 호출을 하지 않고 로컬 키는 안전하게 헤더로 전달한다', async () => {
  const fetcher = vi.fn(async () => Response.json({ stores: [{ realStockQuantity: '0' }] }));
  const body = {
    serviceCode: '01',
    realTimeStockYn: 'Y',
    itemCode: '123',
    myPositionYCoordination: '37',
    centerPositionYCoordination: '37',
    myPositionXCoordination: '127',
    centerPositionXCoordination: '127',
  };
  expect(
    (
      await createConvenienceRelay('convenience', { fetcher, takeQuota: async () => true })(
        req('gs25-stock', body),
      )
    ).status,
  ).toBe(403);
  expect(fetcher).not.toHaveBeenCalled();
  const relay = createConvenienceRelay('convenience', {
    fetcher,
    takeQuota: async () => true,
    gs25ApiKey: 'local-key',
  });
  expect((await relay(req('gs25-stock', body))).status).toBe(200);
  const [, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
  expect(init.headers).toMatchObject({ 'Api-Key': 'local-key' });
  for (const field of [
    'myPositionYCoordination',
    'centerPositionYCoordination',
    'myPositionXCoordination',
    'centerPositionXCoordination',
  ])
    expect((await relay(req('gs25-stock', { ...body, [field]: '181' }))).status).toBe(400);
});
it('CU 좌표와 상품 재고의 형식을 검사한다', async () => {
  const fetcher = vi.fn(async () => Response.json({ storeList: [{ stock: '3' }] }));
  const relay = createConvenienceRelay('convenience', { fetcher, takeQuota: async () => true });
  for (const field of ['latVal', 'baseLatVal', 'longVal', 'baseLongVal'])
    expect((await relay(req('cu-store', { ...storeBody, [field]: '181' }))).status).toBe(400);
  expect((await relay(req('cu-store', { ...storeBody, itemCd: '123' }))).status).toBe(200);
  fetcher.mockImplementation(async () => Response.json({ storeList: [{}] }));
  expect((await relay(req('cu-store', { ...storeBody, itemCd: '124' }))).status).toBe(502);
});
it.each([
  ['cu-prime', {}, { resp_cd: '0000' }, 200],
  ['cu-prime', {}, { resp_cd: '3000' }, 502],
  [
    'cu-stock',
    {
      searchWord: '과자',
      prevSearchWord: '',
      spellModifyUseYn: 'Y',
      offset: 0,
      limit: 20,
      searchSort: 'recom',
    },
    { data: { stockResult: { result: { rows: [] } } } },
    200,
  ],
  [
    'cu-stock',
    {
      searchWord: '과자',
      prevSearchWord: '',
      spellModifyUseYn: 'Y',
      offset: 0,
      limit: 20,
      searchSort: 'recom',
    },
    { resp_cd: '3000', data: { stockResult: { result: { rows: [] } } } },
    502,
  ],
  ['cu-store', storeBody, { resp_cd: '0000', storeList: [] }, 200],
  ['cu-store', storeBody, { resp_cd: '3000', storeList: [] }, 502],
  ['seven-goods', { query: '과자', pageNo: 0, pageSize: 20 }, { data: [], code: 199 }, 502],
  ['seven-goods', { query: '과자', pageNo: 0, pageSize: 20 }, { data: [], code: 300 }, 502],
  ['seven-goods', { query: '과자', pageNo: 0, pageSize: 20 }, { code: 200 }, 502],
])('성공 및 실패 코드 검사 %s %j', async (op, body, data, status) => {
  const relay = createConvenienceRelay('convenience', {
    fetcher: async () => Response.json(data),
    takeQuota: async () => true,
  });
  expect((await relay(req(op as string, body))).status).toBe(status);
});
it('HTML, 리다이렉트와 취소 실패가 재고 0이 되지 않는다', async () => {
  for (const response of [
    new Response('<html>'),
    new Response(null, { status: 302 }),
    new Response(new ReadableStream({ cancel: () => Promise.reject(Error('secret')) }), {
      status: 403,
    }),
  ]) {
    const relay = createConvenienceRelay('convenience', {
      fetcher: async () => response,
      takeQuota: async () => true,
    });
    expect((await relay(req('cu-prime', {}))).status).toBe(502);
  }
});
it.each([401, 403, 500])('GS25 원본 인증 실패 %i만 인증 상태로 보존한다', async (status) => {
  const relay = createConvenienceRelay('convenience', {
    fetcher: async () => new Response(null, { status }),
    takeQuota: async () => true,
    gs25ApiKey: 'key',
  });
  expect((await relay(req('gs25-stock', { serviceCode: '01', realTimeStockYn: 'Y' }))).status).toBe(
    status === 500 ? 502 : status,
  );
});
it('실패 envelope는 초기화도 캐시하지 않는다', async () => {
  const fetcher = vi.fn(async () => Response.json({ success: false, error: 'upstream failed' }));
  const relay = createConvenienceRelay('convenience', { fetcher, takeQuota: async () => true });
  expect((await relay(req('cu-prime', {}))).status).toBe(502);
  expect((await relay(req('cu-prime', {}))).status).toBe(502);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('정수 범위를 벗어나는 재고 문자열을 거절한다', async () => {
  const relay = createConvenienceRelay('convenience', {
    fetcher: async () =>
      Response.json({ data: { storeList: [{ storeCd: 's', stock: '999999999999999999999' }] } }),
    takeQuota: async () => true,
  });
  expect((await relay(req('seven-stock', realStockBody))).status).toBe(502);
});
