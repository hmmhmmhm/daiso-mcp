/**
 * 디트릭스 현재 상영작 조회 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { findCinemaByCode, findCinemasByKeyword } from '../catalog.js';
import { fetchDtryxNowShowing, fetchDtryxPlayDates } from '../client.js';
import type { DtryxCinema } from '../types.js';

interface ListNowShowingArgs {
  cinemaCode?: string;
  keyword?: string;
  brandCode?: string;
  includePlayDates?: boolean;
  timeoutMs?: number;
}

function resolveCinema(args: ListNowShowingArgs): DtryxCinema | undefined {
  if (args.cinemaCode) {
    const known = findCinemaByCode(args.cinemaCode);
    if (known) {
      return known;
    }

    return args.brandCode
      ? { brandCode: args.brandCode, cinemaCode: args.cinemaCode, cinemaName: '' }
      : undefined;
  }

  if (args.keyword) {
    return findCinemasByKeyword(args.keyword)[0];
  }

  return undefined;
}

async function listNowShowing(args: ListNowShowingArgs): Promise<McpToolResponse> {
  const { includePlayDates = false, timeoutMs = 15000 } = args;
  const cinema = resolveCinema(args);

  if (!cinema) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error:
                '극장을 찾을 수 없습니다. cinemaCode 를 직접 지정하거나 keyword 로 극장을 지정하세요. 목록은 dtryx_list_cinemas 로 확인할 수 있습니다.',
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

  const request = {
    brandCode: cinema.brandCode,
    cinemaCode: cinema.cinemaCode,
    timeout: timeoutMs,
  };
  const [movies, playDates] = await Promise.all([
    fetchDtryxNowShowing(request),
    includePlayDates ? fetchDtryxPlayDates(request) : Promise.resolve([]),
  ]);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            cinema,
            count: movies.length,
            movies,
            playDates: includePlayDates ? playDates : undefined,
          },
          null,
          2,
        ),
      },
    ],
  };
}

export function createListNowShowingTool(): ToolRegistration {
  return {
    name: 'dtryx_list_now_showing',
    metadata: {
      title: '디트릭스 현재 상영작 조회',
      description:
        '디트릭스 독립·예술영화관의 현재 상영작을 조회합니다. 필요하면 예매 가능한 상영 날짜 목록도 함께 반환합니다.',
      inputSchema: {
        cinemaCode: z.string().optional().describe('극장 코드 (예: 000067)'),
        keyword: z.string().optional().describe('극장명 키워드 (예: 모모, 라이카)'),
        brandCode: z
          .string()
          .optional()
          .describe('브랜드 코드. 카탈로그에 없는 극장 코드를 직접 조회할 때 함께 지정합니다.'),
        includePlayDates: z
          .boolean()
          .optional()
          .default(false)
          .describe('예매 가능한 상영 날짜 목록 포함 여부 (기본값: false)'),
        timeoutMs: z
          .number()
          .optional()
          .default(15000)
          .describe('요청 제한 시간(ms, 기본값: 15000)'),
      },
    },
    handler: ((args) => listNowShowing(args as ListNowShowingArgs)) as (
      args: unknown,
    ) => Promise<McpToolResponse>,
  };
}
