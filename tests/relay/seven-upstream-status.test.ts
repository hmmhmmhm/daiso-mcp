import { expect, it, vi } from 'vitest';
import { createConvenienceRelay } from '../../scripts/relay/convenience.js';
import { RelayError } from '../../scripts/relay/http-relay.js';

const store = { collection: 'store', query: 'test', sort: 'Date/desc', listCount: 1 };
function request(operation = 'seven-store', payload: unknown = store) {
  return new Request(`http://127.0.0.1/v1/convenience/${operation}`, {
    method: 'POST', headers: { Authorization: 'Bearer test-token' }, body: JSON.stringify(payload),
  });
}
it.each([403, 429, 500])('Seven 원본 HTTP %i를 중계 502와 별도 숫자로 기록한다', async status => {
  const onEvent = vi.fn();
  const relay = createConvenienceRelay('test-token', {
    takeQuota: async () => true, onEvent,
    fetcher: async () => new Response('private-upstream-body', { status }),
  });
  const response = await relay(request());
  expect(response.status).toBe(502);
  expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ status: 502, upstreamStatus: status }));
  expect(JSON.stringify(onEvent.mock.calls)).not.toContain('private-upstream-body');
  expect(await response.text()).not.toContain('upstreamStatus');
});
it.each(['private-invalid-json', JSON.stringify({ success: false, data: {} })])('HTTP 200 본문 검증 실패도 원본 상태를 보존한다', async body => {
  const onEvent = vi.fn();
  const relay = createConvenienceRelay('test-token', {
    takeQuota: async () => true, onEvent, fetcher: async () => new Response(body),
  });
  expect((await relay(request())).status).toBe(502);
  expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ status: 502, upstreamStatus: 200 }));
  expect(JSON.stringify(onEvent.mock.calls)).not.toContain(body);
});
it('Seven stock 400의 기존 공개 오류와 원본 상태를 함께 보존한다', async () => {
  const onEvent = vi.fn();
  const relay = createConvenienceRelay('test-token', {
    takeQuota: async () => true, onEvent,
    fetcher: async () => Response.json({ success: false, code: 501, message: '정상적인 점포 조회 요청이 아닙니다.' }, { status: 400 }),
  });
  const response = await relay(request('seven-stock', { smCd: '1', stokMngCd: '1', stokMngQty: 1, stockApplicationRate: '100', storeList: ['s'] }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ upstreamError: { status: 400, code: 501 } });
  expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ status: 502, upstreamStatus: 400 }));
});
it('미분류 Seven stock 400은 본문을 공개하지 않고 상태만 기록한다', async () => {
  const onEvent = vi.fn();
  const relay = createConvenienceRelay('test-token', {
    takeQuota: async () => true, onEvent,
    fetcher: async () => Response.json({ code: 500, message: 'private-upstream-error' }, { status: 400 }),
  });
  const response = await relay(request('seven-stock', { smCd: '1', stokMngCd: '1', stokMngQty: 1, stockApplicationRate: '100', storeList: ['s'] }));
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain('private');
  expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ status: 502, upstreamStatus: 400 }));
  expect(JSON.stringify(onEvent.mock.calls)).not.toContain('private');
});
it('Seven 이외의 오류 기록은 바꾸지 않는다', async () => {
  const onEvent = vi.fn();
  const relay = createConvenienceRelay('test-token', { takeQuota: async () => true, onEvent, fetcher: async () => new Response('', { status: 500 }) });
  expect((await relay(request('cu-prime', {}))).status).toBe(502);
  expect(onEvent.mock.calls[0][0]).not.toHaveProperty('upstreamStatus');
});
it('응답 스트림의 미분류 오류에 원본 상태를 추정해서 붙이지 않는다', async () => {
  const onEvent = vi.fn();
  const relay = createConvenienceRelay('test-token', {
    takeQuota: async () => true, onEvent,
    fetcher: async () => ({ status: 200, body: { getReader() { throw new Error('private-stream-error'); } } }) as unknown as Response,
  });
  expect((await relay(request())).status).toBe(502);
  expect(onEvent.mock.calls[0][0]).not.toHaveProperty('upstreamStatus');
  expect(JSON.stringify(onEvent.mock.calls)).not.toContain('private-stream-error');
});
it.each([100, 200, 403, 599])('원본 HTTP 상태 %i만 유한한 진단으로 허용한다', status => {
  expect(new RelayError(502, undefined, undefined, status).upstreamStatus).toBe(status);
});
it.each([undefined, '403', 99, 600, 403.5, NaN, Infinity])('무효 원본 상태 %s는 기록하지 않는다', status => {
  expect(new RelayError(502, undefined, undefined, status as number).upstreamStatus).toBeUndefined();
});
