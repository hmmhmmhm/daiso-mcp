/**
 * 롯데마트 HTML 파싱 유틸리티
 */

import type { LotteMartMarketOption, LotteMartProduct, LotteMartStore } from './types.js';
import { buildLotteMartKeywordVariants } from './keyword.js';

export function detectBrandVariant(storeName: string) {
  if (storeName.startsWith('토이저러스')) {
    return 'toysrus' as const;
  }
  if (storeName.startsWith('맥스')) {
    return 'max' as const;
  }
  if (storeName.startsWith('보틀벙커')) {
    return 'bottlebunker' as const;
  }
  if (storeName.startsWith('Mealguru')) {
    return 'mealguru' as const;
  }
  if (storeName.startsWith('그랑그로서리')) {
    return 'grandgrocery' as const;
  }

  return 'lottemart' as const;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x2F;/gi, '/');
}

function stripTags(value: string): string {
  return value.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ');
}

function normalizeWhitespace(value: string): string {
  return decodeHtmlEntities(stripTags(value)).replace(/\s+/g, ' ').trim();
}

export function normalizeHtml(html: string): string {
  const trimmed = html.trim();
  const htmlStart = trimmed.search(/<(?:!doctype|html|option|li|ul|section)\b/i);
  return htmlStart >= 0 ? trimmed.slice(htmlStart) : trimmed;
}

function toNumber(value: string): number {
  const parsed = Number.parseFloat(value.replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function calculateDistanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(6371000 * c);
}

function splitTopLevelBlocks(html: string, markerClass: string): string[] {
  const pattern = new RegExp(`<li>\\s*<div class="${markerClass}">`, 'g');
  const normalized = html.replace(/\r/g, '');
  const indexes = Array.from(normalized.matchAll(pattern)).map((match) => match.index || 0);
  return indexes.map((start, index) => normalized.slice(start, indexes[index + 1] || normalized.length));
}

function extractFirstMatch(pattern: RegExp, value: string): string {
  return value.match(pattern)?.[1]?.trim() || '';
}

export function parseMarketOptions(area: string, html: string): LotteMartMarketOption[] {
  return Array.from(normalizeHtml(html).matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g))
    .map((match) => ({
      area,
      storeCode: (match[1] || '').trim(),
      storeName: normalizeWhitespace(match[2] || ''),
    }))
    .filter((item) => item.storeCode.length > 0 && item.storeName.length > 0)
    .map((item) => ({
      ...item,
      brandVariant: detectBrandVariant(item.storeName),
    }));
}

export function parseStores(area: string, html: string): LotteMartStore[] {
  return splitTopLevelBlocks(normalizeHtml(html), 'shop-tit')
    .map((block) => {
      const storeName = normalizeWhitespace(extractFirstMatch(/<div class="shop-tit">([\s\S]*?)<\/div>/, block));
      const detailUrl = extractFirstMatch(/<a class="link" href="([^"]+)"/, block);
      const storeCode = extractFirstMatch(/werks=([^'"]+)/, block) || extractFirstMatch(/goClick\('([^']+)'\)/, block);

      return {
        area,
        storeCode,
        storeName,
        brandVariant: detectBrandVariant(storeName),
        address: normalizeWhitespace(extractFirstMatch(/주소\s*:\s*<\/span>([\s\S]*?)<\/li>/, block)),
        phone: normalizeWhitespace(extractFirstMatch(/상담전화\s*:\s*<\/span>([\s\S]*?)<\/li>/, block)),
        openTime: normalizeWhitespace(extractFirstMatch(/영업시간\s*:\s*<\/span>([\s\S]*?)<\/li>/, block)),
        closedDays: normalizeWhitespace(extractFirstMatch(/휴점일\s*:\s*<\/span>([\s\S]*?)<\/li>/, block)),
        parkingType: normalizeWhitespace(extractFirstMatch(/주차정보\s*:\s*([^<]*)<\/span>/, block)),
        parkingDetails: normalizeWhitespace(extractFirstMatch(/<div class="park-info">([\s\S]*?)<\/div>/, block)),
        detailUrl: detailUrl.startsWith('.') ? `/mobiledowa/market/${detailUrl.replace(/^\.\//, '')}` : detailUrl,
        latitude: 0,
        longitude: 0,
        distanceM: null,
      };
    })
    .filter((store) => store.storeCode.length > 0 && store.storeName.length > 0);
}

export function parseProducts(
  area: string,
  storeCode: string,
  storeName: string,
  keyword: string,
  html: string,
): LotteMartProduct[] {
  return splitTopLevelBlocks(normalizeHtml(html), 'prod-box')
    .map((block) => {
      const rawSpec = extractFirstMatch(/<div class="prod-count">([\s\S]*?)<\/div>/, block);

      return {
        area,
        storeCode,
        storeName,
        keyword,
        productName:
          normalizeWhitespace(extractFirstMatch(/<div class="prod-name">([\s\S]*?)<\/div>/, block)) ||
          normalizeWhitespace(extractFirstMatch(/<div class="layer-head">([\s\S]*?)<\/div>/, block)),
        barcode: normalizeWhitespace(extractFirstMatch(/<!--\s*([^>]+?)\s*-->/, rawSpec)),
        spec: normalizeWhitespace(rawSpec.replace(/<!--[\s\S]*?-->/g, '')),
        manufacturer: normalizeWhitespace(extractFirstMatch(/제조사\s*:\s*<\/th>\s*<td>([\s\S]*?)<\/td>/, block)),
        price: toNumber(extractFirstMatch(/가격\s*:\s*<\/th>\s*<td>([\s\S]*?)<\/td>/, block)),
        stockQuantity: toNumber(extractFirstMatch(/재고\s*:\s*<\/th>\s*<td>([\s\S]*?)<\/td>/, block)),
      };
    })
    .filter((product) => product.productName.length > 0);
}

export function parseProductSummary(html: string): { totalCount: number; totalPages: number } {
  const normalized = normalizeHtml(html);
  const totalCount = toNumber(extractFirstMatch(/검색결과\s*:\s*<span>([\d,]+)<\/span>건/, normalized));
  const totalPages = toNumber(extractFirstMatch(/var\s+totalPage\s*=\s*"(\d+)"/, normalized));
  return {
    totalCount,
    totalPages: totalPages > 0 ? totalPages : 1,
  };
}

export function dedupeProducts(products: LotteMartProduct[]): LotteMartProduct[] {
  return Array.from(
    new Map(
      products.map((product) => [
        [product.productName, product.spec, product.manufacturer, product.price, product.stockQuantity].join('|'),
        product,
      ]),
    ).values(),
  );
}

export function matchesKeyword(store: LotteMartStore, keyword: string): boolean {
  const variants = buildLotteMartKeywordVariants(keyword).map((value) => value.toLowerCase());
  if (variants.length === 0) {
    return true;
  }

  const haystacks = [store.storeName, store.address, store.phone]
    .map((value) => value.toLowerCase().replace(/\s+/g, ''))
    .filter((value) => value.length > 0);

  return variants.some((variant) => {
    const normalizedVariant = variant.replace(/\s+/g, '');
    return haystacks.some((value) => value.includes(normalizedVariant));
  });
}

export function matchesBrandVariant(store: LotteMartStore, brandVariant?: string): boolean {
  const normalized = (brandVariant || '').trim().toLowerCase();
  return normalized.length === 0 ? true : store.brandVariant === normalized;
}

export function sortStores(stores: LotteMartStore[]): LotteMartStore[] {
  return [...stores].sort((a, b) => {
    const distanceDelta = (a.distanceM ?? Number.MAX_SAFE_INTEGER) - (b.distanceM ?? Number.MAX_SAFE_INTEGER);
    if (distanceDelta !== 0) {
      return distanceDelta;
    }

    const areaDelta = a.area.localeCompare(b.area, 'ko');
    if (areaDelta !== 0) {
      return areaDelta;
    }

    return a.storeName.localeCompare(b.storeName, 'ko');
  });
}
