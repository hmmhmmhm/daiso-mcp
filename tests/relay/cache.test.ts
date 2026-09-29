import { expect, it } from 'vitest';
import { createResponseCache, canonicalKey } from '../../scripts/relay/cache.js';
it('키 순서를 정규화하고 TTL, LRU, 바이트 및 항목 상한을 유지한다', () => {
  let now = 0;
  const cache = createResponseCache(2, 12, () => now);
  expect(canonicalKey('op', { b: 2, a: 1 })).toBe(canonicalKey('op', { a: 1, b: 2 }));
  expect(cache.get('a')).toBeUndefined();
  cache.set('a', '123', 10);
  cache.set('b', '123', 20);
  expect(cache.get('a')).toBe('123');
  cache.set('c', '123', 20);
  expect(cache.get('b')).toBeUndefined();
  cache.set('a', '1', 10);
  cache.set('oversized', '123456789', 10);
  expect(cache.stats()).toMatchObject({ entries: 2, bytes: 6 });
  now = 10;
  expect(cache.get('a')).toBeUndefined();
  now = 20;
  expect(cache.stats()).toMatchObject({ entries: 0, bytes: 0 });
  cache.set('a', '12345678', 10);
  cache.set('b', '1234', 10);
  expect(cache.get('a')).toBeUndefined();
});
it('기본 캐시도 성공 문자열을 보관한다', () => {
  const cache = createResponseCache();
  cache.set('key', '{}', 1000);
  expect(cache.get('key')).toBe('{}');
});
