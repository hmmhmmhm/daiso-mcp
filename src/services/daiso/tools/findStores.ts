/**
 * 매장 찾기 도구
 *
 * 다이소 API를 사용하여 매장을 검색합니다.
 */

import * as z from 'zod';
import type { McpToolResponse, ToolRegistration } from '../../../core/types.js';
import type { Store, StoreOptions } from '../types.js';
import { DAISO_WEB_API, formatTime } from '../api.js';
import { fetchDaisoHtml, fetchDaisoJson } from '../client.js';
import { buildDaisoStoreKeywordVariants } from '../../../utils/daisoKeyword.js';

/** 도구 입력 인터페이스 */
interface FindStoresArgs {
  keyword?: string;
  sido?: string;
  gugun?: string;
  dong?: string;
  limit?: number;
}

/**
 * HTML에서 매장 정보 파싱
 */
function parseStoresFromHtml(html: string): Store[] {
  const stores: Store[] = [];

  // bx-store div 태그의 시작 위치 찾기
  const divStartRegex = /<div[^>]*class="bx-store"[^>]*>/gi;
  let divMatch;

  while ((divMatch = divStartRegex.exec(html)) !== null) {
    const startIdx = divMatch.index;
    const divTag = divMatch[0];

    // 해당 div의 끝 찾기
    const endIdx = html.indexOf('<div class="bx-store"', startIdx + 1);
    const blockEnd = endIdx > 0 ? endIdx : startIdx + 2000;
    const block = html.slice(startIdx, blockEnd);

    // data 속성 추출
    const startMatch = /data-start="(\d+)"/.exec(divTag);
    const endMatch = /data-end="(\d+)"/.exec(divTag);
    const latMatch = /data-lat="([^"]+)"/.exec(divTag);
    const lngMatch = /data-lng="([^"]+)"/.exec(divTag);
    const infoMatch = /data-info='([^']*)'/.exec(divTag);

    if (!startMatch || !endMatch || !latMatch || !lngMatch) continue;

    // 매장명, 전화번호, 주소 추출
    const nameMatch = /<h4[^>]*class="place"[^>]*>([^<]+)<\/h4>/i.exec(block);
    const phoneMatch = /<em[^>]*class="phone"[^>]*>([^<]*)<\/em>/i.exec(block);
    const addrMatch = /<p[^>]*class="addr"[^>]*>([^<]+)<\/p>/i.exec(block);

    if (!nameMatch) continue;

    // data-info JSON 파싱
    let info: Record<string, string> = {};
    if (infoMatch) {
      try {
        const infoStr = infoMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
        info = JSON.parse(infoStr);
      } catch {
        // JSON 파싱 실패 시 빈 객체 사용
      }
    }

    const options: StoreOptions = {
      parking: info.shp_pak === 'Y',
      ramp: info.entrramp === 'Y',
      elevator: info.elvtor === 'Y',
      cashless: info.ptcard === 'Y',
      photoSticker: info.ptstk === 'Y',
      nameSticker: info.nmstk === 'Y',
      simCard: info.usim_yn === 'Y',
      taxFree: info.tax_free === 'Y',
      groupOrder: info['ext.group_yn'] === 'Y' || info.group_yn === 'Y',
      pickup: info.online_yn === 'Y',
    };

    stores.push({
      name: nameMatch[1].trim(),
      phone: phoneMatch ? phoneMatch[1].replace('T.', '').trim() : '',
      address: addrMatch ? addrMatch[1].trim() : '',
      lat: parseFloat(latMatch[1]),
      lng: parseFloat(lngMatch[1]),
      openTime: formatTime(startMatch[1]),
      closeTime: formatTime(endMatch[1]),
      options,
    });
  }

  return stores;
}

/**
 * 다이소 매장 검색 API 호출
 */
export async function fetchStores(
  keyword?: string,
  sido?: string,
  gugun?: string,
  dong?: string
): Promise<Store[]> {
  const searchKeywords =
    keyword && !sido && !gugun && !dong
      ? buildDaisoStoreKeywordVariants(keyword)
      : [keyword || ''];

  for (const searchKeyword of searchKeywords) {
    const url = new URL(DAISO_WEB_API.SHOP_SEARCH);

    url.searchParams.set('name_address', searchKeyword);
    url.searchParams.set('sido', sido || '');
    url.searchParams.set('gugun', gugun || '');
    url.searchParams.set('dong', dong || '');

    const html = await fetchDaisoHtml(url.toString());
    const stores = parseStoresFromHtml(html);
    if (stores.length > 0) {
      return stores;
    }
  }

  return [];
}

/**
 * 시/도별 구/군 목록 조회
 */
export async function getDistricts(sido: string): Promise<string[]> {
  const url = new URL(DAISO_WEB_API.SIDO_SEARCH);
  url.searchParams.set('sido', sido);

  const data = await fetchDaisoJson<Array<{ value: string }>>(url.toString());
  return data.map((item) => item.value);
}

/**
 * 구/군별 동 목록 조회
 */
export async function getNeighborhoods(sido: string, gugun: string): Promise<string[]> {
  const url = new URL(DAISO_WEB_API.GUGUN_SEARCH);
  url.searchParams.set('sido', sido);
  url.searchParams.set('gugun', gugun);

  const data = await fetchDaisoJson<Array<{ value: string }>>(url.toString());
  return data.map((item) => item.value);
}

/**
 * 매장 검색 핸들러
 */
async function findStores(args: FindStoresArgs): Promise<McpToolResponse> {
  const { keyword, sido, gugun, dong, limit = 50 } = args;

  // 최소한 하나의 검색 조건이 필요
  if (!keyword && !sido) {
    throw new Error('검색어(keyword) 또는 지역(sido)을 입력해주세요.');
  }

  const stores = await fetchStores(keyword, sido, gugun, dong);
  const limitedStores = stores.slice(0, limit);

  const result = {
    searchParams: { keyword, sido, gugun, dong },
    totalCount: stores.length,
    count: limitedStores.length,
    stores: limitedStores,
  };

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

/**
 * 도구 등록 정보 생성
 */
export function createFindStoresTool(): ToolRegistration {
  return {
    name: 'daiso_find_stores',
    metadata: {
      title: '매장 검색',
      description:
        '다이소 매장을 검색합니다. 키워드(매장명, 주소) 또는 지역(시도/구군/동)으로 검색할 수 있습니다.',
      inputSchema: {
        keyword: z.string().optional().describe('검색할 매장명 또는 주소 키워드 (예: 강남, 홍대)'),
        sido: z.string().optional().describe('시/도 (예: 서울, 경기, 부산)'),
        gugun: z.string().optional().describe('구/군 (예: 강남구, 마포구)'),
        dong: z.string().optional().describe('동 (예: 역삼동, 합정동)'),
        limit: z.number().optional().default(50).describe('반환할 최대 매장 수 (기본값: 50)'),
      },
    },
    handler: findStores as (args: unknown) => Promise<McpToolResponse>,
  };
}
