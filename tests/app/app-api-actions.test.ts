/**
 * 앱 통합 테스트 - 공통 액션 facade
 */

import { describe, expect, it, vi } from 'vitest';
import app from '../../src/index.js';
import * as actionsProxy from '../../src/api/actionsProxy.js';
import { setupFetchMock } from './testHelpers.js';

const mockFetch = vi.fn();
setupFetchMock(mockFetch);

describe('GET /api/actions/query', () => {
  it('일반 검색 액션을 기존 GET API로 위임한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          resultSet: {
            result: [{ totalSize: 1, resultDocuments: [{ PD_NO: '1', PDNM: 'Test', PD_PRC: '1000' }] }],
          },
        }),
      ),
    );

    const res = await app.request('/api/actions/query?action=daisoSearchProducts&q=test');

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.products[0].id).toBe('1');
  });

  it('path 파라미터 액션을 기존 상세 API로 위임한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          resultSet: {
            result: [
              {
                totalSize: 1,
                resultDocuments: [{ PD_NO: '12345', PDNM: 'Test', PD_PRC: '1000' }],
              },
            ],
          },
        }),
      ),
    );

    const res = await app.request('/api/actions/query?action=daisoGetProduct&productId=12345');

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.id).toBe('12345');
  });

  it('잘못된 action이면 에러를 반환한다', async () => {
    const res = await app.request('/api/actions/query?action=unknownAction');

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('INVALID_ACTION_QUERY');
  });

  it('알 수 없는 예외는 기본 메시지로 감싼다', async () => {
    vi.spyOn(actionsProxy, 'buildActionQueryTargetUrl').mockImplementationOnce(() => {
      throw undefined;
    });

    const res = await app.request('/api/actions/query?action=daisoSearchProducts&q=test');

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.message).toBe('알 수 없는 오류가 발생했습니다.');
  });
});
