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
      createPrompt: createPrompt(['1', '강남', '1', '수납', '1', '3']),
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
});
