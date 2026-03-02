/**
 * Cloudflare Edge Cache 유틸리티
 *
 * caches.default를 사용할 수 있는 런타임에서만 동작하며,
 * 로컬(Node) 테스트 환경에서는 자동으로 캐시를 건너뜁니다.
 */

interface EdgeCacheOptions {
  ttlSeconds: number;
  staleWhileRevalidateSeconds?: number;
  keyPrefix?: string;
}

function getCacheStorage(): CacheStorage | undefined {
  const globalObject = globalThis as { caches?: CacheStorage };
  return globalObject.caches;
}

function createCacheKey(urlString: string, keyPrefix?: string): Request {
  const url = new URL(urlString);
  const normalized = new URL(`${url.origin}${url.pathname}`);

  const sortedEntries = Array.from(url.searchParams.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  for (const [key, value] of sortedEntries) {
    normalized.searchParams.append(key, value);
  }

  if (keyPrefix) {
    normalized.searchParams.append('__cache_prefix', keyPrefix);
  }

  return new Request(normalized.toString(), { method: 'GET' });
}

function buildCacheControl(options: EdgeCacheOptions): string {
  const { ttlSeconds, staleWhileRevalidateSeconds = 30 } = options;
  return [
    `public`,
    `max-age=${ttlSeconds}`,
    `s-maxage=${ttlSeconds}`,
    `stale-while-revalidate=${staleWhileRevalidateSeconds}`,
  ].join(', ');
}

/**
 * GET 응답을 Cloudflare Edge Cache에 저장/조회합니다.
 */
export async function withEdgeCache(
  requestUrl: string,
  options: EdgeCacheOptions,
  fetcher: () => Promise<Response>
): Promise<Response> {
  const cacheStorage = getCacheStorage();
  const cache = cacheStorage?.default;

  if (!cache) {
    return fetcher();
  }

  const cacheKey = createCacheKey(requestUrl, options.keyPrefix);
  const cachedResponse = await cache.match(cacheKey);

  if (cachedResponse) {
    return cachedResponse;
  }

  const response = await fetcher();

  if (!response.ok) {
    return response;
  }

  const cacheControl = buildCacheControl(options);
  response.headers.set('Cache-Control', cacheControl);

  await cache.put(cacheKey, response.clone());
  return response;
}
