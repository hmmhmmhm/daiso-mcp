/**
 * 인터랙티브 CLI 보조 유틸
 */
import { buildDaisoStoreKeywordVariants } from './daisoKeyword.js';

interface InteractiveStore {
  name: string;
  address: string;
  phone: string;
}

interface DaisoProduct {
  id: string;
  name: string;
  price: number;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function toText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

export function parseStores(payload: unknown): InteractiveStore[] {
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.data)) {
    return [];
  }

  const stores = payload.data.stores;
  if (!Array.isArray(stores)) {
    return [];
  }

  const result: InteractiveStore[] = [];
  for (const store of stores) {
    if (!isRecord(store)) {
      continue;
    }

    const name = toText(store.name) || toText(store.storeName);
    if (!name) {
      continue;
    }

    result.push({
      name,
      address: toText(store.address),
      phone: toText(store.phone),
    });
  }

  return result;
}

export function parseDaisoProducts(payload: unknown): DaisoProduct[] {
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.data)) {
    return [];
  }

  const products = payload.data.products;
  if (!Array.isArray(products)) {
    return [];
  }

  const result: DaisoProduct[] = [];
  for (const product of products) {
    if (!isRecord(product)) {
      continue;
    }

    const id = toText(product.id);
    const name = toText(product.name);
    if (!id || !name) {
      continue;
    }

    const priceRaw = product.price;
    const price = typeof priceRaw === 'number' ? priceRaw : Number.parseInt(toText(priceRaw), 10) || 0;

    result.push({ id, name, price });
  }

  return result;
}

export { buildDaisoStoreKeywordVariants };
