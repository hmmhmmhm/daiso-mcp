/**
 * 통합 비교 API 핸들러 테스트
 */
import { describe, expect, it, vi } from 'vitest';
import { handleCompareProducts } from '../../src/api/compareHandlers.js';

describe('compareHandlers', () => {
  it('성공 응답 생성 중 예외가 나면 실패 응답으로 변환한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            resultSet: {
              result: [
                {
                  totalSize: 1,
                  resultDocuments: [{ PD_NO: 'd1', PDNM: '콜라', PD_PRC: '1500' }],
                },
              ],
            },
          }),
        ),
      ),
    );

    let jsonCallCount = 0;
    const context = {
      req: {
        query: (key: string) =>
          (
            ({
              keyword: '콜라',
              services: 'daiso',
              limit: '1',
            }) as Record<string, string>
          )[key],
      },
      json: (payload: unknown, status?: number) => {
        jsonCallCount += 1;
        if (jsonCallCount === 1) {
          throw { toString: () => 'json failed' };
        }
        return new Response(JSON.stringify(payload), { status });
      },
    };

    const res = await handleCompareProducts(context as never);

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error.code).toBe('COMPARE_PRODUCTS_FAILED');
    expect(data.error.message).toBe('알 수 없는 오류가 발생했습니다.');
  });

  it('성공 응답 생성 중 Error 예외가 나면 메시지를 유지한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            resultSet: {
              result: [
                {
                  totalSize: 1,
                  resultDocuments: [{ PD_NO: 'd1', PDNM: '콜라', PD_PRC: '1500' }],
                },
              ],
            },
          }),
        ),
      ),
    );

    let jsonCallCount = 0;
    const context = {
      req: {
        query: (key: string) =>
          (
            ({
              keyword: '콜라',
              services: 'daiso',
              limit: '1',
            }) as Record<string, string>
          )[key],
      },
      json: (payload: unknown, status?: number) => {
        jsonCallCount += 1;
        if (jsonCallCount === 1) {
          throw new Error('json failed');
        }
        return new Response(JSON.stringify(payload), { status });
      },
    };

    const res = await handleCompareProducts(context as never);

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error.message).toBe('json failed');
  });
});
