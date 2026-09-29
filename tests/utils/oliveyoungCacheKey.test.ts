import { describe, it, expect } from 'vitest';
import { oliveyoungCacheKey } from '../../src/utils/oliveyoungCacheKey.js';
describe('올리브영 캐시 키', () => {
  it('무관 query를 제거하고 명시 기본값을 합친다', () => {
    const base = 'https://x/api/oliveyoung/products?keyword=lip';
    expect(oliveyoungCacheKey(base)).toBe(
      oliveyoungCacheKey(base + '&page=1&size=20&includeSoldOut=false&unused=nonce'),
    );
  });
  it('실제 검색조건과 강제 점검은 분리한다', () => {
    const base = 'https://x/api/oliveyoung/products?keyword=lip';
    expect(oliveyoungCacheKey(base)).not.toBe(oliveyoungCacheKey(base + '&_healthCheck=123'));
    expect(oliveyoungCacheKey(base)).not.toBe(oliveyoungCacheKey(base + '&size=1'));
  });
  it('매장과 재고 기본값, 첫 query값 및 알 수 없는 경로를 보존한다', () => {
    for (const route of ['stores', 'inventory']) {
      const base = `https://x/api/oliveyoung/${route}?keyword=lip`;
      expect(oliveyoungCacheKey(base)).toBe(
        oliveyoungCacheKey(base + '&lat=37.5665&lng=126.978&keyword=ignored'),
      );
    }
    expect(oliveyoungCacheKey('https://x/other?a=1')).toBe('https://x/other?a=1');
  });
});
