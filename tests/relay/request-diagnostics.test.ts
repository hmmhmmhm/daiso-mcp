import { expect, it, vi } from 'vitest';
import { BrowserRequestError } from '../../scripts/relay/browser.js';
import { createOliveyoungRelay } from '../../scripts/relay/oliveyoung.js';
it.each([
  ['http-403', 403],
  ['timeout', undefined],
] as const)(
  '원본 실패 %s를 안전한 코드로 기록하고 다음 요청은 정상 처리한다',
  async (reason, status) => {
    const onEvent = vi.fn();
    const run = vi
      .fn()
      .mockRejectedValueOnce(new BrowserRequestError(reason, status))
      .mockResolvedValue({ status: 'SUCCESS' });
    const relay = createOliveyoungRelay('test', run, { onEvent });
    const request = () =>
      new Request('http://localhost/v1/oliveyoung/stock-goods-info-v3', {
        method: 'POST',
        headers: { authorization: 'Bearer test', 'x-relay-consumer': 'a'.repeat(64) },
        body: JSON.stringify({ goodsNo: 'A1' }),
      });
    const response = await relay(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: 'Upstream unavailable',
      reason,
      ...(status ? { upstreamStatus: status } : {}),
    });
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'upstream', outcome: reason }),
    );
    expect((await relay(request())).status).toBe(200);
  },
);

it.each([undefined, { blockedBy: 'minute', retryAfter: 12 }])(
  '재시도 할당량 실패는 외부 원본 차단과 구분한다',
  async (status) => {
    const takeQuota = Object.assign(vi.fn().mockResolvedValue(true), { status: () => status });
    const relay = createOliveyoungRelay(
      'test',
      vi.fn().mockRejectedValue(new BrowserRequestError('retry-quota')),
      { takeQuota } as never,
    );
    const response = await relay(
      new Request('http://localhost/v1/oliveyoung/stock-goods-info-v3', {
        method: 'POST',
        headers: { authorization: 'Bearer test', 'x-relay-consumer': 'b'.repeat(64) },
        body: JSON.stringify({ goodsNo: 'A1' }),
      }),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get('x-relay-quota-reason')).toBe(status?.blockedBy || 'unknown');
    expect(response.headers.get('retry-after')).toBe(String(status?.retryAfter || 60));
  },
);
