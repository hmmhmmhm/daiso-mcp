import { describe, it, expect, vi } from 'vitest';
import { observeRelay } from '../../scripts/relay/observed.js';
describe('릴레이 요청 경계 기록', () => {
  it('ID와 상태를 연결하고 허용되지 않은 경로 및 query를 기록하지 않는다', async () => {
    const events: unknown[] = [];
    const handle = observeRelay(
      async () => new Response('private', { status: 429 }),
      (e) => events.push(e),
    );
    const r = await handle(
      new Request('http://localhost/v1/oliveyoung/product-search-v3?secret=private', {
        headers: { 'x-request-id': 'req-1' },
      }),
    );
    expect(r.headers.get('x-request-id')).toBe('req-1');
    expect(events).toMatchObject([
      { requestId: 'req-1', status: 429, operation: 'product-search-v3', outcome: 'error' },
    ]);
    expect(JSON.stringify(events)).not.toContain('private');
    await handle(new Request('http://localhost/private'));
    expect(events[1]).toMatchObject({ operation: 'other' });
  });
  it('health 성공은 제외하고 내부 예외와 기록 실패를 안전하게 처리한다', async () => {
    const emit = vi.fn();
    await observeRelay(
      async () => Response.json({ ok: true }),
      emit,
    )(new Request('http://localhost/health'));
    expect(emit).not.toHaveBeenCalled();
    const fail = observeRelay(async () => {
      throw new Error('private');
    }, emit);
    await expect(fail(new Request('http://localhost/health'))).rejects.toThrow('private');
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ status: 500, outcome: 'error' }));
    const safe = observeRelay(
      async () => new Response(),
      () => {
        throw new Error();
      },
    );
    expect((await safe(new Request('http://localhost/test'))).status).toBe(200);
  });
});
it('비동기 기록 실패도 응답을 바꾸지 않는다', async () => {
  const handler = observeRelay(
    async () => new Response(),
    async () => {
      throw Error('log');
    },
  );
  expect((await handler(new Request('http://localhost/test'))).status).toBe(200);
});
