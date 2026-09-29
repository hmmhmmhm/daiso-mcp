import { afterEach, expect, it, vi } from 'vitest';
import { fetchOliveyoungProducts, __testOnlyClearOliveyoungCaches } from '../../../src/services/oliveyoung/client.js';
import { requestOliveyoung } from '../../../src/services/oliveyoung/transport.js';
import { withDiagnostics } from '../../../src/utils/diagnostics.js';
import { toServiceErrorDiagnostics, ServiceError } from '../../../src/core/errors.js';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it.each(['minute', 'daily', 'consumer'])('검증된 %s 429만 범위에 맞게 휴지하고 진단을 보존한다', async reason => {
  vi.spyOn(Date, 'now').mockReturnValue(0);
  const options = { relayUrl: `https://${reason}.example`, relayToken: 'test' };
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response('', { status: 429, headers: { 'retry-after': '10', 'x-relay-quota-reason': reason } })));
  vi.stubGlobal('fetch', fetch);
  const call = (identity: string) => withDiagnostics(() => requestOliveyoung('/p', {}, options), identity).catch(e => e);
  const error = await call('192.0.2.1');
  expect(error).toMatchObject({ status: 429, retryAfter: 10, quotaReason: reason });
  expect(toServiceErrorDiagnostics(error as ServiceError, 'test')).toMatchObject({ retryAfter: 10, quotaReason: reason });
  await call('192.0.2.1');
  expect(fetch).toHaveBeenCalledTimes(1);
  await call('192.0.2.2');
  expect(fetch).toHaveBeenCalledTimes(reason === 'consumer' ? 2 : 1);
  vi.spyOn(Date, 'now').mockReturnValue(10000);
  await call('192.0.2.1');
  expect(fetch).toHaveBeenCalledTimes(reason === 'consumer' ? 3 : 2);
});
it.each([[403, '10', 'minute'], [503, '10', 'daily'], [429, '0', 'minute'], [429, '86401', 'minute'], [429, '1evil', 'minute'], [429, '10', 'unknown']])('잘못된 헤더나 상태는 휴지하지 않는다 %s/%s/%s', async (status, retry, reason) => {
  const options = { relayUrl: `https://invalid-${status}-${retry}-${reason}.example`, relayToken: 'test' };
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response('', { status: Number(status), headers: { 'retry-after': String(retry), 'x-relay-quota-reason': String(reason) } })));
  vi.stubGlobal('fetch', fetch);
  for (let i = 0; i < 2; i++) await expect(requestOliveyoung('/p', {}, options)).rejects.toMatchObject({ retryAfter: undefined });
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('서로 다른 릴레이 자격증명은 글로벌 휴지를 공유하지 않는다', async () => {
  const options = { relayUrl: 'https://credentials.example', relayToken: 'first' };
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response('', { status: 429, headers: { 'retry-after': '10', 'x-relay-quota-reason': 'daily' } })));
  vi.stubGlobal('fetch', fetch);
  for (const relayToken of ['first', 'second', 'first']) await requestOliveyoung('/p', {}, { ...options, relayToken }).catch(() => undefined);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('성공 캐시는 휴지 중에도 반환하고 새 요청을 릴레이로 보내지 않는다', async () => {
  __testOnlyClearOliveyoungCaches();
  const options = { relayUrl: 'https://cached-cooldown.example', relayToken: 'test' };
  const params = { keyword: 'cached', page: 1, size: 10, sort: '', includeSoldOut: false };
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ status: 'SUCCESS', data: { searchList: [], totalCount: 7 } }))
    .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '10', 'x-relay-quota-reason': 'minute' } }));
  vi.stubGlobal('fetch', fetch);
  const success = await fetchOliveyoungProducts(params, options);
  await expect(requestOliveyoung('/different', {}, options)).rejects.toMatchObject({ status: 429 });
  expect(await fetchOliveyoungProducts(params, options)).toEqual(success);
  expect(fetch).toHaveBeenCalledTimes(2);
  __testOnlyClearOliveyoungCaches();
});
