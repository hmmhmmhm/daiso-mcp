import { ServiceError } from '../../core/errors.js';
import type { JapanProduct, JapanStore } from './types.js';

function invalid(): never {
  throw new ServiceError(
    'DAISO_JP_PARSE_FAILED',
    '일본 다이소 원본 응답 형식이 변경되었습니다.',
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

function text(value: string): string {
  return decode(value.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function attribute(tag: string, name: string): string {
  const match = tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'));
  return match ? decode(match[1]) : '';
}

function element(html: string, className: string): string {
  const match = html.match(
    new RegExp(
      `<([\\w]+)\\b[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
      'i',
    ),
  );
  return match ? match[2] : '';
}

function image(value: unknown): { imageUrl?: string } {
  if (typeof value !== 'string' || !value) return {};
  const normalized = decode(value).replace('{width}', '600');
  if (normalized.startsWith('//')) return { imageUrl: `https:${normalized}` };
  return /^https:\/\//.test(normalized) ? { imageUrl: normalized } : {};
}

function product(
  id: string,
  name: string,
  price: number | null,
  available: boolean | null,
): JapanProduct {
  return {
    country: 'JP',
    id,
    name,
    price,
    currency: 'JPY',
    url: `https://jp.daisonet.com/products/${id}`,
    onlineAvailable: available,
    storeInventorySupported: false,
  };
}

export function parseProductSearch(html: string): { products: JapanProduct[]; hasNext: boolean } {
  const blocks = html.split(/<div\b[^>]*class=["']product-item\s[^"']*["'][^>]*>/i).slice(1);
  if (blocks.length === 0) {
    if (/empty-state__description/.test(html) && /検索が見つかりませんでした/.test(html)) {
      return { products: [], hasNext: false };
    }
    return invalid();
  }
  const products = blocks.map((block) => {
    const title = block.match(
      /<a\b[^>]*class=["'][^"']*\bproduct-item__title\b[^"']*["'][^>]*>[\s\S]*?<\/a>/i,
    );
    if (!title) return invalid();
    const id = attribute(title[0], 'href').match(/^\/products\/(\d{13})(?:[?#]|$)/)?.[1];
    const name = text(title[0]);
    if (!id || !name) return invalid();
    // 검색 HTML은 세전 금액을 먼저 표시하므로 명시된 세금 포함 금액만 사용합니다.
    const priceMatch = text(element(block, 'product-item__price-list')).match(
      /税込\s*([\d,]+)\s*円/,
    );
    const price = priceMatch ? Number(priceMatch[1].replace(/,/g, '')) : null;
    const imgTag = block.match(/<img\b[^>]*>/i);
    const imageUrl = imgTag ? attribute(imgTag[0], 'data-src') || attribute(imgTag[0], 'src') : '';
    return { ...product(id, name, price, null), ...image(imageUrl) };
  });
  return { products, hasNext: /<a\b[^>]*class=["'][^"']*\bpagination__next\b/.test(html) };
}

export function parseProductDetail(data: unknown, id: string): JapanProduct {
  if (!data || typeof data !== 'object') return invalid();
  const record = data as Record<string, unknown>;
  if (record.handle !== id || typeof record.title !== 'string' || !record.title.trim())
    return invalid();
  const price =
    typeof record.price === 'number' && Number.isFinite(record.price) && record.price >= 0
      ? record.price / 100
      : null;
  return {
    ...product(
      id,
      record.title.trim(),
      price,
      typeof record.available === 'boolean' ? record.available : null,
    ),
    ...image(record.featured_image),
  };
}

export function parseProductPage(html: string, id: string): JapanProduct {
  const script = html.match(
    /<script\b(?=[^>]*\stype\s*=\s*["']application\/json["'])(?=[^>]*\sdata-product-json(?=[\s=>]))[^>]*>([\s\S]*?)<\/script\s*>/i,
  );
  if (!script) return invalid();
  let data: { product?: unknown } | null;
  try {
    data = JSON.parse(script[1]) as { product?: unknown } | null;
  } catch {
    return invalid();
  }
  return parseProductDetail(data?.product, id);
}

function coordinate(value: string | null, limit: number): number | null {
  if (value === null || !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
}

export function parseStoreSearch(html: string): { stores: JapanStore[]; hasNext: boolean } {
  const blocks = html.split(/<li\b[^>]*class=["']resultList-item["'][^>]*>/i).slice(1);
  if (blocks.length === 0) {
    if (/class=["']resultList["']/.test(html) && /該当する店舗がありません/.test(html)) {
      return { stores: [], hasNext: false };
    }
    return invalid();
  }
  const stores = blocks.map((block) => {
    const id = block.match(
      /href=["']https:\/\/www\.daiso-sangyo\.co\.jp\/shop\/detail\/(\d+)["']/,
    )?.[1];
    const name = text(element(block, 'resultList-item-name'));
    const address = block.match(/<dt>\s*住所\s*<\/dt>\s*<dd>([\s\S]*?)<\/dd>/)?.[1];
    if (!id || !name || !address || !text(address)) return invalid();
    const hours = block.match(/<dt>\s*営業時間\s*<\/dt>\s*<dd>([\s\S]*?)<\/dd>/)?.[1];
    const mapHref = attribute(address, 'href');
    const mapQuery = /^https:\/\/www\.daiso-sangyo\.co\.jp\/shop\/map\?/.test(mapHref)
      ? mapHref.split('?')[1]
      : '';
    const params = new URLSearchParams(mapQuery);
    const brand = block.match(
      /<span\b[^>]*class=["']resultList-item-category(?:\s+(?!-small)[^"']*)?["'][^>]*>([\s\S]*?)<\/span>/,
    );
    return {
      id,
      name,
      address: text(address),
      hours: hours ? text(hours) : '',
      url: `https://www.daiso-sangyo.co.jp/shop/detail/${id}`,
      latitude: coordinate(params.get('lat'), 90),
      longitude: coordinate(params.get('lon'), 180),
      brand: brand ? text(brand[1]) : '',
    };
  });
  return { stores, hasNext: /<a\b[^>]*class=["'][^"']*\bnextpostslink\b/.test(html) };
}
