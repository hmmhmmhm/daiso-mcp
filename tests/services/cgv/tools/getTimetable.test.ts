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
});
