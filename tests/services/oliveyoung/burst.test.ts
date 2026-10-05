import { setTimeout as realDelay } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { isValidOliveyoungRelayUrl, requestOliveyoung } from '../../../src/services/oliveyoung/transport.js';
import { withDiagnostics } from '../../../src/utils/diagnostics.js';

const busy = (retry = '1') => new Response('', { status: 429, headers: { 'x-relay-quota-reason': 'consumer-busy', 'retry-after': retry } });
const success = () => Response.json({ status: 'SUCCESS' });
const options = (name: string) => ({ relayUrl: `https://${name}.example`, relayToken: 'test', apiKey: 'unused-paid-key' });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function waitForSetup(ready: () => boolean) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (ready()) { await realDelay(0); return; }
    await realDelay(5);
  }
  throw new Error('요청 준비가 완료되지 않았습니다.');
}
function fakeTime() { vi.useFakeTimers(); vi.setSystemTime(0); vi.spyOn(Math, 'random').mockReturnValue(0); }

it('busy는 최소 1초 기다린 뒤 재시도하며 유료 경로를 사용하지 않는다', async () => {
  fakeTime();
  const fetch = vi.fn().mockResolvedValueOnce(busy()).mockResolvedValueOnce(success());
  vi.stubGlobal('fetch', fetch);
  const result = requestOliveyoung('/p', {}, options('busy-success')).catch(e => e);
  await waitForSetup(() => vi.getTimerCount() > 0);
  expect(fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(999);
  expect(fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toEqual({ status: 'SUCCESS' });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls.every(([url]) => url === 'https://busy-success.example/v1/oliveyoung/p')).toBe(true);
});

it('반복 busy도 재시도 상한에서 멈추고 같은 소비자만 휴지한다', async () => {
  fakeTime();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(busy()));
  vi.stubGlobal('fetch', fetch);
  const config = options('busy-twice');
  const first = withDiagnostics(() => requestOliveyoung('/p', {}, config), '192.0.2.1').catch(e => e);
  await waitForSetup(() => vi.getTimerCount() > 0);
  await vi.advanceTimersByTimeAsync(47000);
  expect(await first).toMatchObject({ status: 429, quotaReason: 'consumer-busy', retryAfter: 1 });
  expect(fetch).toHaveBeenCalledTimes(25);
  fetch.mockResolvedValueOnce(success());
  await expect(withDiagnostics(() => requestOliveyoung('/p', {}, config), '192.0.2.2')).resolves.toMatchObject({ status: 'SUCCESS' });
  expect(fetch).toHaveBeenCalledTimes(26);
});

it('이전 busy 휴지도 대기 예산 안에서 새 busy를 재시도한다', async () => {
  fakeTime();
  const config = { ...options('busy-cached'), timeout: 500 };
  const fetch = vi.fn().mockResolvedValueOnce(busy()).mockResolvedValueOnce(busy()).mockResolvedValueOnce(success());
  vi.stubGlobal('fetch', fetch);
  await expect(requestOliveyoung('/p', {}, config)).rejects.toMatchObject({ quotaReason: 'consumer-busy' });
  const result = requestOliveyoung('/p', {}, { ...config, timeout: 5000 }).catch(e => e);
  await waitForSetup(() => vi.getTimerCount() > 0);
  expect(fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(3000);
  expect(await result).toMatchObject({ status: 'SUCCESS' });
  expect(fetch).toHaveBeenCalledTimes(3);
});

it('첫 호출 시간과 재시도 대기 시간을 명시한 전체 deadline에 합산한다', async () => {
  fakeTime();
  const fetch = vi.fn().mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(busy()), 500)))
    .mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')))));
  vi.stubGlobal('fetch', fetch);
  const result = requestOliveyoung('/p', {}, { ...options('busy-deadline'), timeout: 2000 }).catch(e => e);
  await waitForSetup(() => vi.getTimerCount() > 0);
  await vi.advanceTimersByTimeAsync(1500);
  expect(fetch).toHaveBeenCalledTimes(2);
  const signal = fetch.mock.calls[1][1].signal;
  await vi.advanceTimersByTimeAsync(499);
  expect(signal.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(signal.aborted).toBe(true);
  expect(await result).toMatchObject({ code: 'OLIVEYOUNG_RELAY_TIMEOUT' });
});

it.each([500, 1000])('남은 deadline %ims가 대기 시간 이하이면 즉시 busy를 반환한다', async timeout => {
  fakeTime();
  const fetch = vi.fn().mockResolvedValueOnce(busy());
  vi.stubGlobal('fetch', fetch);
  await expect(requestOliveyoung('/p', {}, { ...options(`busy-short-${timeout}`), timeout })).rejects.toMatchObject({ quotaReason: 'consumer-busy' });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['0', '1evil', '2'])('busy retry-after %s는 자동 재시도하지 않는다', async retry => {
  const fetch = vi.fn().mockResolvedValueOnce(busy(retry));
  vi.stubGlobal('fetch', fetch);
  await expect(requestOliveyoung('/p', {}, options(`busy-invalid-${retry}`))).rejects.toMatchObject({ status: 429 });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each([['relay', 60000], ['direct', 15000]] as const)('%s 기본 deadline을 적용한다', async (mode, timeout) => {
  fakeTime();
  const fetch = vi.fn().mockImplementation((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')))));
  vi.stubGlobal('fetch', fetch);
  const result = requestOliveyoung('/p', {}, mode === 'relay' ? options('default-deadline') : {}).catch(e => e);
  await waitForSetup(() => vi.getTimerCount() > 0);
  const signal = fetch.mock.calls[0][1].signal;
  await vi.advanceTimersByTimeAsync(timeout - 1);
  expect(signal.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(signal.aborted).toBe(true);
  expect(await result).toBeInstanceOf(Error);
});

it('이전 busy 휴지가 풀리면 성공 응답을 받는다', async () => {
  fakeTime();
  const config = options('cached-success');
  const fetch = vi.fn().mockResolvedValueOnce(busy()).mockResolvedValueOnce(success());
  vi.stubGlobal('fetch', fetch);
  await expect(requestOliveyoung('/p', {}, { ...config, timeout: 500 })).rejects.toMatchObject({ quotaReason: 'consumer-busy' });
  const result = requestOliveyoung('/p', {}, config).catch(e => e);
  await waitForSetup(() => vi.getTimerCount() > 0);
  await vi.advanceTimersByTimeAsync(1000);
  expect(await result).toEqual({ status: 'SUCCESS' });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('재시도 대기가 지연되어 전체 deadline이 지나면 새 요청을 보내지 않는다', async () => {
  fakeTime();
  const fetch = vi.fn().mockResolvedValueOnce(busy());
  vi.stubGlobal('fetch', fetch);
  const result = requestOliveyoung('/p', {}, { ...options('delayed-wait'), timeout: 2000 }).catch(e => e);
  await waitForSetup(() => vi.getTimerCount() > 0);
  vi.setSystemTime(2000);
  await vi.advanceTimersByTimeAsync(1000);
  expect(await result).toMatchObject({ code: 'OLIVEYOUNG_RELAY_TIMEOUT' });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('빈 릴레이 주소는 유효한 설정이 아니다', () => {
  expect(isValidOliveyoungRelayUrl(undefined)).toBe(false);
  expect(isValidOliveyoungRelayUrl(' ')).toBe(false);
});

it.each(['2', '86400'])('지원하지 않는 busy 대기 %s는 시간이 지나도 휴지나 재시도로 바뀌지 않는다', async retry => {
  fakeTime();
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(busy(retry)));
  vi.stubGlobal('fetch', fetch);
  const config = options(`unsupported-busy-${retry}`);
  await expect(requestOliveyoung('/p', {}, config)).rejects.toMatchObject({ status: 429, quotaReason: undefined, retryAfter: undefined });
  vi.setSystemTime((Number(retry) - 1) * 1000);
  await expect(requestOliveyoung('/p', {}, config)).rejects.toMatchObject({ status: 429, quotaReason: undefined, retryAfter: undefined });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});


it('33초간 소비자가 사용 중이어도 원래 60초 예산에서 성공한다', async () => {
  fakeTime();
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(Date.now() < 33000 ? busy() : success()));
  vi.stubGlobal('fetch', fetch);
  const result = requestOliveyoung('/p', {}, options('long-overlap')).catch(e => e);
  await waitForSetup(() => vi.getTimerCount() > 0);
  await vi.advanceTimersByTimeAsync(33000);
  expect(await result).toEqual({ status: 'SUCCESS' });
  expect(fetch).toHaveBeenCalledTimes(18);
  expect(vi.getTimerCount()).toBe(0);
});

it('busy가 계속되면 남은 deadline보다 긴 대기를 시작하지 않는다', async () => {
  fakeTime();
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(busy()));
  vi.stubGlobal('fetch', fetch);
  const result = requestOliveyoung('/p', {}, { ...options('retry-deadline'), timeout: 4000 }).catch(e => e);
  await waitForSetup(() => vi.getTimerCount() > 0);
  await vi.advanceTimersByTimeAsync(3000);
  expect(await result).toMatchObject({ status: 429, quotaReason: 'consumer-busy', retryAfter: 1 });
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(vi.getTimerCount()).toBe(0);
});

it.each(['minute', 'daily', 'consumer'])('실제 %s 한도는 재시도하지 않고 같은 범위의 휴지를 보존한다', async reason => {
  fakeTime();
  const config = options(`quota-${reason}`);
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response('', { status: 429, headers: {
    'x-relay-quota-reason': reason, 'retry-after': '60',
  } })));
  vi.stubGlobal('fetch', fetch);
  await expect(requestOliveyoung('/p', {}, config)).rejects.toMatchObject({ quotaReason: reason, retryAfter: 60 });
  await expect(requestOliveyoung('/p', {}, config)).rejects.toMatchObject({ quotaReason: reason, retryAfter: 60 });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('busy 대기에 작은 무작위 여유를 더해 동시 재시도를 분산한다', async () => {
  fakeTime();
  vi.mocked(Math.random).mockReturnValue(0.5);
  const fetch = vi.fn().mockResolvedValueOnce(busy()).mockResolvedValueOnce(success());
  vi.stubGlobal('fetch', fetch);
  const result = requestOliveyoung('/p', {}, options('jitter')).catch(e => e);
  await waitForSetup(() => vi.getTimerCount() > 0);
  await vi.advanceTimersByTimeAsync(1124);
  expect(fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toEqual({ status: 'SUCCESS' });
});

it('취소된 busy 대기는 새 요청을 보내거나 타이머를 남기지 않는다', async () => {
  fakeTime();
  const controller = new AbortController();
  const fetch = vi.fn().mockResolvedValueOnce(busy());
  vi.stubGlobal('fetch', fetch);
  const result = requestOliveyoung('/p', {}, { ...options('cancel-wait'), signal: controller.signal }).catch(e => e);
  await waitForSetup(() => vi.getTimerCount() > 0);
  controller.abort();
  expect(await result).toMatchObject({ code: 'OLIVEYOUNG_RELAY_TIMEOUT' });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('이미 취소된 요청은 릴레이 네트워크에 보내지 않는다', async () => {
  const controller = new AbortController();
  controller.abort();
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(requestOliveyoung('/p', {}, { ...options('cancelled-before'), signal: controller.signal })).rejects.toMatchObject({ code: 'OLIVEYOUNG_RELAY_TIMEOUT' });
  expect(fetch).not.toHaveBeenCalled();
});

it('busy 뒤 응답 본문 읽기도 남은 전체 deadline에서 중단한다', async () => {
  fakeTime();
  const fetch = vi.fn().mockResolvedValueOnce(busy()).mockImplementationOnce((_url, init) => Promise.resolve({
    status: 200, ok: true,
    text: () => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')))),
  }));
  vi.stubGlobal('fetch', fetch);
  const result = requestOliveyoung('/p', {}, { ...options('busy-body-deadline'), timeout: 1500 }).catch(e => e);
  await waitForSetup(() => vi.getTimerCount() > 0);
  await vi.advanceTimersByTimeAsync(1499);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[1][1].signal.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toMatchObject({ code: 'OLIVEYOUNG_RELAY_TIMEOUT' });
  expect(vi.getTimerCount()).toBe(0);
});

it('실제 릴레이 요청 중 취소해도 busy 재시도를 시작하지 않는다', async () => {
  fakeTime();
  const controller = new AbortController();
  const fetch = vi.fn().mockImplementation((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')))));
  vi.stubGlobal('fetch', fetch);
  const result = requestOliveyoung('/p', {}, { ...options('cancel-fetch'), signal: controller.signal }).catch(e => e);
  await waitForSetup(() => vi.getTimerCount() > 0);
  controller.abort();
  expect(await result).toMatchObject({ code: 'OLIVEYOUNG_RELAY_TIMEOUT' });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('busy 응답이 도착하는 순간 취소된 요청도 즉시 대기를 정리한다', async () => {
  fakeTime();
  const controller = new AbortController();
  const fetch = vi.fn().mockImplementation(() => {
    controller.abort();
    return Promise.resolve(busy());
  });
  vi.stubGlobal('fetch', fetch);
  await expect(requestOliveyoung('/p', {}, { ...options('cancel-busy-response'), signal: controller.signal })).rejects.toMatchObject({ code: 'OLIVEYOUNG_RELAY_TIMEOUT' });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
