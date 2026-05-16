/**
 * CLI 응답 렌더러
 */

interface ApiEnvelope {
  success?: boolean;
  data?: unknown;
  meta?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toText(value: unknown): string {
  if (value === null || value === undefined) {
    return '-';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

function formatMeta(meta: unknown): string[] {
  if (!isRecord(meta)) {
    return [];
  }

  const pairs = Object.entries(meta)
    .filter(([, value]) => typeof value === 'string' || typeof value === 'number')
    .map(([key, value]) => `${key}=${value}`);

  if (pairs.length === 0) {
    return [];
  }

  return [`메타: ${pairs.join(', ')}`];
}

function detectName(item: Record<string, unknown>): string {
  const keys = ['name', 'productName', 'storeName', 'theaterName', 'movieName'];
  for (const key of keys) {
    if (typeof item[key] === 'string' && item[key].trim().length > 0) {
      return item[key] as string;
    }
  }

  return '이름 없음';
}

function formatCollection(title: string, items: unknown): string[] {
  if (!Array.isArray(items)) {
    return [];
  }

  const lines = [`${title}: ${items.length}건`];

  const preview = items.slice(0, 5);
  for (const entry of preview) {
    if (!isRecord(entry)) {
      lines.push(`- ${toText(entry)}`);
      continue;
    }

    const name = detectName(entry);
    const id =
      entry.id ?? entry.productId ?? entry.PD_NO ?? entry.storeCode ?? entry.theaterId ?? entry.movieId;
    const price = entry.price ?? entry.prc ?? entry.PD_PRC;

    let detail = `- ${name}`;
    if (id !== undefined) {
      detail += ` [${toText(id)}]`;
    }
    if (price !== undefined) {
      detail += ` / ${toText(price)}원`;
    }

    const detailParts = [
      entry.address,
      entry.distance !== undefined ? `${toText(entry.distance)}km` : undefined,
      entry.quantity !== undefined ? `수량 ${toText(entry.quantity)}` : undefined,
    ].filter((value): value is string | number | boolean => value !== undefined);
    if (detailParts.length > 0) {
      detail += ` / ${detailParts.map(toText).join(' / ')}`;
    }

    lines.push(detail);
  }

  if (items.length > preview.length) {
    lines.push(`...외 ${items.length - preview.length}건`);
  }

  return lines;
}

function formatDisplayLocation(data: Record<string, unknown>): string[] {
  const lines = [`진열 위치: ${data.hasLocation === true ? '있음' : '없음'}`];
  if (!Array.isArray(data.locations) || data.locations.length === 0) {
    return lines;
  }

  lines.push(`위치 목록: ${data.locations.length}건`);
  for (const location of data.locations.slice(0, 5)) {
    if (!isRecord(location)) {
      lines.push(`- ${toText(location)}`);
      continue;
    }

    const zoneNo = toText(location.zoneNo);
    const stairNo = toText(location.stairNo);
    const storeErp = location.storeErp !== undefined ? ` / storeErp ${toText(location.storeErp)}` : '';
    lines.push(`- 구역 ${zoneNo} / 층 ${stairNo}${storeErp}`);
  }

  if (data.locations.length > 5) {
    lines.push(`...외 ${data.locations.length - 5}건`);
  }

  return lines;
}

function formatProductDetail(data: Record<string, unknown>): string[] {
  const id = data.id ?? data.productId ?? '-';
  const name = data.name ?? data.productName ?? '-';
  const price = data.price ?? '-';
  const soldOut = data.soldOut;

  const lines = [`제품 상세: ${toText(name)} (${toText(id)})`, `가격: ${toText(price)}원`];
  if (typeof soldOut === 'boolean') {
    lines.push(`품절 여부: ${soldOut ? '품절' : '재고 있음'}`);
  }
  return lines;
}

function formatInventory(data: Record<string, unknown>): string[] {
  const lines: string[] = [];

  const onlineStock = data.onlineStock;
  if (onlineStock !== undefined) {
    lines.push(`온라인 재고: ${toText(onlineStock)}`);
  }

  const storeInventory = data.storeInventory;
  if (isRecord(storeInventory)) {
    const total = storeInventory.totalStores;
    const inStock = storeInventory.inStockCount;
    lines.push(`매장 재고: 재고보유 ${toText(inStock)} / 전체 ${toText(total)}`);
    lines.push(...formatCollection('매장 목록', storeInventory.stores));
  }

  return lines;
}

export function renderApiEnvelope(command: string, url: URL, payload: unknown): string {
  if (!isRecord(payload)) {
    return `요청 성공: ${url.pathname}\n${toText(payload)}\n\n원본 JSON은 --json 옵션으로 확인하세요.`;
  }

  const envelope = payload as ApiEnvelope;
  if (envelope.success !== true) {
    return JSON.stringify(payload, null, 2);
  }

  const lines: string[] = [`요청 성공: ${url.pathname}`];
  lines.push(...formatMeta(envelope.meta));

  if (!isRecord(envelope.data)) {
    lines.push(`응답 데이터: ${toText(envelope.data)}`);
    lines.push('', '원본 JSON은 --json 옵션으로 확인하세요.');
    return lines.join('\n');
  }

  const data = envelope.data;

  if (command === 'product') {
    lines.push(...formatProductDetail(data));
  } else if (command === 'inventory') {
    lines.push(...formatInventory(data));
  } else if (command === 'display-location') {
    lines.push(...formatDisplayLocation(data));
  } else if (command === 'cu-inventory') {
    lines.push(...formatCollection('매장 목록', isRecord(data.nearbyStores) ? data.nearbyStores.stores : undefined));
    lines.push(...formatCollection('재고 항목', isRecord(data.inventory) ? data.inventory.items : undefined));
  } else {
    lines.push(...formatCollection('제품 목록', data.products));
    lines.push(...formatCollection('매장 목록', data.stores));
    lines.push(...formatCollection('극장 목록', data.theaters));
    lines.push(...formatCollection('영화 목록', data.movies));
    lines.push(...formatCollection('시간표', data.timetable));
    lines.push(...formatCollection('좌석 목록', data.seats));
    lines.push(...formatCollection('상영 목록', data.showtimes));

    if (lines.length <= 2) {
      const summaryEntries = Object.entries(data)
        .filter(([, value]) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
        .slice(0, 8);

      for (const [key, value] of summaryEntries) {
        lines.push(`${key}: ${toText(value)}`);
      }
    }
  }

  lines.push('', '원본 JSON은 --json 옵션으로 확인하세요.');
  return lines.join('\n');
}
