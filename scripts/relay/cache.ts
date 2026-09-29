/** 검증된 평면 입력용 키와 바이트·항목 상한을 가진 TTL LRU 캐시. */
export function canonicalKey(operation: string, body: Record<string, unknown>): string {
  return JSON.stringify([
    operation,
    Object.keys(body)
      .sort()
      .map((key) => [key, body[key]]),
  ]);
}
export function createResponseCache(maxEntries = 256, maxBytes = 16 * 1024 * 1024, now = Date.now) {
  const entries = new Map<string, { value: string; bytes: number; expires: number }>();
  let bytes = 0;
  const counters = { hits: 0, misses: 0, expired: 0, evicted: 0 };
  const remove = (key: string) => {
    bytes -= entries.get(key)!.bytes;
    entries.delete(key);
  };
  const prune = () => {
    const time = now();
    for (const [key, entry] of entries) if (entry.expires <= time) { remove(key); counters.expired++; }
  };
  return {
    get(key: string): string | undefined {
      prune();
      const entry = entries.get(key);
      if (!entry) { counters.misses++; return undefined; }
      counters.hits++;
      entries.delete(key);
      entries.set(key, entry);
      return entry.value;
    },
    set(key: string, value: string, ttl: number) {
      prune();
      if (entries.has(key)) remove(key);
      const size = Buffer.byteLength(key) + Buffer.byteLength(value);
      if (size > maxBytes) return;
      while (entries.size >= maxEntries || bytes + size > maxBytes) {
        remove(entries.keys().next().value!);
        counters.evicted++;
      }
      entries.set(key, { value, bytes: size, expires: now() + ttl });
      bytes += size;
    },
    stats() {
      prune();
      return { entries: entries.size, bytes, maxEntries, maxBytes, ...counters };
    },
  };
}
