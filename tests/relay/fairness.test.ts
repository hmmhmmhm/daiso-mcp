import { afterEach, expect, it, vi } from 'vitest';
import { createOliveyoungRelay } from '../../scripts/relay/oliveyoung.js';
const request = (goodsNo: string, consumer = 'a'.repeat(64)) => new Request('http://localhost/v1/oliveyoung/stock-goods-info-v3', {
  method: 'POST', headers: { authorization: 'Bearer test', 'x-relay-consumer': consumer }, body: JSON.stringify({ goodsNo }),
});
afterEach(() => vi.restoreAllMocks());
it('한 소비자의 느린 요청이 공용 슬롯을 독점하지 못한다', async () => {
  let finish!: (value: { status: string }) => void;
  const run = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue({ status: 'SUCCESS' });
  const relay = createOliveyoungRelay('test', run);
  const first = relay(request('1'));
  await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
  const second = relay(request('2'));
  const denied = await relay(request('3'));
  expect(denied.status).toBe(429);
  expect(denied.headers.get('x-relay-quota-reason')).toBe('consumer');
  const other = relay(request('3', 'b'.repeat(64)));
  finish({ status: 'SUCCESS' });
  expect((await Promise.all([first, second, other])).map(r => r.status)).toEqual([200, 200, 200]);
});
it('캐시와 공유 작업은 분당 예산을 소비하지 않으며 다음 분에 복구한다', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(0);
  const run = vi.fn().mockResolvedValue({ status: 'SUCCESS' });
  const relay = createOliveyoungRelay('test', run);
  for (let i = 0; i < 12; i++) expect((await relay(request(String(i)))).status).toBe(200);
  expect((await relay(request('0'))).status).toBe(200);
  expect((await relay(request('12'))).status).toBe(429);
  expect((await relay(request('12', 'b'.repeat(64)))).status).toBe(200);
  vi.spyOn(Date, 'now').mockReturnValue(60000);
  expect((await relay(request('13'))).status).toBe(200);
});
it('실행 전에 취소된 작업은 소비자 분당 사용량에 포함하지 않는다', async () => {
  const relay = createOliveyoungRelay('test', vi.fn().mockResolvedValue({ status: 'SUCCESS' }));
  const controller = new AbortController();
  controller.abort();
  for (let i = 0; i < 12; i++) expect((await relay(new Request(request(String(i)), { signal: controller.signal }))).status).toBe(503);
  expect((await relay(request('next'))).status).toBe(200);
});
it('병합된 요청은 두 번째 소비자의 분당 예산을 차감하지 않는다', async () => {
  let finish!: (value: { status: string }) => void;
  const run = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue({ status: 'SUCCESS' });
  const relay = createOliveyoungRelay('test', run);
  const first = relay(request('shared'));
  await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
  const second = relay(request('shared', 'b'.repeat(64)));
  await new Promise(resolve => setTimeout(resolve, 0));
  finish({ status: 'SUCCESS' });
  expect((await first).status).toBe(200);
  expect((await second).headers.get('x-relay-cache')).toBe('coalesced');
  for (let i = 0; i < 12; i++) expect((await relay(request(String(i), 'b'.repeat(64)))).status).toBe(200);
  expect((await relay(request('13', 'b'.repeat(64)))).status).toBe(429);
});
it('본문 업로드부터 소비자별 두 슬롯을 적용하며 잘못된 식별자는 legacy를 공유한다', async () => {
  const run = vi.fn().mockResolvedValue({ status: 'SUCCESS' });
  const relay = createOliveyoungRelay('test', run);
  const streams: ReadableStreamDefaultController[] = [];
  const pending = ['invalid-one', 'invalid-two'].map(consumer => relay(new Request('http://localhost/v1/oliveyoung/stock-goods-info-v3', {
    method: 'POST', headers: { authorization: 'Bearer test', 'x-relay-consumer': consumer },
    body: new ReadableStream({ start(controller) { streams.push(controller); } }), duplex: 'half',
  } as RequestInit & { duplex: 'half' })));
  expect((await relay(request('third', ''))).status).toBe(429);
  expect(run).not.toHaveBeenCalled();
  for (const stream of streams) { stream.enqueue(new TextEncoder().encode('{"goodsNo":"shared"}')); stream.close(); }
  expect((await Promise.all(pending)).every(response => response.status === 200)).toBe(true);
});
it('예산이 소진된 소비자의 신규 요청에 다른 소비자가 묶이지 않는다', async () => {
  const run = vi.fn().mockResolvedValue({ status: 'SUCCESS' });
  const relay = createOliveyoungRelay('test', run);
  for (let i = 0; i < 12; i++) await relay(request(`used-${i}`));
  let finish!: (value: { status: string }) => void;
  run.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const blocker = relay(request('blocker', 'c'.repeat(64)));
  await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(13));
  const exhausted = relay(request('shared'));
  const fresh = relay(request('shared', 'b'.repeat(64)));
  await new Promise(resolve => setTimeout(resolve, 0));
  finish({ status: 'SUCCESS' });
  expect((await blocker).status).toBe(200);
  expect((await exhausted).status).toBe(429);
  expect((await fresh).status).toBe(200);
});
it('글로벌 예산 거절과 확인 오류는 소비자 사용량을 차감하지 않는다', async () => {
  const takeQuota = vi.fn().mockResolvedValue(false);
  const run = vi.fn().mockResolvedValue({ status: 'SUCCESS' });
  const relay = createOliveyoungRelay('test', run, { takeQuota });
  for (let i = 0; i < 12; i++) expect((await relay(request(`denied-${i}`))).status).toBe(429);
  takeQuota.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue(true);
  expect((await relay(request('unavailable'))).status).toBe(503);
  for (let i = 0; i < 12; i++) expect((await relay(request(`allowed-${i}`))).status).toBe(200);
  expect((await relay(request('exhausted'))).status).toBe(429);
  expect(run).toHaveBeenCalledTimes(12);
});
