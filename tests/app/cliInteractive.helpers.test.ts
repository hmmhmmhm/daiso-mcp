/**
 * 인터랙티브 CLI 내부 헬퍼 테스트
 */

import { describe, expect, it, vi } from 'vitest';
import { cliInteractiveTestables } from '../../src/cliInteractive.js';

function createPrompt(answers: string[]) {
  let index = 0;
  return {
    ask: async () => {
      const answer = answers[index];
      index += 1;
      return answer ?? '';
    },
    close: () => {},
  };
}

function createJsonResponse(payload: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

describe('cliInteractiveTestables', () => {
  it('기본 유틸 동작을 처리한다', async () => {
    expect(cliInteractiveTestables.isRecord({})).toBe(true);
    expect(cliInteractiveTestables.isRecord(null)).toBe(false);
    expect(cliInteractiveTestables.toText('A')).toBe('A');
    expect(cliInteractiveTestables.toText(1)).toBe('1');
    expect(cliInteractiveTestables.toText(false)).toBe('false');
    expect(cliInteractiveTestables.toText(undefined)).toBe('');

    const stores = cliInteractiveTestables.parseStores({
      success: true,
      data: {
        stores: [
          { name: '강남점', address: '서울', phone: '02' },
          { storeName: '역삼점', address: '서울', phone: '03' },
          { address: '이름없음' },
          'invalid',
        ],
      },
    });
    expect(stores).toHaveLength(2);

    expect(cliInteractiveTestables.parseStores({ success: false })).toEqual([]);
    expect(cliInteractiveTestables.parseStores({ success: true, data: { stores: {} } })).toEqual([]);

    const products = cliInteractiveTestables.parseDaisoProducts({
      success: true,
      data: {
        products: [
          { id: 'P1', name: '박스', price: '2000' },
          { id: 'P2', name: '바구니', price: 1500 },
          { id: 'P3', name: '정리함', price: 'abc' },
          { id: '', name: 'x' },
          'invalid',
        ],
      },
    });
    expect(products).toEqual([
      { id: 'P1', name: '박스', price: 2000 },
      { id: 'P2', name: '바구니', price: 1500 },
      { id: 'P3', name: '정리함', price: 0 },
    ]);
    expect(cliInteractiveTestables.parseDaisoProducts({ success: false })).toEqual([]);
    expect(cliInteractiveTestables.parseDaisoProducts({ success: true, data: { products: {} } })).toEqual([]);

    expect(cliInteractiveTestables.buildDaisoStoreKeywordVariants('안산 중앙역')).toEqual([
      '안산 중앙역',
      '안산중앙역',
      '안산중앙',
    ]);
    expect(cliInteractiveTestables.buildDaisoStoreKeywordVariants('   ')).toEqual([]);
  });

  it('다이소 매장 검색어 fallback을 처리한다', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(createJsonResponse({ success: true, data: { stores: [] } }))
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: { stores: [{ name: '안산중앙본점', address: '경기 안산', phone: '1522-4400' }] },
        }),
      );

    const result = await cliInteractiveTestables.fetchStoresWithKeywordFallback(
      fetchImpl,
      'daiso',
      '안산 중앙역',
    );

    expect(result.matchedKeyword).toBe('안산중앙역');
    expect(result.stores).toHaveLength(1);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://mcp.aka.page/api/daiso/stores?keyword=%EC%95%88%EC%82%B0+%EC%A4%91%EC%95%99%EC%97%AD&limit=10',
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://mcp.aka.page/api/daiso/stores?keyword=%EC%95%88%EC%82%B0%EC%A4%91%EC%95%99%EC%97%AD&limit=10',
    );
  });

  it('다이소 fallback 후보가 비면 원본 검색어로 1회 조회한다', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(createJsonResponse({ success: true, data: { stores: [] } }));

    const result = await cliInteractiveTestables.fetchStoresWithKeywordFallback(fetchImpl, 'daiso', '   ');

    expect(result.matchedKeyword).toBe('   ');
    expect(result.stores).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledWith('https://mcp.aka.page/api/daiso/stores?keyword=+++&limit=10');
  });

  it('CU 매장 검색은 fallback 없이 원본 검색어로 조회한다', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: { stores: [{ storeName: 'CU 강남점', address: '서울', phone: '02' }] },
        }),
      );

    const result = await cliInteractiveTestables.fetchStoresWithKeywordFallback(fetchImpl, 'cu', '강남');

    expect(result.matchedKeyword).toBe('강남');
    expect(result.stores).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledWith('https://mcp.aka.page/api/cu/stores?keyword=%EA%B0%95%EB%82%A8&limit=10');
  });

  it('fetchEnvelope는 HTTP 오류를 처리한다', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(createJsonResponse({}, false, 500));
    await expect(cliInteractiveTestables.fetchEnvelope(fetchImpl, '/api/daiso/stores')).rejects.toThrow('HTTP 500');
  });

  it('입력 헬퍼가 반복 입력을 처리한다', async () => {
    const out: string[] = [];
    const menu = await cliInteractiveTestables.askMenu(
      createPrompt(['a', '-1', '3']),
      '번호:',
      ['a', 'b', 'c'],
      (message) => out.push(message),
    );
    expect(menu).toBe(3);
    expect(out.join('\n')).toContain('번호로 입력하세요');
    expect(out.join('\n')).toContain('0부터 3 사이');

    const yes = await cliInteractiveTestables.askYesNo(createPrompt(['maybe', 'yes']), '계속?');
    expect(yes).toBe(true);
    const no = await cliInteractiveTestables.askYesNo(createPrompt(['N']), '계속?');
    expect(no).toBe(false);

    const text = await cliInteractiveTestables.askNonEmpty(createPrompt(['', '', '강남']), '입력:');
    expect(text).toBe('강남');
  });

  it('다음 동작 선택 분기를 처리한다', async () => {
    const out: string[] = [];
    const same = await cliInteractiveTestables.askNextAction(createPrompt(['1']), (m) => out.push(m));
    const change = await cliInteractiveTestables.askNextAction(createPrompt(['2']), () => {});
    const exit = await cliInteractiveTestables.askNextAction(createPrompt(['3']), () => {});

    expect(same).toBe('same-store');
    expect(change).toBe('change-store');
    expect(exit).toBe('exit');
    expect(out.join('\n')).toContain('[다음 동작]');
  });

  it('printStoreDetail은 정보 없음 문구를 출력한다', () => {
    const out: string[] = [];
    cliInteractiveTestables.printStoreDetail(out.push.bind(out), { name: '매장', address: '', phone: '' });
    expect(out.join('\n')).toContain('정보 없음');
  });

  it('runDaisoItemSearch의 예외 분기를 처리한다', async () => {
    const out: string[] = [];
    const depsBase = {
      writeOut: (m: string) => out.push(m),
      writeErr: () => {},
    };
    const store = { name: '다이소 강남점', address: '서울', phone: '02' };

    await cliInteractiveTestables.runDaisoItemSearch(
      {
        ...depsBase,
        fetchImpl: vi.fn<typeof fetch>().mockResolvedValueOnce(
          createJsonResponse({ success: true, data: { products: [] } }),
        ),
      },
      createPrompt(['박스']),
      store,
    );
    expect(out.join('\n')).toContain('검색된 다이소 상품이 없습니다.');

    await cliInteractiveTestables.runDaisoItemSearch(
      {
        ...depsBase,
        fetchImpl: vi.fn<typeof fetch>().mockResolvedValueOnce(
          createJsonResponse({ success: true, data: { products: [{ id: 'P1', name: '박스', price: 1000 }] } }),
        ),
      },
      createPrompt(['박스', '0']),
      store,
    );
    expect(out.join('\n')).toContain('상품 선택을 취소했습니다.');

    await cliInteractiveTestables.runDaisoItemSearch(
      {
        ...depsBase,
        fetchImpl: vi
          .fn<typeof fetch>()
          .mockResolvedValueOnce(
            createJsonResponse({ success: true, data: { products: [{ id: 'P1', name: '박스', price: 1000 }] } }),
          )
          .mockResolvedValueOnce(createJsonResponse({ success: false })),
      },
      createPrompt(['박스', '1']),
      store,
    );
    expect(out.join('\n')).toContain('재고 응답을 해석하지 못했습니다.');

    await cliInteractiveTestables.runDaisoItemSearch(
      {
        ...depsBase,
        fetchImpl: vi
          .fn<typeof fetch>()
          .mockResolvedValueOnce(
            createJsonResponse({ success: true, data: { products: [{ id: 'P1', name: '박스', price: 1000 }] } }),
          )
          .mockResolvedValueOnce(createJsonResponse({ success: true, data: { storeInventory: {} } })),
      },
      createPrompt(['박스', '1']),
      store,
    );
    expect(out.join('\n')).toContain('매장 재고 데이터가 없습니다.');

    await cliInteractiveTestables.runDaisoItemSearch(
      {
        ...depsBase,
        fetchImpl: vi
          .fn<typeof fetch>()
          .mockResolvedValueOnce(
            createJsonResponse({ success: true, data: { products: [{ id: 'P1', name: '박스', price: 1000 }] } }),
          )
          .mockResolvedValueOnce(
            createJsonResponse({ success: true, data: { storeInventory: { stores: ['invalid', { storeName: '다른점', quantity: 0 }] } } }),
          ),
      },
      createPrompt(['박스', '1']),
      store,
    );
    expect(out.join('\n')).toContain('선택 매장에 대한 재고 정보를 찾지 못했습니다.');

    await cliInteractiveTestables.runDaisoItemSearch(
      {
        ...depsBase,
        fetchImpl: vi
          .fn<typeof fetch>()
          .mockResolvedValueOnce(
            createJsonResponse({ success: true, data: { products: [{ id: 'P1', name: '박스', price: 1000 }] } }),
          )
          .mockResolvedValueOnce(
            createJsonResponse({
              success: true,
              data: { storeInventory: { stores: [{ storeName: '다이소 강남점' }] } },
            }),
          ),
      },
      createPrompt(['박스', '1']),
      store,
    );
    expect(out.join('\n')).toContain('재고 수량: 0');
  });

  it('runOliveyoungItemSearch의 예외 분기를 처리한다', async () => {
    const out: string[] = [];
    const depsBase = {
      writeOut: (m: string) => out.push(m),
      writeErr: () => {},
    };
    const store = { name: '올리브영 강남점', address: '서울', phone: '02' };

    await cliInteractiveTestables.runOliveyoungItemSearch(
      {
        ...depsBase,
        fetchImpl: vi.fn<typeof fetch>().mockResolvedValueOnce(createJsonResponse({ success: false })),
      },
      createPrompt(['선크림']),
      store,
    );
    expect(out.join('\n')).toContain('재고 응답을 해석하지 못했습니다.');

    await cliInteractiveTestables.runOliveyoungItemSearch(
      {
        ...depsBase,
        fetchImpl: vi.fn<typeof fetch>().mockResolvedValueOnce(createJsonResponse({ success: true, data: {} })),
      },
      createPrompt(['선크림']),
      store,
    );
    expect(out.join('\n')).toContain('올리브영 상품 데이터가 없습니다.');

    await cliInteractiveTestables.runOliveyoungItemSearch(
      {
        ...depsBase,
        fetchImpl: vi
          .fn<typeof fetch>()
          .mockResolvedValueOnce(
            createJsonResponse({ success: true, data: { inventory: { products: [{ goodsNumber: 'A1' }] } } }),
          ),
      },
      createPrompt(['선크림']),
      store,
    );
    expect(out.join('\n')).toContain('검색된 상품이 없습니다.');

    await cliInteractiveTestables.runOliveyoungItemSearch(
      {
        ...depsBase,
        fetchImpl: vi
          .fn<typeof fetch>()
          .mockResolvedValueOnce(
            createJsonResponse({
              success: true,
              data: {
                inventory: {
                  products: [{ goodsNumber: 'A1', goodsName: '선크림A', priceToPay: 12000, o2oRemainQuantity: 3 }],
                },
              },
            }),
          ),
      },
      createPrompt(['선크림', '0']),
      store,
    );
    expect(out.join('\n')).toContain('상품 선택을 취소했습니다.');

    await cliInteractiveTestables.runOliveyoungItemSearch(
      {
        ...depsBase,
        fetchImpl: vi
          .fn<typeof fetch>()
          .mockResolvedValueOnce(
            createJsonResponse({
              success: true,
              data: {
                inventory: {
                  products: [{ goodsNumber: 'A1', goodsName: '선크림A', priceToPay: 12000, o2oRemainQuantity: 3 }],
                },
              },
            }),
          ),
      },
      createPrompt(['선크림', '1']),
      store,
    );
    expect(out.join('\n')).toContain('남은수량: 3');
  });

  it('runCuItemSearch의 예외/성공 분기를 처리한다', async () => {
    const out: string[] = [];
    const depsBase = {
      writeOut: (m: string) => out.push(m),
      writeErr: () => {},
    };
    const store = { name: 'CU 강남점', address: '서울', phone: '02' };

    await cliInteractiveTestables.runCuItemSearch(
      {
        ...depsBase,
        fetchImpl: vi.fn<typeof fetch>().mockResolvedValueOnce(createJsonResponse({ success: false })),
      },
      createPrompt(['과자']),
      store,
    );
    expect(out.join('\n')).toContain('재고 응답을 해석하지 못했습니다.');

    await cliInteractiveTestables.runCuItemSearch(
      {
        ...depsBase,
        fetchImpl: vi.fn<typeof fetch>().mockResolvedValueOnce(createJsonResponse({ success: true, data: {} })),
      },
      createPrompt(['과자']),
      store,
    );
    expect(out.join('\n')).toContain('CU 상품 데이터가 없습니다.');

    await cliInteractiveTestables.runCuItemSearch(
      {
        ...depsBase,
        fetchImpl: vi
          .fn<typeof fetch>()
          .mockResolvedValueOnce(
            createJsonResponse({
              success: true,
              data: {
                inventory: {
                  items: [{ itemCode: '8801' }],
                },
              },
            }),
          ),
      },
      createPrompt(['과자']),
      store,
    );
    expect(out.join('\n')).toContain('검색된 상품이 없습니다.');

    await cliInteractiveTestables.runCuItemSearch(
      {
        ...depsBase,
        fetchImpl: vi
          .fn<typeof fetch>()
          .mockResolvedValueOnce(
            createJsonResponse({
              success: true,
              data: {
                inventory: {
                  items: [
                    {
                      itemCode: '8801',
                      itemName: '감자칩',
                      price: 1700,
                      pickupYn: true,
                      deliveryYn: false,
                      reserveYn: false,
                    },
                  ],
                },
              },
            }),
          ),
      },
      createPrompt(['과자', '/감자', '0']),
      store,
    );
    expect(out.join('\n')).toContain('상품 선택을 취소했습니다.');

    await cliInteractiveTestables.runCuItemSearch(
      {
        ...depsBase,
        fetchImpl: vi
          .fn<typeof fetch>()
          .mockResolvedValueOnce(
            createJsonResponse({
              success: true,
              data: {
                inventory: {
                  items: [
                    {
                      itemCode: '8801',
                      itemName: '감자칩',
                      price: 1700,
                      pickupYn: true,
                      deliveryYn: false,
                      reserveYn: false,
                    },
                  ],
                },
              },
            }),
          ),
      },
      createPrompt(['과자', '1']),
      store,
    );
    expect(out.join('\n')).toContain('픽업 가능: 예');
    expect(out.join('\n')).toContain('배달 가능: 아니오');

    await cliInteractiveTestables.runCuItemSearch(
      {
        ...depsBase,
        fetchImpl: vi
          .fn<typeof fetch>()
          .mockResolvedValueOnce(
            createJsonResponse({
              success: true,
              data: {
                inventory: {
                  items: [
                    {
                      itemCode: '9901',
                      itemName: '콜라',
                      price: 2000,
                      pickupYn: false,
                      deliveryYn: true,
                      reserveYn: true,
                    },
                  ],
                },
              },
            }),
          ),
      },
      createPrompt(['음료', '1']),
      store,
    );
    expect(out.join('\n')).toContain('픽업 가능: 아니오');
    expect(out.join('\n')).toContain('배달 가능: 예');
    expect(out.join('\n')).toContain('예약 가능: 예');
  });
});
