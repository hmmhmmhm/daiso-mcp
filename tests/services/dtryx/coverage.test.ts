/**
 * 디트릭스 분기 커버리지 보강 테스트
 *
 * 기본값 대입, 정렬 동률 처리, 극장 해석 분기 등 앞선 테스트에서
 * 지나가지 않는 경로를 검증합니다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleDtryxGetRemainingSeats,
  handleDtryxListCinemas,
  handleDtryxListNowShowing,
} from '../../../src/api/dtryxHandlers.js';
import type { McpToolResponse } from '../../../src/core/types.js';
import {
  fetchDtryxNowShowing,
  fetchDtryxPlayDates,
  fetchDtryxTimetable,
} from '../../../src/services/dtryx/client.js';
import { createGetRemainingSeatsTool } from '../../../src/services/dtryx/tools/getRemainingSeats.js';
import { createListCinemasTool } from '../../../src/services/dtryx/tools/listCinemas.js';
import { createListNowShowingTool } from '../../../src/services/dtryx/tools/listNowShowing.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function parsePayload(response: McpToolResponse): Record<string, unknown> {
  return JSON.parse(response.content[0]?.text ?? '{}') as Record<string, unknown>;
}

function createMockContext(query: Record<string, string> = {}) {
  return {
    env: {},
    req: {
      query: (key: string) => query[key],
      param: () => undefined,
      url: 'https://example.com/api/dtryx/seats',
    },
    json: vi.fn().mockImplementation((data, status) => ({ data, status: status || 200 })),
  } as unknown as Parameters<typeof handleDtryxListCinemas>[0];
}

/** 같은 시작 시간에 극장만 다른 두 회차 */
function sameTimeResponse(cinemaName: string) {
  return jsonResponse({
    Recordset: [
      {
        CinemaCd: '000067',
        CinemaNm: cinemaName,
        ScreenCd: '01',
        MovieCd: '1',
        MovieNm: '경멸',
        PlaySDT: '2026-08-20',
        StartTime: '13:30',
        TotalSeatCnt: 10,
        RemainSeatCnt: 5,
      },
    ],
  });
}

describe('클라이언트 기본값 분기', () => {
  it('playDate 를 생략하면 오늘 날짜로 조회한다', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ Recordset: [] }));

    await fetchDtryxTimetable({ brandCode: 'indieart', cinemaCode: '000067' });

    expect(String(mockFetch.mock.calls[0]?.[0])).toMatch(/PlaySDT=\d{4}-\d{2}-\d{2}/);
  });

  it('선택 필드가 없으면 기본값으로 채운다', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        Recordset: [{ CinemaCd: '000067', ScreenCd: '01', MovieCd: '1', PlaySDT: '2026-08-20' }],
      }),
    );

    const showtimes = await fetchDtryxTimetable({
      brandCode: 'indieart',
      cinemaCode: '000067',
      playDate: '20260820',
    });

    expect(showtimes[0]).toMatchObject({
      cinemaName: '',
      screenName: '',
      movieName: '',
      rating: '',
      planStatus: '',
    });
  });

  it('상영작 등급과 상영시간이 없으면 undefined 로 둔다', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ Recordset: [{ MovieCd: '1', MovieNm: '경멸' }] }));

    const movies = await fetchDtryxNowShowing({ brandCode: 'indieart', cinemaCode: '000067' });

    expect(movies[0]?.rating).toBeUndefined();
    expect(movies[0]?.runningMinutes).toBeUndefined();
  });
});

describe('도구 분기', () => {
  it('키워드 없이 전체 목록을 반환한다', async () => {
    const payload = parsePayload(await createListCinemasTool().handler({}));

    expect(payload.count).toBe(22);
  });

  it('등록된 극장 코드를 지정하면 카탈로그 정보를 쓴다', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ Recordset: [] }));

    const payload = parsePayload(
      await createListNowShowingTool().handler({ cinemaCode: '000067' }),
    );

    expect((payload.cinema as { cinemaName: string }).cinemaName).toBe('아트하우스모모');
  });

  it('조건이 하나도 없으면 극장을 찾지 못한다', async () => {
    const response = await createListNowShowingTool().handler({});

    expect(response.isError).toBe(true);
  });

  it('시작 시간이 같으면 극장명 순으로 정렬한다', async () => {
    mockFetch
      .mockResolvedValueOnce(sameTimeResponse('나극장'))
      .mockResolvedValue(sameTimeResponse('가극장'));

    const payload = parsePayload(
      await createGetRemainingSeatsTool().handler({ region: '서울', playDate: '20260820' }),
    );
    const names = (payload.showtimes as Array<{ cinemaName: string }>).map((s) => s.cinemaName);

    expect(names[0]).toBe('가극장');
  });
});

describe('핸들러 분기', () => {
  it('지역으로 조회 범위를 좁힌다', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ Recordset: [] }));

    const result = (await handleDtryxGetRemainingSeats(
      createMockContext({ region: '경기', playDate: '20260820' }),
    )) as unknown as { data: { data: { searchedCinemaCount: number } } };

    expect(result.data.data.searchedCinemaCount).toBe(3);
  });

  it('조건이 없으면 전체 극장을 조회한다', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ Recordset: [] }));

    const result = (await handleDtryxGetRemainingSeats(
      createMockContext({ playDate: '20260820' }),
    )) as unknown as { data: { data: { searchedCinemaCount: number } } };

    expect(result.data.data.searchedCinemaCount).toBe(22);
  });

  it('시작 시간이 같으면 극장명 순으로 정렬한다', async () => {
    mockFetch
      .mockResolvedValueOnce(sameTimeResponse('나극장'))
      .mockResolvedValue(sameTimeResponse('가극장'));

    const result = (await handleDtryxGetRemainingSeats(
      createMockContext({ region: '서울', playDate: '20260820' }),
    )) as unknown as { data: { data: { showtimes: Array<{ cinemaName: string }> } } };

    expect(result.data.data.showtimes[0]?.cinemaName).toBe('가극장');
  });

  it('카탈로그에 없는 극장이 실패하면 코드로 표기한다', async () => {
    mockFetch.mockRejectedValue(new Error('upstream down'));

    const result = (await handleDtryxGetRemainingSeats(
      createMockContext({ cinemaCode: '000999', brandCode: 'etc' }),
    )) as unknown as { data: { data: { failedCinemas: string[] } } };

    expect(result.data.data.failedCinemas).toEqual(['000999']);
  });

  it('키워드로 극장 목록을 걸러낸다', async () => {
    const result = (await handleDtryxListCinemas(
      createMockContext({ keyword: '모모' }),
    )) as unknown as { data: { data: { count: number } } };

    expect(result.data.data.count).toBe(1);
  });
});

describe('남은 분기', () => {
  it('Recordset 이 없으면 빈 배열로 처리한다', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ RetMsg: '정상 완료' }));

    await expect(
      fetchDtryxTimetable({ brandCode: 'indieart', cinemaCode: '000067' }),
    ).resolves.toEqual([]);
    mockFetch.mockResolvedValue(jsonResponse({ RetMsg: '정상 완료' }));
    await expect(
      fetchDtryxPlayDates({ brandCode: 'indieart', cinemaCode: '000067' }),
    ).resolves.toEqual([]);
    mockFetch.mockResolvedValue(jsonResponse({ RetMsg: '정상 완료' }));
    await expect(
      fetchDtryxNowShowing({ brandCode: 'indieart', cinemaCode: '000067' }),
    ).resolves.toEqual([]);
  });

  it('PlaySDT 가 없으면 요청 날짜를 쓴다', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ Recordset: [{ CinemaCd: '000067', ScreenCd: '01', MovieCd: '1' }] }),
    );

    const showtimes = await fetchDtryxTimetable({
      brandCode: 'indieart',
      cinemaCode: '000067',
      playDate: '20260820',
    });

    expect(showtimes[0]?.playDate).toBe('20260820');
  });

  it('상영 날짜 포함을 요청하면 함께 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ Recordset: [{ MovieCd: '1', MovieNm: '경멸' }] }))
      .mockResolvedValueOnce(
        jsonResponse({ Recordset: [{ PlaySDT: '2026-08-20', HiddenYn: 'N', RestYn: 'N' }] }),
      );

    const payload = parsePayload(
      await createListNowShowingTool().handler({ cinemaCode: '000067', includePlayDates: true }),
    );

    expect((payload.playDates as unknown[]).length).toBe(1);
  });

  it('상영 날짜 포함 요청은 API 에서도 동작한다', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ Recordset: [{ MovieCd: '1', MovieNm: '경멸' }] }))
      .mockResolvedValueOnce(
        jsonResponse({ Recordset: [{ PlaySDT: '2026-08-20', HiddenYn: 'N', RestYn: 'N' }] }),
      );

    const result = (await handleDtryxListNowShowing(
      createMockContext({ cinemaCode: '000067', includePlayDates: 'true' }),
    )) as unknown as { data: { data: { playDates: unknown[] } } };

    expect(result.data.data.playDates.length).toBe(1);
  });

  it('문자열이 아닌 오류도 메시지로 감싼다', async () => {
    mockFetch.mockRejectedValue('알 수 없는 실패');

    const result = (await handleDtryxListNowShowing(
      createMockContext({ cinemaCode: '000067' }),
    )) as unknown as { status: number };

    expect(result.status).toBe(500);
  });

  it('도구도 키워드로 극장을 좁힌다', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ Recordset: [] }));

    const payload = parsePayload(
      await createGetRemainingSeatsTool().handler({ keyword: '모모', playDate: '20260820' }),
    );

    expect(payload.searchedCinemaCount).toBe(1);
  });

  it('도구에서 미등록 극장이 실패하면 코드로 표기한다', async () => {
    mockFetch.mockRejectedValue(new Error('upstream down'));

    const payload = parsePayload(
      await createGetRemainingSeatsTool().handler({ cinemaCode: '000999', brandCode: 'etc' }),
    );

    expect(payload.failedCinemas).toEqual(['000999']);
  });

  it('시작 시간이 다르면 시간 순으로 정렬한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          Recordset: [
            {
              CinemaCd: '000067',
              CinemaNm: '가극장',
              ScreenCd: '01',
              MovieCd: '1',
              MovieNm: '경멸',
              PlaySDT: '2026-08-20',
              StartTime: '18:00',
              TotalSeatCnt: 10,
              RemainSeatCnt: 5,
            },
          ],
        }),
      )
      .mockResolvedValue(sameTimeResponse('나극장'));

    const payload = parsePayload(
      await createGetRemainingSeatsTool().handler({ region: '서울', playDate: '20260820' }),
    );
    const times = (payload.showtimes as Array<{ startTime: string }>).map((s) => s.startTime);

    expect(times[0]).toBe('13:30');
  });
});

describe('마지막 분기', () => {
  it('핸들러도 시작 시간이 다르면 시간 순으로 정렬한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          Recordset: [
            {
              CinemaCd: '000067',
              CinemaNm: '가극장',
              ScreenCd: '01',
              MovieCd: '1',
              MovieNm: '경멸',
              PlaySDT: '2026-08-20',
              StartTime: '18:00',
              TotalSeatCnt: 10,
              RemainSeatCnt: 5,
            },
          ],
        }),
      )
      .mockResolvedValue(sameTimeResponse('나극장'));

    const result = (await handleDtryxGetRemainingSeats(
      createMockContext({ region: '서울', playDate: '20260820' }),
    )) as unknown as { data: { data: { showtimes: Array<{ startTime: string }> } } };

    expect(result.data.data.showtimes[0]?.startTime).toBe('13:30');
  });

  it('키워드로 찾지 못하면 키워드를 담아 오류를 돌려준다', async () => {
    const response = await createGetRemainingSeatsTool().handler({ keyword: '없는극장' });
    const payload = parsePayload(response);

    expect(response.isError).toBe(true);
    expect((payload.filters as { keyword: string | null }).keyword).toBe('없는극장');
    expect((payload.filters as { cinemaCode: string | null }).cinemaCode).toBeNull();
  });

  it('극장 목록도 키워드로 걸러낸다', async () => {
    const payload = parsePayload(await createListCinemasTool().handler({ keyword: '광주' }));

    expect(payload.count).toBe(2);
  });
});
