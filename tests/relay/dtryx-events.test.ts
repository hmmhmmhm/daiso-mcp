import { describe, it, expect, vi } from 'vitest';
import { createDtryxRelay } from '../../scripts/relay/dtryx.js';
const req = () =>
  new Request('http://localhost/v1/dtryx/movies', {
    method: 'POST',
    headers: { authorization: 'Bearer test', 'x-request-id': 'req-1' },
    body: JSON.stringify({ brandCode: 'dtryx', cinemaCode: '000067' }),
  });
describe('디트릭스 실패 단계', () => {
  it('한도 실패는 upstream을 실행하지 않고 제한 단계를 기록한다', async () => {
    const events: unknown[] = [];
    const fetcher = vi.fn();
    const handler = createDtryxRelay('test', {
      takeQuota: async () => false,
      fetcher,
      onEvent: (e) => {
        events.push(e);
      },
    });
    expect((await handler(req())).status).toBe(429);
    expect(events).toMatchObject([{ stage: 'quota', status: 429, requestId: 'req-1' }]);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('원본 실패를 기록하고 기록 함수 예외가 서비스를 깨뜨리지 않는다', async () => {
    const events: unknown[] = [];
    const handler = createDtryxRelay('test', {
      takeQuota: async () => true,
      fetcher: vi.fn().mockResolvedValue(new Response('', { status: 403 })),
      onEvent: (e) => {
        events.push(e);
        throw Error('log');
      },
    });
    expect((await handler(req())).status).toBe(502);
    expect(events).toMatchObject([{ stage: 'upstream', status: 502 }]);
  });
});
it('잘못된 ID를 교체하고 비동기 관측 실패를 격리한다', async () => {
  const request = req();
  request.headers.set('x-request-id', 'invalid value');
  const handler = createDtryxRelay('test', {
    takeQuota: async () => true,
    fetcher: vi.fn().mockResolvedValue(Response.json({ RetCode: 'success', Recordset: [] })),
    onEvent: async () => {
      throw Error('log');
    },
  });
  expect((await handler(request)).status).toBe(200);
});
