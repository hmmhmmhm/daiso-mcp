import type { CgvTransportOptions } from '../relayTransport.js';
import {
  validateCinemaOptions,
  cinemaDateSchema,
  cinemaLimitSchema,
  cinemaLatitudeSchema,
  cinemaLongitudeSchema,
} from '../validation.js';
import type { GeocodeOptions } from '../../../utils/geocode.js';
/**
 * CGV 극장 검색 도구
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import { fetchCgvTheaters, toYyyymmdd } from '../client.js';
import { fetchCgvNearbyTheaters } from '../location.js';

interface FindTheatersArgs {
  playDate?: string;
  regionCode?: string;
  keyword?: string;
  latitude?: number;
  longitude?: number;
  limit?: number;
  timeoutMs?: number;
}

async function findTheaters(
  args: FindTheatersArgs,
  apiKey?: string,
  googleMapsApiKey?: string,
  geocodeOptions: GeocodeOptions & CgvTransportOptions = {},
): Promise<McpToolResponse> {
  const {
    playDate = toYyyymmdd(),
    regionCode,
    keyword,
    latitude,
    longitude,
    limit = 30,
    timeoutMs = 15000,
  } = args;

  if (keyword || typeof latitude === 'number' || typeof longitude === 'number') {
    const result = await fetchCgvNearbyTheaters(
      {
        playDate,
        regionCode,
        keyword,
        latitude,
        longitude,
        limit,
        timeout: timeoutMs,
      },
      {
        timeout: timeoutMs,
        zyteApiKey: apiKey,
        ...geocodeOptions,
        googleMapsApiKey,
      },
    );

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }

  const theaters = await fetchCgvTheaters({
    playDate,
    regionCode,
    timeout: timeoutMs,
    ...geocodeOptions,
    zyteApiKey: apiKey,
  });

  const sliced = theaters.slice(0, limit);
  const result = {
    playDate,
    filters: {
      regionCode: regionCode || null,
      keyword: keyword || null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      limit,
    },
    count: sliced.length,
    theaters: sliced,
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

export function createFindTheatersTool(
  apiKey?: string,
  googleMapsApiKey?: string,
  geocodeOptions: GeocodeOptions & CgvTransportOptions = {},
): ToolRegistration {
  return {
    name: 'cgv_find_theaters',
    metadata: {
      title: 'CGV 극장 검색',
      description: '지역 코드 또는 위치 키워드 기준으로 CGV 극장 목록을 조회합니다.',
      inputSchema: {
        playDate: cinemaDateSchema.optional().describe('조회 날짜(YYYYMMDD, 기본값: 오늘)'),
        regionCode: z.string().optional().describe('지역 코드 (예: 01 서울)'),
        keyword: z.string().optional().describe('위치 키워드 (예: 안산 중앙역, 강남역)'),
        latitude: cinemaLatitudeSchema.optional().describe('위도'),
        longitude: cinemaLongitudeSchema.optional().describe('경도'),
        limit: cinemaLimitSchema.optional().default(30).describe('최대 결과 수 (기본값: 30)'),
        timeoutMs: z
          .number()
          .optional()
          .default(15000)
          .describe('요청 제한 시간(ms, 기본값: 15000)'),
      },
    },
    handler: (async (args) => (
      validateCinemaOptions(args),
      findTheaters(args as FindTheatersArgs, apiKey, googleMapsApiKey, geocodeOptions)
    )) as (args: unknown) => Promise<McpToolResponse>,
  };
}
