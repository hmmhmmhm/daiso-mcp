/**
 * 올리브영 오특(오늘의 특가) 조회
 *
 * 오특 페이지의 브랜드 특가와 목록 조각의 오늘의 특가를 한국 날짜 기준으로 읽습니다.
 * 원본 HTML 구조가 바뀌면 빈 목록 대신 형식 오류를 반환합니다.
 *
 * @module services/oliveyoung/todayDeals
 */

import { ServiceError } from '../../core/errors.js';
import { OLIVEYOUNG_API } from './api.js';
import { OLIVEYOUNG_TODAY_DEALS_MAX_PAGE } from './htmlRoute.js';
import { requestOliveyoung, type OliveyoungRequestOptions } from './transport.js';

export interface OliveyoungTodayDeal {
  rank: number;
  goodsNo: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  /** 옵션에 따라 가격이 달라져 화면에 "원~"으로 표시되는 상품입니다. */
  priceFrom: boolean;
  originalPrice: number | null;
  discountRate: number | null;
  flags: string[];
  todayDelivery: boolean;
  /** 화면에 "일시품절"로 표시된 상품입니다. */
  soldOut: boolean;
  imageUrl: string;
  productUrl: string;
}

export interface OliveyoungTodayDeals {
  date: string;
  brandDeals: OliveyoungTodayDeal[];
  todayDeals: OliveyoungTodayDeal[];
  /** 최대 페이지까지 모두 가득 차서 이후 상품이 남아 있을 수 있습니다. */
  truncated: boolean;
}

// 목록 조각은 한 번에 10개씩 내려옵니다. 이보다 적으면 마지막 페이지입니다.
const LIST_PAGE_SIZE = 10;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function invalid(): never {
  throw new ServiceError(
    'OLIVEYOUNG_TODAY_DEALS_PARSE_FAILED',
    '올리브영 오특 원본 응답 형식이 변경되었습니다.',
    502,
    false,
  );
}

function decode(value: string): string {
  return value.replace(/&(?:amp|quot|apos|lt|gt|nbsp|#39|#\d+|#x[\da-f]+);/gi, (entity) => {
    const named: Record<string, string> = {
      '&amp;': '&',
      '&quot;': '"',
      '&apos;': "'",
      '&lt;': '<',
      '&gt;': '>',
      '&nbsp;': ' ',
      '&#39;': "'",
    };
    const key = entity.toLowerCase();
    if (named[key] !== undefined) return named[key];
    const code = key.startsWith('&#x') ? parseInt(key.slice(3), 16) : parseInt(key.slice(2), 10);
    return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  });
}

function text(value: string | undefined): string {
  return decode((value ?? '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function amount(value: string | undefined): number | null {
  const digits = (value ?? '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

/** 한국 시간 기준 YYYYMMDD 날짜입니다. 오특은 한국 자정에 바뀝니다. */
export function toKstDate(now: Date): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10).replaceAll('-', '');
}

/**
 * 오특 HTML의 상품 카드를 읽습니다.
 *
 * @param html - 오특 페이지 또는 목록 조각
 * @param section - data-impression의 코너 이름 끝부분 (예: 스페셜). 생략하면 모든 카드
 * @throws {ServiceError} 상품 카드의 필수 값이 없을 때
 */
export function parseOliveyoungTodayDeals(html: string, section?: string): OliveyoungTodayDeal[] {
  const deals: OliveyoungTodayDeal[] = [];
  for (const card of html.split('<li data-impression="').slice(1)) {
    const impression = card.slice(0, card.indexOf('"')).split('^');
    if (section && !impression[1]?.endsWith(`_${section}`)) continue;
    const goodsNo = card.match(/data-ref-goodsNo="([A-Z]\d{12})"/)?.[1];
    const name = text(card.match(/class="prod-name[^"]*">([\s\S]*?)<\/span>/)?.[1]);
    const total = card.match(/class="total">([\s\S]*?)<\/strong>/)?.[1];
    const price = amount(total);
    const rank = Number(impression[2]);
    if (!goodsNo || !name || price === null || !Number.isInteger(rank)) invalid();
    const priceBox = card.match(/class="price">([\s\S]*?)<\/div>/)?.[1] ?? '';
    const rate = card.match(/class="Pnum">\s*(\d+)\s*%/)?.[1];
    deals.push({
      rank,
      goodsNo,
      name,
      brand: decode(card.match(/data-ref-goodsbrand="([^"]*)"/)?.[1] ?? ''),
      category: decode(card.match(/data-ref-goodscategory="([^"]*)"/)?.[1] ?? ''),
      price,
      priceFrom: text(total).endsWith('~'),
      originalPrice: amount(priceBox.match(/class="origin">([\s\S]*?)<\/span>\s*<\/span>/)?.[1]),
      discountRate: rate === undefined ? null : Number(rate),
      flags: [...card.matchAll(/class="flag [^"]*">([\s\S]*?)<\/span>/g)].map((m) => text(m[1])),
      todayDelivery: priceBox.includes('class="oneday"'),
      soldOut: card.includes('class="status_flag soldout"'),
      imageUrl: card.match(/<img src="([^"]+)"/)?.[1] ?? '',
      productUrl: `${OLIVEYOUNG_API.BASE_URL}/store/goods/getGoodsDetail.do?goodsNo=${goodsNo}`,
    });
  }
  return deals;
}

function htmlOf(response: { data?: { html?: string } }): string {
  const html = response.data?.html;
  if (typeof html !== 'string') invalid();
  return html;
}

/**
 * 오늘의 브랜드 특가와 오늘의 특가 전체 목록을 조회합니다.
 *
 * @param options - 직접 조회 또는 중계 설정
 * @param now - 기준 시각 (테스트용)
 * @throws {ServiceError | Error} 원본 차단, 중계 실패, 형식 변경 시
 */
export async function fetchOliveyoungTodayDeals(
  options: OliveyoungRequestOptions = {},
  now = new Date(),
): Promise<OliveyoungTodayDeals> {
  const date = toKstDate(now);
  // 페이지 여러 개를 합친 전체 제한 시간입니다.
  const deadline = Date.now() + (options.timeout ?? (options.relayUrl ? 60000 : 15000));
  const request = (path: string, body: Record<string, unknown>) => {
    const timeout = deadline - Date.now();
    if (timeout <= 0) {
      throw new ServiceError('OLIVEYOUNG_TODAY_DEALS_TIMEOUT', '올리브영 오특 조회 시간 초과', 504, true);
    }
    return requestOliveyoung(path, body, { ...options, timeout });
  };
  const page = await request(OLIVEYOUNG_API.TODAY_DEALS_PAGE_PATH, { date });
  const brandDeals = parseOliveyoungTodayDeals(htmlOf(page), '스페셜');
  const todayDeals: OliveyoungTodayDeal[] = [];
  const seen = new Set<string>();
  let truncated = false;
  for (let pageIdx = 1; pageIdx <= OLIVEYOUNG_TODAY_DEALS_MAX_PAGE; pageIdx++) {
    const list = await request(OLIVEYOUNG_API.TODAY_DEALS_LIST_PATH, { date, pageIdx });
    const items = parseOliveyoungTodayDeals(htmlOf(list));
    for (const item of items) {
      if (seen.has(item.goodsNo)) continue;
      seen.add(item.goodsNo);
      todayDeals.push(item);
    }
    if (items.length < LIST_PAGE_SIZE) break;
    truncated = pageIdx === OLIVEYOUNG_TODAY_DEALS_MAX_PAGE;
  }
  return {
    date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`,
    brandDeals,
    todayDeals,
    truncated,
  };
}
