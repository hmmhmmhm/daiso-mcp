/**
 * 인터랙티브 CLI 테스트
 */

import { describe, expect, it, vi } from 'vitest';
import { runInteractiveCli } from '../../src/cliInteractive.js';

function createJsonResponse(payload: unknown): Response {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue(payload),
  } as unknown as Response;
}

function createPrompt(answers: string[]) {
  let index = 0;

  return () => ({
    ask: async () => {
      const answer = answers[index];
      index += 1;
      return answer ?? '0';
    },
    close: () => {},
  });
}

describe('runInteractiveCli', () => {
  it('다이소 서비스에서 매장/상품 선택 후 재고를 확인하고 종료한다', async () => {
    const output: string[] = [];
    const errors: string[] = [];
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: {
            stores: [{ name: '다이소 강남점', address: '서울 강남구', phone: '02-111-2222' }],
          },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: {
            products: [{ id: 'P1', name: '수납박스', price: 2000 }],
          },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: {
            storeInventory: {
              stores: [{ storeName: '다이소 강남점', quantity: 7 }],
            },
          },
        }),
      );

    const exitCode = await runInteractiveCli({
      fetchImpl,
      writeOut: (message: string) => {
        output.push(message);
      },
      writeErr: (message: string) => {
        errors.push(message);
      },
      createPrompt: createPrompt(['1', '강남', '/강남', '1', '수납', '/수납', '1', '3']),
    });

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(output.join('\n')).toContain('[선택한 매장 정보]');
    expect(output.join('\n')).toContain('재고 수량: 7');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'https://mcp.aka.page/api/daiso/stores?keyword=%EA%B0%95%EB%82%A8&limit=10');
    expect(fetchImpl).toHaveBeenNthCalledWith(2, 'https://mcp.aka.page/api/daiso/products?q=%EC%88%98%EB%82%A9&pageSize=10');
    expect(fetchImpl).toHaveBeenNthCalledWith(
      3,
      'https://mcp.aka.page/api/daiso/inventory?productId=P1&keyword=%EB%8B%A4%EC%9D%B4%EC%86%8C+%EA%B0%95%EB%82%A8%EC%A0%90&pageSize=50',
    );
  });

  it('매장 검색 결과가 없고 재시도 거부 시 종료한다', async () => {
    const output: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        success: true,
        data: { stores: [] },
      }),
    );

    const exitCode = await runInteractiveCli({
      fetchImpl,
      writeOut: (message: string) => {
        output.push(message);
      },
      writeErr: () => {},
      createPrompt: createPrompt(['1', '없는매장', 'n']),
    });

    expect(exitCode).toBe(0);
    expect(output.join('\n')).toContain('검색된 매장이 없습니다.');
    expect(output.join('\n')).toContain('인터랙티브 모드를 종료합니다.');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('올리브영 매장 검색 결과가 없으면 힌트 없이 종료할 수 있다', async () => {
    const output: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        success: true,
        data: { stores: [] },
      }),
    );

    const exitCode = await runInteractiveCli({
      fetchImpl,
      writeOut: (message: string) => {
        output.push(message);
      },
      writeErr: () => {},
      createPrompt: createPrompt(['2', '없는매장', 'n']),
    });

    expect(exitCode).toBe(0);
    expect(output.join('\n')).toContain('검색된 매장이 없습니다.');
    expect(output.join('\n')).not.toContain('힌트: "안산 중앙역"');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('다이소 매장 검색어를 자동 보정해 검색 결과를 찾는다', async () => {
    const output: string[] = [];
    const errors: string[] = [];
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(createJsonResponse({ success: true, data: { stores: [] } }))
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: { stores: [{ name: '안산중앙본점', address: '경기 안산', phone: '1522-4400' }] },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: { products: [{ id: 'P1', name: '롯데핫식스(250 ml)', price: 1000 }] },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: { storeInventory: { stores: [{ storeName: '안산중앙본점', quantity: 12 }] } },
        }),
      );

    const exitCode = await runInteractiveCli({
      fetchImpl,
      writeOut: (message: string) => {
        output.push(message);
      },
      writeErr: (message: string) => {
        errors.push(message);
      },
      createPrompt: createPrompt(['1', '안산 중앙역', '1', '핫식스', '1', '3']),
    });

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(output.join('\n')).toContain(
      '입력 키워드 "안산 중앙역" 대신 "안산중앙역"로 매장을 찾았습니다.',
    );
    expect(output.join('\n')).toContain('재고 수량: 12');
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('요청 중 오류가 발생하면 에러 코드로 종료한다', async () => {
    const errors: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error('network fail'));

    const exitCode = await runInteractiveCli({
      fetchImpl,
      writeOut: () => {},
      writeErr: (message: string) => {
        errors.push(message);
      },
      createPrompt: createPrompt(['1', '강남']),
    });

    expect(exitCode).toBe(1);
    expect(errors.join('\n')).toContain('인터랙티브 실행 중 오류 발생');
    expect(errors.join('\n')).toContain('network fail');
  });

  it('올리브영 서비스에서 same-store와 change-store 동작을 처리한다', async () => {
    const output: string[] = [];
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: {
            stores: [{ name: '올리브영 강남점', address: '서울 강남구', phone: '02-333-4444' }],
          },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: {
            inventory: {
              products: [{ goodsNumber: 'G1', goodsName: '선크림A', priceToPay: 12000, o2oRemainQuantity: 3 }],
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: {
            inventory: {
              products: [{ goodsNumber: 'G2', goodsName: '립밤B', priceToPay: 8000, o2oRemainQuantity: 1 }],
            },
          },
        }),
      );

    const exitCode = await runInteractiveCli({
      fetchImpl,
      writeOut: (message: string) => {
        output.push(message);
      },
      writeErr: () => {},
      createPrompt: createPrompt([
        '2',
        '강남',
        '/강남',
        '1',
        '선크림',
        '/선크림',
        '1',
        '1',
        '립밤',
        '/립밤',
        '1',
        '2',
        '0',
      ]),
    });

    expect(exitCode).toBe(0);
    expect(output.join('\n')).toContain('- 상품: 선크림A');
    expect(output.join('\n')).toContain('- 상품: 립밤B');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('매장 선택 취소 후 다시 서비스 선택으로 돌아갈 수 있다', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      createJsonResponse({
        success: true,
        data: {
          stores: [{ name: '다이소 강남점', address: '', phone: '02-111-2222' }],
        },
      }),
    );

    const exitCode = await runInteractiveCli({
      fetchImpl,
      writeOut: () => {},
      writeErr: () => {},
      createPrompt: createPrompt(['1', '강남', '0', '0']),
    });

    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('CU 서비스에서 매장/상품 선택 후 재고 정보를 확인한다', async () => {
    const output: string[] = [];
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: {
            stores: [{ storeName: 'CU 강남점', address: '서울 강남구', phone: '02-555-6666' }],
          },
        }),
      )
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
      );

    const exitCode = await runInteractiveCli({
      fetchImpl,
      writeOut: (message: string) => {
        output.push(message);
      },
      writeErr: () => {},
      createPrompt: createPrompt(['3', '강남', '1', '과자', '1', '3']),
    });

    expect(exitCode).toBe(0);
    expect(output.join('\n')).toContain('- 상품: 감자칩');
    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'https://mcp.aka.page/api/cu/stores?keyword=%EA%B0%95%EB%82%A8&limit=10');
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://mcp.aka.page/api/cu/inventory?keyword=%EA%B3%BC%EC%9E%90&storeKeyword=CU+%EA%B0%95%EB%82%A8%EC%A0%90&size=10&storeLimit=10',
    );
  });

  it('요청 중 문자열 오류도 처리한다', async () => {
    const errors: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue('network down');

    const exitCode = await runInteractiveCli({
      fetchImpl,
      writeOut: () => {},
      writeErr: (message: string) => {
        errors.push(message);
      },
      createPrompt: createPrompt(['1', '강남']),
    });

    expect(exitCode).toBe(1);
    expect(errors.join('\n')).toContain('network down');
  });

  it('롯데시네마 서비스에서 극장/영화/좌석 정보를 확인한다', async () => {
    const output: string[] = [];
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: {
            theaters: [
              {
                theaterId: '3012',
                theaterName: '센트럴락',
                address: '고잔로 108 (조이월드)',
                distanceKm: 0.36,
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: {
            movies: [{ movieId: '23816', movieName: '왕과 사는 남자' }],
            showtimes: [
              {
                movieName: '왕과 사는 남자',
                screenName: '3관',
                startTime: '10:20',
                remainingSeats: 92,
                totalSeats: 92,
              },
            ],
          },
        }),
      );

    const exitCode = await runInteractiveCli({
      fetchImpl,
      writeOut: (message: string) => {
        output.push(message);
      },
      writeErr: () => {},
      createPrompt: createPrompt(['4', '센트럴', '1', '20260310', '3']),
    });

    expect(exitCode).toBe(0);
    expect(output.join('\n')).toContain('[선택한 극장 정보]');
    expect(output.join('\n')).toContain('상영 영화 수: 1');
    expect(output.join('\n')).toContain('10:20 | 왕과 사는 남자 | 3관 | 92/92');
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://mcp.aka.page/api/lottecinema/theaters?keyword=%EC%84%BC%ED%8A%B8%EB%9F%B4&limit=10',
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://mcp.aka.page/api/lottecinema/movies?playDate=20260310&theaterId=3012',
    );
  });

  it('롯데시네마 서비스에서 same-store와 change-store 동작을 처리한다', async () => {
    const output: string[] = [];
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: {
            theaters: [
              {
                theaterId: '3012',
                theaterName: '센트럴락',
                address: '고잔로 108 (조이월드)',
                distanceKm: 0.36,
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: {
            movies: Array.from({ length: 11 }, (_, index) => ({
              movieId: `M${index + 1}`,
              movieName: `영화${index + 1}`,
            })),
            showtimes: Array.from({ length: 16 }, (_, index) => ({
              movieName: `영화${index + 1}`,
              screenName: '',
              startTime: `1${String(index).padStart(2, '0')}:00`,
              remainingSeats: index,
              totalSeats: 100,
            })),
          },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: {
            movies: [],
            showtimes: [],
          },
        }),
      );

    const exitCode = await runInteractiveCli({
      fetchImpl,
      writeOut: (message: string) => {
        output.push(message);
      },
      writeErr: () => {},
      createPrompt: createPrompt(['4', '센트럴', '1', '20260310', '1', '20260311', '2', '0']),
    });

    expect(exitCode).toBe(0);
    expect(output.join('\n')).toContain('- 영화: ...외 1편');
    expect(output.join('\n')).toContain('...외 1건');
    expect(output.join('\n')).toContain('- 상영 중인 영화가 없습니다.');
    expect(output.join('\n')).toContain('- 회차/좌석 정보가 없습니다.');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('롯데시네마 서비스에서 검색 결과가 없으면 재시도할 수 있다', async () => {
    const output: string[] = [];
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(createJsonResponse({ success: true, data: { theaters: [] } }))
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: {
            theaters: [
              {
                theaterId: '3012',
                theaterName: '센트럴락',
                address: '고잔로 108 (조이월드)',
                distanceKm: 0.36,
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
          data: {
            movies: [{ movieId: '23816', movieName: '왕과 사는 남자' }],
            showtimes: [],
          },
        }),
      );

    const exitCode = await runInteractiveCli({
      fetchImpl,
      writeOut: (message: string) => {
        output.push(message);
      },
      writeErr: () => {},
      createPrompt: createPrompt(['4', '없는극장', 'y', '4', '센트럴', '1', '20260310', '3']),
    });

    expect(exitCode).toBe(0);
    expect(output.join('\n')).toContain('검색된 극장이 없습니다.');
  });
});
