/**
 * 디트릭스 MCP 도구 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpToolResponse } from '../../../../src/core/types.js';
import { createGetRemainingSeatsTool } from '../../../../src/services/dtryx/tools/getRemainingSeats.js';
import { createListCinemasTool } from '../../../../src/services/dtryx/tools/listCinemas.js';
import { createListNowShowingTool } from '../../../../src/services/dtryx/tools/listNowShowing.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function parsePayload(response: McpToolResponse): Record<string, unknown> {
  return JSON.parse(response.content[0]?.text ?? '{}') as Record<string, unknown>;
}

function timetableResponse(movieName: string, cinemaName: string) {
  return jsonResponse({
    Recordset: [
      {
        CinemaCd: '000067',
        CinemaNm: cinemaName,
        ScreenCd: '02',
        ScreenNm: '2관',
        PlaySDT: '2026-08-20',
        ShowSeq: 1,
        StartTime: '13:30',
        EndTime: '15:13',
        MovieCd: '027030',
        MovieNm: movieName,
        TotalSeatCnt: 138,
        RemainSeatCnt: 128,
      },
    ],
  });
}

describe('dtryx_list_cinemas', () => {
  it('브랜드 코드로 걸러낸다', async () => {
    const tool = createListCinemasTool();
    const payload = parsePayload(await tool.handler({ brandCode: 'spacedog' }));

    expect(payload.count).toBe(1);
    expect((payload.cinemas as Array<{ cinemaName: string }>)[0]?.cinemaName).toBe('라이카시네마');
  });

  it('limit 으로 개수를 제한한다', async () => {
    const payload = parsePayload(await createListCinemasTool().handler({ limit: 3 }));

    expect(payload.count).toBe(3);
  });

  it('네트워크 호출 없이 동작한다', async () => {
    await createListCinemasTool().handler({});

    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('dtryx_list_now_showing', () => {
  it('키워드로 극장을 해석해 상영작을 반환한다', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ Recordset: [{ MovieCd: '1', MovieNm: '경멸' }] }));

    const payload = parsePayload(await createListNowShowingTool().handler({ keyword: '모모' }));

    expect(payload.count).toBe(1);
    expect((payload.cinema as { cinemaCode: string }).cinemaCode).toBe('000067');
  });

  it('극장을 찾지 못하면 오류로 응답한다', async () => {
    const response = await createListNowShowingTool().handler({ keyword: '없는극장' });

    expect(response.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('카탈로그에 없는 극장은 brandCode 와 함께 조회한다', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ Recordset: [] }));

    const response = await createListNowShowingTool().handler({
      cinemaCode: '000999',
      brandCode: 'etc',
    });

    expect(response.isError).toBeUndefined();
    expect(String(mockFetch.mock.calls[0]?.[0])).toContain('CinemaCd=000999');
  });

  it('brandCode 없이 미등록 극장을 조회하면 오류다', async () => {
    const response = await createListNowShowingTool().handler({ cinemaCode: '000999' });

    expect(response.isError).toBe(true);
  });
});

describe('dtryx_get_remaining_seats', () => {
  it('영화명으로 걸러낸다', async () => {
    mockFetch.mockResolvedValue(timetableResponse('콘크리트 녹색섬', '아트하우스모모'));

    const payload = parsePayload(
      await createGetRemainingSeatsTool().handler({
        cinemaCode: '000067',
        playDate: '20260820',
        movieName: '콘크리트',
      }),
    );

    expect(payload.count).toBe(1);
  });

  it('일치하지 않는 영화명은 제외한다', async () => {
    mockFetch.mockResolvedValue(timetableResponse('콘크리트 녹색섬', '아트하우스모모'));

    const payload = parsePayload(
      await createGetRemainingSeatsTool().handler({
        cinemaCode: '000067',
        playDate: '20260820',
        movieName: '다른영화',
      }),
    );

    expect(payload.count).toBe(0);
  });

  it('극장 미지정이면 카탈로그 전체를 조회한다', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ Recordset: [] }));

    const payload = parsePayload(
      await createGetRemainingSeatsTool().handler({ playDate: '20260820' }),
    );

    expect(payload.searchedCinemaCount).toBeGreaterThan(1);
    expect(mockFetch.mock.calls.length).toBe(payload.searchedCinemaCount);
  });

  it('일부 극장이 실패해도 나머지 결과를 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(timetableResponse('경멸', '아트하우스모모'))
      .mockRejectedValue(new Error('upstream down'));

    const payload = parsePayload(
      await createGetRemainingSeatsTool().handler({ playDate: '20260820' }),
    );

    expect(payload.count).toBe(1);
    expect((payload.failedCinemas as string[]).length).toBeGreaterThan(0);
  });

  it('미등록 극장을 brandCode 없이 조회하면 오류다', async () => {
    const response = await createGetRemainingSeatsTool().handler({ cinemaCode: '000999' });

    expect(response.isError).toBe(true);
  });
});
