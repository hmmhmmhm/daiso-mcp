/**
 * Edge Cache 유틸리티 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withEdgeCache } from '../../src/utils/cache.js';

const originalCaches = (globalThis as { caches?: CacheStorage }).caches;

function createMockResponse(message: string) {
  return new Response(JSON.stringify({ message }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('withEdgeCache', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    (globalThis as { caches?: CacheStorage }).caches = originalCaches;
  });

  it('caches.default가 없으면 fetcher 결과를 반환한다', async () => {
    (globalThis as { caches?: CacheStorage }).caches = undefined;

    const fetcher = vi.fn().mockResolvedValue(createMockResponse('no-cache'));
    const res = await withEdgeCache('https://example.com/api?b=2&a=1', { ttlSeconds: 60 }, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await res.json()) as { message: string }).toEqual({ message: 'no-cache' });
  });

  it('캐시 히트 시 fetcher를 호출하지 않는다', async () => {
    const match = vi.fn().mockResolvedValue(createMockResponse('cached'));
    const put = vi.fn();

    (globalThis as { caches?: CacheStorage }).caches = {
      default: { match, put } as unknown as Cache,
    } as CacheStorage;

    const fetcher = vi.fn().mockResolvedValue(createMockResponse('origin'));
    const res = await withEdgeCache('https://example.com/api?z=9', { ttlSeconds: 60 }, fetcher);

    expect(fetcher).not.toHaveBeenCalled();
    expect((await res.json()) as { message: string }).toEqual({ message: 'cached' });
  });

  it('캐시 미스 시 fetch 후 캐시에 저장한다', async () => {
    const match = vi.fn().mockResolvedValue(undefined);
    const put = vi.fn().mockResolvedValue(undefined);

    (globalThis as { caches?: CacheStorage }).caches = {
      default: { match, put } as unknown as Cache,
    } as CacheStorage;

    const fetcher = vi.fn().mockResolvedValue(createMockResponse('origin'));
    const res = await withEdgeCache(
      'https://example.com/api?b=2&a=1',
      {
        ttlSeconds: 120,
        staleWhileRevalidateSeconds: 30,
        keyPrefix: 'test-prefix',
      },
      fetcher
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledTimes(1);

    const [cacheRequest] = put.mock.calls[0];
    expect((cacheRequest as Request).url).toContain('a=1&b=2');
    expect((cacheRequest as Request).url).toContain('__cache_prefix=test-prefix');

    expect(res.headers.get('Cache-Control')).toContain('max-age=120');
    expect(res.headers.get('Cache-Control')).toContain('stale-while-revalidate=30');
  });

  it('실패 응답은 캐시에 저장하지 않는다', async () => {
    const match = vi.fn().mockResolvedValue(undefined);
    const put = vi.fn().mockResolvedValue(undefined);

    (globalThis as { caches?: CacheStorage }).caches = {
      default: { match, put } as unknown as Cache,
    } as CacheStorage;

    const fetcher = vi.fn().mockResolvedValue(new Response('error', { status: 500 }));
    const res = await withEdgeCache('https://example.com/api', { ttlSeconds: 60 }, fetcher);

    expect(res.status).toBe(500);
    expect(put).not.toHaveBeenCalled();
  });
});
