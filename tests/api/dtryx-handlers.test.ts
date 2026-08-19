/**
 * 디트릭스 API 핸들러 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleDtryxGetRemainingSeats,
  handleDtryxListCinemas,
  handleDtryxListNowShowing,
} from '../../src/api/dtryxHandlers.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createMockContext(query: Record<string, string> = {}) {
  return {
    env: {},
    req: {
      query: (key: string) => query[key],
      param: () => undefined,
      url: 'https://example.com/api/dtryx/seats',
    },
    json: vi.fn().mockImplementation((data, status) => ({
      data,
      status: status || 200,
    })),
  } as unknown as Parameters<typeof handleDtryxListCinemas>[0];
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('GET /api/dtryx/cinemas', () => {
  it('극장 목록을 반환한다', async () => {
    const result = (await handleDtryxListCinemas(createMockContext())) as unknown as {
      data: { success: boolean; data: { count: number } };
    };

    expect(result.data.success).toBe(true);
    expect(result.data.data.count).toBeGreaterThan(0);
  });

  it('브랜드 코드로 걸러낸다', async () => {
    const result = (await handleDtryxListCinemas(
      createMockContext({ brandCode: 'spacedog' }),
    )) as unknown as { data: { data: { count: number } } };

    expect(result.data.data.count).toBe(1);
  });
});

describe('GET /api/dtryx/movies', () => {
  it('상영작을 반환한다', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ Recordset: [{ MovieCd: '1', MovieNm: '경멸' }] }));

    const result = (await handleDtryxListNowShowing(
      createMockContext({ cinemaCode: '000067' }),
    )) as unknown as { data: { success: boolean; data: { count: number } } };

    expect(result.data.success).toBe(true);
    expect(result.data.data.count).toBe(1);
  });

  it('극장을 찾지 못하면 404 로 응답한다', async () => {
    const result = (await handleDtryxListNowShowing(
      createMockContext({ keyword: '없는극장' }),
    )) as unknown as { status: number };

    expect(result.status).toBe(404);
  });

  it('업스트림 오류는 500 으로 감싼다', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 502));

    const result = (await handleDtryxListNowShowing(
      createMockContext({ cinemaCode: '000067' }),
    )) as unknown as { status: number };

    expect(result.status).toBe(500);
  });
});

describe('GET /api/dtryx/seats', () => {
  it('회차와 좌석을 반환한다', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        Recordset: [
          {
            CinemaCd: '000067',
            CinemaNm: '아트하우스모모',
            ScreenCd: '02',
            MovieCd: '1',
            MovieNm: '경멸',
            PlaySDT: '2026-08-20',
            StartTime: '13:30',
            TotalSeatCnt: 138,
            RemainSeatCnt: 128,
          },
        ],
      }),
    );

    const result = (await handleDtryxGetRemainingSeats(
      createMockContext({ cinemaCode: '000067', playDate: '20260820' }),
    )) as unknown as {
      data: { data: { count: number; showtimes: Array<{ bookedSeats: number }> } };
    };

    expect(result.data.data.count).toBe(1);
    expect(result.data.data.showtimes[0]?.bookedSeats).toBe(10);
  });

  it('극장을 찾지 못하면 404 로 응답한다', async () => {
    const result = (await handleDtryxGetRemainingSeats(
      createMockContext({ cinemaCode: '000999' }),
    )) as unknown as { status: number };

    expect(result.status).toBe(404);
  });

  it('영화명 필터를 적용한다', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        Recordset: [
          {
            CinemaCd: '000067',
            ScreenCd: '02',
            MovieCd: '1',
            MovieNm: '경멸',
            PlaySDT: '2026-08-20',
            TotalSeatCnt: 10,
            RemainSeatCnt: 5,
          },
        ],
      }),
    );

    const result = (await handleDtryxGetRemainingSeats(
      createMockContext({ cinemaCode: '000067', movieName: '없는영화' }),
    )) as unknown as { data: { data: { count: number } } };

    expect(result.data.data.count).toBe(0);
  });
});
