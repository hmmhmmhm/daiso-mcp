/**
 * CGV 시간표 조회 도구 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGetTimetableTool } from '../../../../src/services/cgv/tools/getTimetable.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  delete process.env.GOOGLE_MAPS_API_KEY;
  vi.restoreAllMocks();
});

describe('createGetTimetableTool', () => {
  it('올바른 도구 정의를 반환한다', () => {
    const tool = createGetTimetableTool();

    expect(tool.name).toBe('cgv_get_timetable');
    expect(tool.metadata.title).toBe('CGV 시간표 조회');
  });

  it('시간표를 시간순으로 반환한다', async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            statusCode: 0,
            statusMessage: '조회 되었습니다.',
            data: [
              {
                siteNo: '0056',
                siteNm: 'CGV강남',
                scnYmd: '20260304',
                scnSseq: '2',
                movNo: 'M1',
                movNm: '영화A',
                scnsrtTm: '1200',
                scnendTm: '1400',
                stcnt: 120,
                frSeatCnt: 40,
              },
              {
                siteNo: '0056',
                siteNm: 'CGV강남',
                scnYmd: '20260304',
                scnSseq: '1',
                movNo: 'M1',
                movNm: '영화A',
                scnsrtTm: '0930',
                scnendTm: '1130',
                stcnt: 120,
                frSeatCnt: 50,
              },
            ],
          }),
        ),
      ),
    );

    const tool = createGetTimetableTool();
    const result = await tool.handler({ playDate: '20260304', theaterCode: '0056', movieCode: 'M1' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(2);
    expect(parsed.timetable[0].scheduleId).toBe('2026030400561');
    expect(parsed.filters.theaterCode).toBe('0056');
    expect(parsed.filters.movieCode).toBe('M1');
  });

  it('동일 시작 시간은 극장명 오름차순으로 정렬한다', async () => {
    mockFetch
      .mockImplementationOnce(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              statusCode: 0,
              statusMessage: '조회 되었습니다.',
              data: [
                {
                  regnGrpCd: '01',
                  regnGrpNm: '서울',
                  siteList: [{ siteNo: '0056', siteNm: '강남' }],
                },
              ],
            }),
          ),
        ),
      )
      .mockImplementationOnce(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              statusCode: 0,
              statusMessage: '조회 되었습니다.',
              data: [
                {
                  siteNo: '0100',
                  siteNm: 'CGV홍대',
                  scnYmd: '20260304',
                  scnSseq: '2',
                  movNo: 'M1',
                  movNm: '영화A',
                  scnsrtTm: '0930',
                  scnendTm: '1130',
                  stcnt: 120,
                  frSeatCnt: 40,
                },
                {
                  siteNo: '0056',
                  siteNm: 'CGV강남',
                  scnYmd: '20260304',
                  scnSseq: '1',
                  movNo: 'M1',
                  movNm: '영화A',
                  scnsrtTm: '0930',
                  scnendTm: '1130',
                  stcnt: 120,
                  frSeatCnt: 50,
                },
              ],
            }),
          ),
        ),
      );

    const tool = createGetTimetableTool();
    const result = await tool.handler({ playDate: '20260304' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.timetable[0].theaterName).toBe('CGV강남');
  });

  it('필터가 없으면 null로 반환한다', async () => {
    mockFetch
      .mockImplementationOnce(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              statusCode: 0,
              statusMessage: '조회 되었습니다.',
              data: [
                {
                  regnGrpCd: '01',
                  regnGrpNm: '서울',
                  siteList: [{ siteNo: '0056', siteNm: '강남' }],
                },
              ],
            }),
          ),
        ),
      )
      .mockImplementationOnce(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              statusCode: 0,
              statusMessage: '조회 되었습니다.',
              data: [
                {
                  siteNo: '0056',
                  siteNm: 'CGV강남',
                  scnYmd: '20260304',
                  scnSseq: '1',
                  movNo: 'M1',
                  movNm: '영화A',
                  scnsrtTm: '0930',
                  scnendTm: '1130',
                  stcnt: 120,
                  frSeatCnt: 50,
                },
              ],
            }),
          ),
        ),
      );

    const tool = createGetTimetableTool();
    const result = await tool.handler({ playDate: '20260304' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.filters.theaterCode).toBeNull();
    expect(parsed.filters.movieCode).toBeNull();
  });

  it('keyword만 있어도 가까운 극장을 골라 시간표를 조회한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 0,
            statusMessage: '조회 되었습니다.',
            data: [
              {
                regnGrpCd: '02',
                regnGrpNm: '경기',
                siteList: [{ siteNo: '0211', siteNm: '안산' }],
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'OK',
            results: [
              {
                formatted_address: '대한민국 경기도 안산시 단원구',
                geometry: {
                  location: { lat: 37.3171, lng: 126.8389 },
                },
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'OK',
            results: [
              {
                formatted_address: '대한민국 경기도 안산시 단원구 고잔동 535',
                geometry: {
                  location: { lat: 37.3172, lng: 126.839 },
                },
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 0,
            statusMessage: '조회 되었습니다.',
            data: [
              {
                siteNo: '0211',
                siteNm: 'CGV안산',
                scnYmd: '20260315',
                scnSseq: '1',
                movNo: 'M1',
                movNm: '영화A',
                scnsrtTm: '0930',
                scnendTm: '1130',
                stcnt: 120,
                frSeatCnt: 50,
              },
            ],
          }),
        ),
      );

    const tool = createGetTimetableTool(undefined, 'test-google-key');
    const result = await tool.handler({ playDate: '20260315', keyword: '안산 중앙역' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.filters.theaterCode).toBe('0211');
    expect(parsed.resolvedTheater.theaterCode).toBe('0211');
    expect(parsed.timetable[0].theaterCode).toBe('0211');
  });

  it('site 시간표에 movieCode가 비어도 영화코드 fallback으로 회차를 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 0,
            statusMessage: '조회 되었습니다.',
            data: [
              {
                siteNo: '0211',
                siteNm: 'CGV안산',
                scnYmd: '20260315',
                scnSseq: '1',
                movNm: '영화A',
                scnsrtTm: '0930',
                scnendTm: '1130',
                stcnt: 100,
                frSeatCnt: 30,
              },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 0,
            statusMessage: '조회 되었습니다.',
            data: [
              {
                siteNo: '0211',
                siteNm: 'CGV안산',
                scnYmd: '20260315',
                scnSseq: '2',
                movNo: 'M1',
                movNm: '영화A',
                scnsrtTm: '1010',
                scnendTm: '1210',
                stcnt: 100,
                frSeatCnt: 25,
              },
            ],
          }),
        ),
      );

    const tool = createGetTimetableTool();
    const result = await tool.handler({ playDate: '20260315', theaterCode: '0211', movieCode: 'M1' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.count).toBe(1);
    expect(parsed.timetable[0]).toMatchObject({
      theaterCode: '0211',
      movieCode: 'M1',
      startTime: '10:10',
      remainingSeats: 25,
    });
  });

  it('keyword 기준 극장을 못 찾으면 빈 시간표를 반환한다', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          statusCode: 0,
          statusMessage: '조회 되었습니다.',
          data: [
            {
              regnGrpCd: '01',
              regnGrpNm: '서울',
              siteList: [{ siteNo: '0056', siteNm: '강남' }],
            },
          ],
        }),
      ),
    );

    const tool = createGetTimetableTool();
    const result = await tool.handler({ playDate: '20260315', keyword: '안산 중앙역' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.filters.theaterCode).toBeNull();
    expect(parsed.resolvedTheater).toBeNull();
    expect(parsed.timetable).toEqual([]);
  });
});
