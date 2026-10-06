import { afterEach, expect, it, vi } from 'vitest';
import { checkDirectRoute } from '../../src/utils/directRoutes.js';
afterEach(() => vi.unstubAllGlobals());

it('rejects malformed product identities and stock quantities before normalization can invent zero', async () => {
  const valid = {
    goodsNumber: 'A000000165760',
    goodsName: '핸드크림',
    priceToPay: 10800,
    originalPrice: 12000,
    discountRate: 10,
    o2oStockFlag: true,
    o2oRemainQuantity: 0,
  };
  for (const row of [
    {},
    { ...valid, goodsNumber: '' },
    { ...valid, priceToPay: 'oops' },
    { ...valid, o2oRemainQuantity: 'oops' },
    { ...valid, o2oStockFlag: 'N' },
    { ...valid, o2oRemainQuantity: undefined },
  ]) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ status: 'SUCCESS', data: { searchList: [row] } })),
    );
    expect(await checkDirectRoute('oy-product-search')).toMatchObject({
      direct: false,
      reason: 'invalid-response',
    });
  }
  for (const [key, data] of [
    ['oy-find-store', { storeList: [{}] }],
    [
      'oy-stock-stores',
      {
        storeList: [
          { storeCode: 'DF23', storeName: '점포', salesStoreYn: true, remainQuantity: 'oops' },
        ],
      },
    ],
    [
      'cu-stock',
      {
        data: {
          stockResult: {
            result: { rows: [{ fields: { item_cd: '123', item_nm: '커피', hyun_maega: 'oops' } }] },
          },
        },
      },
    ],
    ['cu-store', { storeList: [{}] }],
    [
      'gs25-products',
      { SearchQueryResult: { Collection: [{ Documentset: { Document: [{ field: {} }] } }] } },
    ],
    ['seven-goods', { data: { content: [{}] } }],
    [
      'seven-store',
      { data: { SearchQueryResult: { Collection: [{ Documentset: { Document: [{}] } }] } } },
    ],
    ['dtryx-movies', { RetCode: 'success', Recordset: [{}] }],
    ['dtryx-play-dates', { RetCode: 'success', Recordset: [{}] }],
    [
      'dtryx-timetable',
      {
        RetCode: 'success',
        Recordset: [{ CinemaCd: '000067', MovieCd: '1', ScreenCd: '1', TotalSeatCnt: 'oops' }],
      },
    ],
  ] as const) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(key.startsWith('oy-') ? { status: 'SUCCESS', data } : data)),
    );
    expect(await checkDirectRoute(key)).toMatchObject({
      direct: false,
      reason: 'invalid-response',
    });
  }
});

it('accepts observed Olive Young rows and typed nonempty rows for the other public APIs', async () => {
  const product = {
    goodsNumber: 'A000000165760',
    goodsName: '타입넘버 핸드크림',
    priceToPay: 10800,
    originalPrice: 12000,
    discountRate: 10,
    o2oStockFlag: true,
    o2oRemainQuantity: 0,
  };
  const store = {
    storeCode: 'DF23',
    storeName: '명동2가점',
    address: '서울특별시 중구 남대문로 68-1',
    latitude: 37.5632323502622,
    longitude: 126.982275208021,
    distance: 0.15,
    pickupYn: true,
    salesStoreYn: true,
    remainQuantity: 9,
    o2oRemainQuantity: 7,
    openYn: false,
  };
  const cases = [
    ['oy-product-search', { status: 'SUCCESS', data: { serachList: [product] } }],
    ['oy-find-store', { status: 'SUCCESS', data: { storeList: [store] } }],
    [
      'oy-stock-stores',
      {
        status: 'SUCCESS',
        data: { storeList: [store, { ...store, remainQuantity: null, o2oRemainQuantity: null }] },
      },
    ],
    [
      'cu-stock',
      {
        data: {
          stockResult: {
            result: { rows: [{ fields: { item_cd: '123', item_nm: '커피', hyun_maega: '1500' } }] },
          },
        },
      },
    ],
    ['cu-store', { storeList: [{ storeCd: '123', storeNm: 'CU강남', stock: null }] }],
    [
      'gs25-products',
      {
        SearchQueryResult: {
          Collection: [
            {
              Documentset: {
                Document: [
                  {
                    field: {
                      itemCode: '123',
                      itemName: '콜라',
                      starPoint: '4.0',
                      stockCheckYn: 'Y',
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    ],
    [
      'seven-goods',
      { data: { content: [{ itemCd: '201051', itemOnm: '콜라', onlinePrice: 1500 }] } },
    ],
    [
      'seven-store',
      {
        data: {
          SearchQueryResult: {
            Collection: [
              { Documentset: { Document: [{ field: { storeCd: '54928', storeNm: '강남점' } }] } },
            ],
          },
        },
      },
    ],
    [
      'dtryx-movies',
      { RetCode: 'success', Recordset: [{ MovieCd: '1', MovieNm: '영화', RunningTime: '120' }] },
    ],
    [
      'dtryx-play-dates',
      { RetCode: 'success', Recordset: [{ PlaySDT: '2026-10-06', HiddenYn: 'N' }] },
    ],
    [
      'dtryx-timetable',
      {
        RetCode: 'success',
        Recordset: [
          {
            CinemaCd: '000067',
            MovieCd: '1',
            MovieNm: '영화',
            ScreenCd: '1',
            TotalSeatCnt: '100',
            RemainSeatCnt: '10',
          },
        ],
      },
    ],
  ] as const;
  for (const [key, body] of cases) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(body)),
    );
    expect(await checkDirectRoute(key), key).toMatchObject({ direct: true });
  }
});

it('rejects malformed catalog product prices in pages and issues before zero normalization', async () => {
  for (const key of ['seven-pages', 'seven-issues'] as const) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ data: [{ itemCd: '201051', itemOnm: '콜라', onlinePrice: 'oops' }] }),
      ),
    );
    expect(await checkDirectRoute(key)).toMatchObject({
      direct: false,
      reason: 'invalid-response',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          data: { content: [{ itemCd: '201051', itemOnm: '콜라', onlinePrice: 1500 }] },
        }),
      ),
    );
    expect(await checkDirectRoute(key)).toMatchObject({ direct: true });
  }
});

it('accepts observed blank unrated values while retaining strict product prices', async () => {
  for (const [key, result] of [
    [
      'gs25-products',
      {
        SearchQueryResult: {
          Collection: [
            {
              Documentset: {
                Document: [{ field: { itemCode: '123', itemName: '콜라', starPoint: '' } }],
              },
            },
          ],
        },
      },
    ],
    [
      'seven-goods',
      {
        data: {
          content: [
            {
              itemCd: '123',
              itemOnm: '콜라',
              onlinePrice: 1500,
              avgEvalScore: '',
              productReviewCnt: '',
            },
          ],
        },
      },
    ],
  ] as const) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(result)),
    );
    expect(await checkDirectRoute(key)).toMatchObject({ direct: true });
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({ data: [{ itemCd: '123', itemOnm: '콜라', onlinePrice: '' }] }),
    ),
  );
  expect(await checkDirectRoute('seven-pages')).toMatchObject({ direct: false });
});
it('accepts typed CU display metadata without a response code and rejects malformed metadata', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ areaCateList: [{ menuCd: '1', menuNm: '상품 탭1' }] })),
  );
  expect(await checkDirectRoute('cu-prime')).toMatchObject({ direct: true });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ areaCateList: [{}] })),
  );
  expect(await checkDirectRoute('cu-prime')).toMatchObject({ direct: false });
});

it('accepts exact empty popword data only with observed explicit success markers', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ success: true, data: {}, code: 200 })),
  );
  expect(await checkDirectRoute('seven-popwords')).toMatchObject({ direct: true });
  for (const result of [
    { data: {} },
    { success: true, data: {} },
    { data: {}, code: 200 },
    { success: true, data: { error: 'wrong' }, code: 200 },
  ]) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(result)),
    );
    expect(await checkDirectRoute('seven-popwords')).toMatchObject({
      direct: false,
      reason: 'invalid-response',
    });
  }
});
