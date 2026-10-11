import { beforeEach, expect, it, vi } from 'vitest';
import app from '../../src/index.js';
import { clearSevenElevenReadCache } from '../../src/services/seveneleven/readCache.js';
import { __testOnlyClearHealthCheckCache } from '../../src/api/healthChecks.js';

beforeEach(() => {
  clearSevenElevenReadCache();
  __testOnlyClearHealthCheckCache();
});
it('인증된 fresh 헬스 체크는 상품 캐시 이후 발생한 원본 오류를 감지한다', async () => {
  const fetcher = vi
    .fn()
    .mockImplementationOnce(async () =>
      Response.json({ success: true, data: { content: [{ itemCd: '8801', itemOnm: '커피' }] } }),
    )
    .mockImplementation(async () => new Response('blocked', { status: 403 }));
  vi.stubGlobal('fetch', fetcher);
  try {
    expect((await app.request('/api/seveneleven/products?query=커피&size=1')).status).toBe(200);
    const res = await app.request(
      '/api/health/checks?check=seveneleven.products&fresh=true',
      {
        headers: { Authorization: 'Bearer test-secret', 'x-health-check-force-fresh': 'true' },
      },
      { HEALTH_CHECK_SECRET: 'test-secret' },
    );
    expect((await res.json()).checks[0].status).not.toBe('ok');
    expect(fetcher).toHaveBeenCalledTimes(2);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('인증되지 않은 fresh 플래그로 공개 상품 캐시를 우회하지 않는다', async () => {
  const fetcher = vi
    .fn()
    .mockImplementation(async () =>
      Response.json({ success: true, data: { content: [{ itemCd: '8801', itemOnm: '커피' }] } }),
    );
  vi.stubGlobal('fetch', fetcher);
  try {
    await app.request('/api/seveneleven/products?query=커피&size=1');
    await app.request(
      '/api/seveneleven/products?query=커피&size=1',
      {
        headers: { 'x-health-check-force-fresh': 'true', 'x-health-check-key': 'wrong' },
      },
      { HEALTH_CHECK_SECRET: 'test-secret' },
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
  }
});

it.each([
  ['http://localhost', true],
  ['https://untrusted.example', false],
])('fresh 플래그를 신뢰한 대상에만 전달한다: %s', async (origin, trusted) => {
  const fetcher = vi
    .fn()
    .mockImplementation(async () =>
      Response.json({
        success: true,
        data: { products: [{ itemName: '커피' }] },
        meta: { total: 1 },
      }),
    );
  vi.stubGlobal('fetch', fetcher);
  try {
    await app.request(
      `http://localhost/api/health/checks?check=seveneleven.products&fresh=true&transport=network&baseUrl=${encodeURIComponent(origin)}`,
      {
        headers: { Authorization: 'Bearer test-secret', 'x-health-check-force-fresh': 'true' },
      },
      { HEALTH_CHECK_SECRET: 'test-secret' },
    );
    const headers = new Headers(fetcher.mock.calls[0][1].headers);
    expect(headers.get('x-health-check-force-fresh')).toBe(trusted ? 'true' : null);
    expect(headers.get('x-health-check-key')).toBe(trusted ? 'test-secret' : null);
    expect(String(fetcher.mock.calls[0][0])).toContain('_healthCheck=');
  } finally {
    vi.unstubAllGlobals();
  }
});
