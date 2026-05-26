/**
 * 헬스 체크 응답 shape 검사 유틸리티
 */

import type { HealthCheckDefinition } from './healthCheckTypes.js';

export function toCount(data: unknown): number | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const record = data as Record<string, unknown>;
  if (typeof record.count === 'number') {
    return record.count;
  }

  for (const key of ['products', 'stores', 'theaters', 'movies', 'showtimes']) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.length;
    }
  }

  if (record.inventory && typeof record.inventory === 'object') {
    const inventory = record.inventory as Record<string, unknown>;
    for (const key of ['products', 'items']) {
      const value = inventory[key];
      if (Array.isArray(value)) {
        return value.length;
      }
    }
  }

  return null;
}

export function toFirstName(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') {
    return undefined;
  }

  const record = data as Record<string, unknown>;
  for (const key of ['products', 'stores', 'theaters', 'movies', 'showtimes']) {
    const value = record[key];
    if (!Array.isArray(value) || !value[0] || typeof value[0] !== 'object') {
      continue;
    }
    const item = value[0] as Record<string, unknown>;
    for (const nameKey of ['productName', 'itemName', 'goodsName', 'name', 'storeName', 'theaterName', 'movieName']) {
      if (typeof item[nameKey] === 'string' && item[nameKey].trim().length > 0) {
        return item[nameKey].trim();
      }
    }
  }

  if (record.inventory && typeof record.inventory === 'object') {
    const inventory = record.inventory as Record<string, unknown>;
    for (const key of ['products', 'items']) {
      const value = inventory[key];
      if (!Array.isArray(value) || !value[0] || typeof value[0] !== 'object') {
        continue;
      }
      const item = value[0] as Record<string, unknown>;
      for (const nameKey of ['productName', 'itemName', 'goodsName', 'name']) {
        if (typeof item[nameKey] === 'string' && item[nameKey].trim().length > 0) {
          return item[nameKey].trim();
        }
      }
    }
  }

  return undefined;
}

function getCollectionItems(data: unknown, collectionKey?: HealthCheckDefinition['collectionKey']): unknown[] {
  if (!data || typeof data !== 'object') {
    return [];
  }

  const record = data as Record<string, unknown>;
  if (collectionKey === 'inventoryProducts' || collectionKey === 'inventoryItems') {
    const inventory = record.inventory;
    if (!inventory || typeof inventory !== 'object') {
      return [];
    }
    const key = collectionKey === 'inventoryProducts' ? 'products' : 'items';
    const value = (inventory as Record<string, unknown>)[key];
    return Array.isArray(value) ? value : [];
  }

  if (collectionKey && Array.isArray(record[collectionKey])) {
    return record[collectionKey];
  }

  for (const key of ['products', 'stores', 'theaters', 'movies', 'showtimes']) {
    /* c8 ignore next -- 현재 정의된 체크는 collectionKey를 명시한다. */
    if (Array.isArray(record[key])) {
      return record[key];
    }
  }

  return [];
}

export function hasRequiredRepresentativeFields(
  data: unknown,
  collectionKey: HealthCheckDefinition['collectionKey'],
  requiredFields: string[] = [],
): boolean {
  /* c8 ignore next -- 현재 정의된 API 체크는 requiredFields를 명시한다. */
  if (requiredFields.length === 0) {
    return true;
  }

  const items = getCollectionItems(data, collectionKey);
  if (items.length === 0) {
    return true;
  }

  const first = items[0];
  if (!first || typeof first !== 'object' || Array.isArray(first)) {
    return false;
  }

  const record = first as Record<string, unknown>;
  return requiredFields.some((field) => {
    const value = record[field];
    return typeof value === 'string' ? value.trim().length > 0 : value !== undefined && value !== null;
  });
}
