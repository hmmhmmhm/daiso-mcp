/**
 * 디트릭스 상영시간표·잔여 좌석 조회 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import {
  DTRYX_CINEMAS,
  findCinemaByCode,
  findCinemasByKeyword,
  findCinemasByRegion,
} from '../location.js';
import { fetchDtryxTimetable, toYyyymmdd } from '../client.js';
import type { DtryxCinema, DtryxShowtime } from '../types.js';

interface GetRemainingSeatsArgs {
  playDate?: string;
  cinemaCode?: string;
  keyword?: string;
  region?: string;
  brandCode?: string;
  movieName?: string;
  limit?: number;
  timeoutMs?: number;
}

/** 조회 대상 극장을 결정합니다. 지정이 없으면 카탈로그 전체를 훑습니다. */
function resolveCinemas(args: GetRemainingSeatsArgs): DtryxCinema[] {
  if (args.cinemaCode) {
    const known = findCinemaByCode(args.cinemaCode);
    if (known) {
      return [known];
    }

    return args.brandCode
      ? [
          {
            brandCode: args.brandCode,
            cinemaCode: args.cinemaCode,
            cinemaName: '',
            region: '',
            address: '',
          },
        ]
      : [];
  }

  if (args.keyword) {
    return findCinemasByKeyword(args.keyword);
  }

  if (args.region) {
    return findCinemasByRegion(args.region);
  }

  return [...DTRYX_CINEMAS];
}

function matchesMovie(showtime: DtryxShowtime, movieName?: string): boolean {
  if (!movieName) {
    return true;
  }

  const normalize = (value: string) => value.replace(/\s+/g, '').toLowerCase();
  return normalize(showtime.movieName).includes(normalize(movieName));
}

async function getRemainingSeats(args: GetRemainingSeatsArgs): Promise<McpToolResponse> {
  const { playDate = toYyyymmdd(), movieName, limit = 50, timeoutMs = 15000 } = args;
  const cinemas = resolveCinemas(args);

  if (cinemas.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error:
                '극장을 찾을 수 없습니다. 카탈로그에 없는 극장 코드는 brandCode 와 함께 지정해야 합니다. 목록은 dtryx_list_cinemas 로 확인할 수 있습니다.',
              filters: { cinemaCode: args.cinemaCode || null, keyword: args.keyword || null },
            },
            null,
            2,
          ),
        },
      ],
      isError: true,
    };
  }

  const settled = await Promise.allSettled(
    cinemas.map((cinema) =>
      fetchDtryxTimetable({
        brandCode: cinema.brandCode,
        cinemaCode: cinema.cinemaCode,
        playDate,
        timeout: timeoutMs,
      }),
    ),
  );

  const failedCinemas = cinemas
    .filter((_, index) => settled[index]?.status === 'rejected')
    .map((cinema) => cinema.cinemaName || cinema.cinemaCode);
  const showtimes = settled
    .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
    .filter((showtime) => matchesMovie(showtime, movieName))
    .sort((a, b) => {
      if (a.startTime === b.startTime) {
        return a.cinemaName.localeCompare(b.cinemaName);
      }
      return a.startTime.localeCompare(b.startTime);
    })
    .slice(0, limit);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            playDate,
            filters: {
              cinemaCode: args.cinemaCode || null,
              keyword: args.keyword || null,
              region: args.region || null,
              movieName: movieName || null,
              limit,
            },
            searchedCinemaCount: cinemas.length,
            failedCinemas,
            count: showtimes.length,
            showtimes,
          },
          null,
          2,
        ),
      },
    ],
  };
}

export function createGetRemainingSeatsTool(): ToolRegistration {
  return {
    name: 'dtryx_get_remaining_seats',
    metadata: {
      title: '디트릭스 상영시간표·잔여 좌석 조회',
      description:
        '디트릭스 독립·예술영화관의 상영 회차와 잔여 좌석을 조회합니다. 극장을 지정하지 않으면 등록된 전체 극장을 조회하므로 특정 영화의 상영관을 찾을 때 movieName 을 함께 쓸 수 있습니다.',
      inputSchema: {
        playDate: z
          .string()
          .optional()
          .describe('조회 날짜(YYYYMMDD 또는 YYYY-MM-DD, 기본값: 오늘)'),
        cinemaCode: z.string().optional().describe('극장 코드 (예: 000067)'),
        keyword: z.string().optional().describe('극장명 키워드 (예: 모모, 광주)'),
        region: z
          .string()
          .optional()
          .describe('광역 지역명으로 조회 범위를 좁힙니다 (예: 서울, 경기)'),
        brandCode: z
          .string()
          .optional()
          .describe('브랜드 코드. 카탈로그에 없는 극장 코드를 직접 조회할 때 함께 지정합니다.'),
        movieName: z.string().optional().describe('영화명 부분 일치 필터 (예: 경멸)'),
        limit: z.number().optional().default(50).describe('반환할 최대 회차 수 (기본값: 50)'),
        timeoutMs: z
          .number()
          .optional()
          .default(15000)
          .describe('요청 제한 시간(ms, 기본값: 15000)'),
      },
    },
    handler: ((args) => getRemainingSeats(args as GetRemainingSeatsArgs)) as (
      args: unknown,
    ) => Promise<McpToolResponse>,
  };
}
