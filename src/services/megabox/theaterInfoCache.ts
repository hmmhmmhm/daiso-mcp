/** 지점 주소·좌표만 한 시간 재사용하며 상영 회차와 좌석은 보관하지 않습니다. */
import type { MegaboxTheaterInfo } from './types.js';

const MAX_ENTRIES = 256;
const TTL_MS = 60 * 60_000;
const values = new Map<string, { expiresAt: number; value: MegaboxTheaterInfo }>();
const pending = new Map<string, Promise<MegaboxTheaterInfo>>();

export function clearMegaboxTheaterInfoCache(): void {
  values.clear();
  pending.clear();
}

export async function withMegaboxTheaterInfoCache(
  theaterId: string,
  request: () => Promise<MegaboxTheaterInfo>,
  bypassCache = false,
  timeout?: number,
): Promise<MegaboxTheaterInfo> {
  if (bypassCache) return request();
  const cached = values.get(theaterId);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.value };
  values.delete(theaterId);
  const pendingKey = JSON.stringify([theaterId, timeout]);
  const existing = pending.get(pendingKey);
  if (existing) return { ...(await existing) };
  if (pending.size >= MAX_ENTRIES) return request();
  const promise = request().then((value) => {
    if (
      value.latitude !== null &&
      value.longitude !== null &&
      pending.get(pendingKey) === promise
    ) {
      if (values.size >= MAX_ENTRIES) values.delete(values.keys().next().value!);
      values.set(theaterId, { expiresAt: Date.now() + TTL_MS, value: { ...value } });
    }
    return value;
  });
  pending.set(pendingKey, promise);
  try {
    return { ...(await promise) };
  } finally {
    if (pending.get(pendingKey) === promise) pending.delete(pendingKey);
  }
}
