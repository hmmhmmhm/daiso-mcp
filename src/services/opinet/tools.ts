import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../core/types.js';
import {
  fetchOpinetAveragePrices,
  fetchOpinetLowestStations,
  fetchOpinetStationDetail,
  fetchOpinetStationsAround,
} from './client.js';

function buildTextResponse(payload: object): McpToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload as Record<string, unknown>,
  };
}

export function createOpinetAveragePricesTool(apiKey?: string): ToolRegistration {
  return {
    name: 'opinet_get_average_prices',
    metadata: {
      title: '오피넷 전국 평균 유가',
      description: '한국석유공사 오피넷의 전국 평균 유가를 조회합니다.',
      inputSchema: {
        timeoutMs: z.number().optional().default(10000).describe('요청 제한 시간(ms)'),
      },
    },
    handler: (async (args: { timeoutMs?: number }) =>
      buildTextResponse(await fetchOpinetAveragePrices({ apiKey, timeoutMs: args.timeoutMs }))) as (
      args: unknown,
    ) => Promise<McpToolResponse>,
  };
}

export function createOpinetLowestStationsTool(apiKey?: string): ToolRegistration {
  return {
    name: 'opinet_get_lowest_price_stations',
    metadata: {
      title: '오피넷 최저가 주유소',
      description: '전국 또는 지역별 최저가 주유소를 유종별로 조회합니다.',
      inputSchema: {
        fuelCode: z
          .enum(['B027', 'D047', 'B034', 'C004', 'K015'])
          .optional()
          .default('B027')
          .describe('유종 코드: B027 휘발유, D047 경유, B034 고급휘발유, C004 실내등유, K015 자동차부탄'),
        areaCode: z.string().optional().describe('오피넷 지역 코드. 미입력 시 전국 기준'),
        count: z.number().optional().default(10).describe('최저가 결과 수(1~20)'),
        timeoutMs: z.number().optional().default(10000).describe('요청 제한 시간(ms)'),
      },
    },
    handler: (async (args: { fuelCode?: string; areaCode?: string; count?: number; timeoutMs?: number }) =>
      buildTextResponse(
        await fetchOpinetLowestStations(args, { apiKey, timeoutMs: args.timeoutMs }),
      )) as (args: unknown) => Promise<McpToolResponse>,
  };
}

export function createOpinetStationsAroundTool(apiKey?: string): ToolRegistration {
  return {
    name: 'opinet_search_stations_around',
    metadata: {
      title: '오피넷 반경 내 주유소',
      description:
        'KATEC x/y 좌표 기준 반경 내 주유소를 가격순 또는 거리순으로 조회합니다. 오피넷 API 제약상 위경도가 아닌 KATEC 좌표가 필요합니다.',
      inputSchema: {
        x: z.number().describe('기준 위치 X좌표(KATEC)'),
        y: z.number().describe('기준 위치 Y좌표(KATEC)'),
        radiusMeters: z.number().optional().default(3000).describe('검색 반경 m(100~5000)'),
        fuelCode: z
          .enum(['B027', 'D047', 'B034', 'C004', 'K015'])
          .optional()
          .default('B027')
          .describe('유종 코드'),
        sort: z.enum(['price', 'distance']).optional().default('price').describe('정렬 기준'),
        timeoutMs: z.number().optional().default(10000).describe('요청 제한 시간(ms)'),
      },
    },
    handler: (async (args: {
      x: number;
      y: number;
      radiusMeters?: number;
      fuelCode?: string;
      sort?: string;
      timeoutMs?: number;
    }) =>
      buildTextResponse(
        await fetchOpinetStationsAround(args, { apiKey, timeoutMs: args.timeoutMs }),
      )) as (args: unknown) => Promise<McpToolResponse>,
  };
}

export function createOpinetStationDetailTool(apiKey?: string): ToolRegistration {
  return {
    name: 'opinet_get_station_detail',
    metadata: {
      title: '오피넷 주유소 상세정보',
      description: '오피넷 주유소 ID로 상세 정보, 부가시설, 유종별 가격을 조회합니다.',
      inputSchema: {
        stationId: z.string().describe('오피넷 주유소 ID'),
        timeoutMs: z.number().optional().default(10000).describe('요청 제한 시간(ms)'),
      },
    },
    handler: (async (args: { stationId: string; timeoutMs?: number }) =>
      buildTextResponse(
        await fetchOpinetStationDetail(args.stationId, { apiKey, timeoutMs: args.timeoutMs }),
      )) as (args: unknown) => Promise<McpToolResponse>,
  };
}
