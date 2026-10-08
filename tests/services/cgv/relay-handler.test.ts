/** CGV 중계의 고정 작업을 검증합니다. */
import { expect, it, vi } from 'vitest';
import { createCgvRelay } from '../../../scripts/relay/cgv.js';
function request(operation: string, body: unknown, token = 'test-token') {
  return new Request(`http://127.0.0.1/v1/cgv/${operation}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
it('중계는 고정 CGV API에만 서명하며 외부 URL을 받지 않는다', async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ statusCode: 0, data: [] }));
  const relay = createCgvRelay('test-token', { takeQuota: async () => true, fetcher });
  expect((await relay(request('theaters', { url: 'https://private.example' }))).status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
  expect((await relay(request('theaters', {}))).status).toBe(200);
  expect(String(fetcher.mock.calls[0][0])).toBe(
    'https://api.cgv.co.kr/cnm/atkt/searchRegnList?coCd=A420',
  );
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    redirect: 'manual',
    headers: { 'X-SIGNATURE': expect.any(String), 'X-TIMESTAMP': expect.any(String) },
  });
});
it('중계 인증 실패는 원본 호출 전에 거부한다', async () => {
  const fetcher = vi.fn();
  const relay = createCgvRelay('test-token', { takeQuota: async () => true, fetcher });
  expect((await relay(request('theaters', {}, 'wrong'))).status).toBe(401);
  expect(fetcher).not.toHaveBeenCalled();
});
it.each(['20260230', '2026108', 'https://private.example'])(
  '잘못된 날짜를 거부한다: %s',
  async (playDate) => {
    const fetcher = vi.fn();
    const relay = createCgvRelay('test-token', { takeQuota: async () => true, fetcher });
    expect((await relay(request('movies', { theaterCode: '0056', playDate }))).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  },
);
