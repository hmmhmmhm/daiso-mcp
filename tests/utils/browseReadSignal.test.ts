import { describe, expect, it } from 'vitest';
import { browseReadSignal, withBrowseReadSignal } from '../../src/utils/browseReadSignal.js';
import { fetchJson } from '../../src/utils/http.js';

describe('접수 작업 취소 범위', () => {
  it('범위 밖 요청은 바꾸지 않고 범위 안의 호출자 신호와 함께 취소한다', async () => {
    const caller = new AbortController();
    expect(browseReadSignal()).toBeUndefined();
    expect(browseReadSignal(caller.signal)).toBe(caller.signal);
    const scoped = new AbortController();
    await withBrowseReadSignal(scoped.signal, async () => {
      expect(browseReadSignal()).toBe(scoped.signal);
      const both = browseReadSignal(caller.signal)!;
      caller.abort();
      expect(both.aborted).toBe(true);
    });
    expect(browseReadSignal()).toBeUndefined();
  });
  it('실제 공용 HTTP 요청의 fetch 신호까지 작업 취소를 전달한다', async () => {
    const scoped = new AbortController();
    let signal: AbortSignal | undefined;
    const work = withBrowseReadSignal(scoped.signal, () =>
      fetchJson('https://example.test', {
        fetchImpl: async (_url, init) => {
          signal = init?.signal as AbortSignal;
          return new Promise<Response>((_resolve, reject) =>
            signal!.addEventListener('abort', () => reject(signal!.reason), { once: true }),
          );
        },
      }),
    );
    await Promise.resolve();
    scoped.abort(new Error('read job deadline'));
    await expect(work).rejects.toThrow('read job deadline');
    expect(signal?.aborted).toBe(true);
  });
});
