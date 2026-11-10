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

/** coming soon 배너의 다음 오특 예고 상품입니다. 가격과 할인율은 원본에 없습니다. */
export interface OliveyoungUpcomingDeal {
  /** 썸네일 파일명에서 읽은 상품번호입니다. 파일명 형식이 다르면 null입니다. */
  goodsNo: string | null;
  name: string;
  imageUrl: string;
  productUrl: string | null;
}

export interface OliveyoungTodayDeals {
  date: string;
  brandDeals: OliveyoungTodayDeal[];
  todayDeals: OliveyoungTodayDeal[];
  /** 최대 페이지까지 모두 가득 차서 이후 상품이 남아 있을 수 있습니다. */
  truncated: boolean;
  /** 다음 오특 예고입니다. 배너 구조를 확인하지 못하면 null(미확인)입니다. */
  upcomingDeals: OliveyoungUpcomingDeal[] | null;
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
  const source = section
    ? [...html.matchAll(/<ul\b[^>]*class="[^"]*\bprod-list\b[^"]*"[^>]*>[\s\S]*?<\/ul>/g)]
        .map((match) => match[0])
        .filter((list) => list.includes(`_${section}`))
        .join('\n')
    : html;
  const cards = source.split('<li data-impression="').slice(1);
  const sourceCount = (source.match(/<li\b/g) ?? []).length;
  // 인식하지 못한 카드가 있으면 부분 결과로 페이지 순회를 종료하지 않습니다.
  if (cards.length !== sourceCount || (!section && html.trim() !== '' && !cards.length)) invalid();
  for (const card of cards) {
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
  if (section) {
    const expected = [...html.matchAll(/data-ref-cornernm="([^"]*)"/g)].filter((match) =>
      match[1].endsWith(`_${section}`),
    ).length;
    if (deals.length !== expected) invalid();
  }
  return deals;
}

/** 중첩 div의 닫힘까지 잘라 뒤쪽 카드나 푸터의 필드를 빌리지 않습니다. */
function divElement(source: string): string | null {
  let depth = 0;
  for (const tag of source.matchAll(/<div\b[^>]*>|<\/div\s*>/g)) {
    depth += tag[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return source.slice(0, tag.index + tag[0].length);
  }
  return null;
}

/**
 * 오특 페이지의 coming soon 배너에서 다음 오특 예고 상품을 읽습니다.
 *
 * 배너는 화면에서 숨겨져 있어도 페이지 HTML에 들어 있습니다. 2026-10-26 21:17 배너 31개가
 * 10-27 오특 31개와 상품번호까지 일치했습니다. 썸네일 파일명은 상품번호 13자리로 시작합니다.
 *
 * @param html - 오특 페이지
 * @returns 예고 상품 목록. 배너가 없거나 항목 구조가 바뀌면 일부 대신 null
 */
export function parseOliveyoungUpcomingDeals(html: string): OliveyoungUpcomingDeal[] | null {
  const start = html.indexOf('<div class="comingSoonBan"');
  if (start < 0) return null;
  const banner = divElement(html.slice(start));
  if (banner === null) return null;
  const items = banner.split('<div class="slideItem" tabindex="1">').slice(1);
  if (items.length !== (banner.match(/class="slideItem\b/g) ?? []).length) return null;
  const deals: OliveyoungUpcomingDeal[] = [];
  const seen = new Set<string>();
  if (!items.length && !/<div class="sliderCenter">\s*<\/div>/.test(banner)) return null;
  for (const fragment of items) {
    const item = divElement('<div>' + fragment);
    if (item === null) return null;
    const name = text(item.match(/<span>([\s\S]*?)<\/span>/)?.[1]);
    const imageUrl = decode(item.match(/background-image:\s*url\(['"]?([^'")]+)/)?.[1] ?? '');
    if (!name || !imageUrl) return null;
    const goodsNo = imageUrl.match(/\/([A-Z]\d{12})\d*[a-z]*\.(?:jpe?g|png|gif|webp)\b/i)?.[1];
    const key = goodsNo ?? name;
    // 슬라이드 배너라 같은 상품이 반복될 수 있습니다.
    if (seen.has(key)) continue;
    seen.add(key);
    deals.push({
      goodsNo: goodsNo ?? null,
      name,
      imageUrl,
      productUrl: goodsNo
        ? `${OLIVEYOUNG_API.BASE_URL}/store/goods/getGoodsDetail.do?goodsNo=${goodsNo}`
        : null,
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
      throw new ServiceError(
        'OLIVEYOUNG_TODAY_DEALS_TIMEOUT',
        '올리브영 오특 조회 시간 초과',
        504,
        true,
      );
    }
    return requestOliveyoung(path, body, { ...options, timeout });
  };
  const page = htmlOf(await request(OLIVEYOUNG_API.TODAY_DEALS_PAGE_PATH, { date }));
  const brandDeals = parseOliveyoungTodayDeals(page, '스페셜');
  if (!brandDeals.length) invalid();
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
    // 예고는 보조 정보라 배너를 읽지 못해도 오특 조회는 실패시키지 않습니다.
    upcomingDeals: parseOliveyoungUpcomingDeals(page),
  };
}
