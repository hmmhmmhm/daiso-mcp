import { expect, it, vi, afterEach } from 'vitest';
import { withDiagnostics, relayConsumer } from '../../src/utils/diagnostics.js';
import { resolveRateLimitIdentity } from '../../src/middleware/dailyRateLimit.js';
afterEach(() => vi.restoreAllMocks());
it('컨텍스트가 없으면 legacy를 쓰고 신뢰하는 요청 identity만 일별 HMAC으로 보낸다', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(0);
  expect(await relayConsumer('token')).toBeUndefined();
  const first = await withDiagnostics(() => relayConsumer('token'), '192.0.2.1');
  expect(first).toMatch(/^[a-f0-9]{64}$/);
  expect(await withDiagnostics(() => relayConsumer('token'), '192.0.2.1')).toBe(first);
  expect(await withDiagnostics(() => relayConsumer('other'), '192.0.2.1')).not.toBe(first);
  expect(await withDiagnostics(() => relayConsumer('token'), '192.0.2.2')).not.toBe(first);
  vi.spyOn(Date, 'now').mockReturnValue(86400000);
  expect(await withDiagnostics(() => relayConsumer('token'), '192.0.2.1')).not.toBe(first);
});
it('교차 존 Worker identity 정규화를 재사용한다', () => {
  expect(resolveRateLimitIdentity(new Request('https://example.com', { headers: {
    'CF-Connecting-IP': '2a06:98c0:3600::103', 'CF-Worker': ' EXAMPLE.COM ', 'x-relay-consumer': 'spoof',
  } }))).toBe('worker-zone:example.com');
});
it('비동기 요청이 겹쳐도 identity를 섞지 않는다', async () => {
  const expected = await withDiagnostics(() => relayConsumer('token'), '192.0.2.1');
  const results = await Promise.all([
    withDiagnostics(async () => { await new Promise(resolve => setTimeout(resolve, 10)); return relayConsumer('token'); }, '192.0.2.1'),
    withDiagnostics(() => relayConsumer('token'), '192.0.2.2'),
  ]);
  expect(results[0]).toBe(expected);
  expect(results[1]).not.toBe(expected);
});
