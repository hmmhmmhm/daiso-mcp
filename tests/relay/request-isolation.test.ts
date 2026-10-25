import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { createBrowserLifecycle } from '../../scripts/relay/lifecycle.js';
function fixture(takeRetryQuota?: () => Promise<boolean>) {
  const page = Object.assign(new EventEmitter(), {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForURL: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockImplementation((fn, args) => fn(args)),
  });
  const context = Object.assign(new EventEmitter(), {
    newPage: vi.fn().mockResolvedValue(page),
    pages: () => [page],
  });
  const owner = {
    browser: { newContext: vi.fn().mockResolvedValue(context) },
    close: vi.fn().mockResolvedValue(undefined),
    rss: vi.fn().mockResolvedValue(100),
    pid: 123,
  };
  const launch = vi.fn().mockResolvedValue(owner);
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => Response.json({ status: 'SUCCESS' }));
  vi.stubGlobal('fetch', fetcher);
  return {
    page,
    owner,
    launch,
    fetcher,
    life: createBrowserLifecycle(launch, undefined, takeRetryQuota),
  };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('한 요청의15초 fetch timeout이 브라우저를 종료하거나 다음 정상 요청을15분 차단하지 않는다', async () => {
  const f = fixture();
  f.fetcher.mockRejectedValueOnce(new DOMException('private detail', 'TimeoutError'));
  try {
    await expect(f.life.run('/p', {})).rejects.toThrow();
    expect(f.owner.close).not.toHaveBeenCalled();
    expect(f.life.status()).toMatchObject({ state: 'ready', pages: 1, retryAt: 0 });
    await expect(f.life.run('/p', {})).resolves.toMatchObject({ status: 'SUCCESS' });
    expect(f.launch).toHaveBeenCalledTimes(1);
  } finally {
    await f.life.close();
  }
});
it.each([400, 403, 429, 500, 503])(
  '개별 HTTP%d 실패는 그대로 반환하되 사용 가능한 브라우저를 보존한다',
  async (status) => {
    const f = fixture();
    f.fetcher.mockResolvedValueOnce(new Response(null, { status }));
    try {
      await expect(f.life.run('/p', {})).rejects.toMatchObject({ upstreamStatus: status });
      expect(f.owner.close).not.toHaveBeenCalled();
      await expect(f.life.run('/p', {})).resolves.toMatchObject({ status: 'SUCCESS' });
    } finally {
      await f.life.close();
    }
  },
);
it('업무상 실패 응답도 성공이나 품절로 바꾸지 않고 다른 요청에 영향을 주지 않는다', async () => {
  const f = fixture();
  f.fetcher.mockResolvedValueOnce(Response.json({ status: 'FAIL', message: 'private' }));
  try {
    await expect(f.life.run('/p', {})).rejects.toThrow();
    expect(f.owner.close).not.toHaveBeenCalled();
    await expect(f.life.run('/p', {})).resolves.toMatchObject({ status: 'SUCCESS' });
  } finally {
    await f.life.close();
  }
});
it.each([new DOMException('private', 'AbortError'), 'private', null])(
  'fetch 실패의 비공개 원문을 외부에 노출하지 않는다',
  async (failure) => {
    const f = fixture();
    f.fetcher.mockRejectedValueOnce(failure);
    try {
      await expect(f.life.run('/p', {})).rejects.not.toThrow('private');
      expect(f.owner.close).not.toHaveBeenCalled();
    } finally {
      await f.life.close();
    }
  },
);
it('연속 실패와 성공이 섞인 200회 시도 뒤에도 정상 교체하고 다음 조회를 처리한다', async () => {
  const f = fixture();
  try {
    for (let i = 0; i < 100; i++) {
      f.fetcher.mockResolvedValueOnce(new Response(null, { status: 503 }));
      await expect(f.life.run('/p', {})).rejects.toMatchObject({ upstreamStatus: 503 });
      await expect(f.life.run('/p', {})).resolves.toMatchObject({ status: 'SUCCESS' });
    }
    await expect(f.life.run('/p', {})).resolves.toMatchObject({ status: 'SUCCESS' });
    expect(f.life.status()).toMatchObject({ state: 'ready', rotations: 1, retryAt: 0 });
    expect(f.launch).toHaveBeenCalledTimes(2);
  } finally {
    await f.life.close();
  }
});

it.each([403, 200])(
  '세션 거절 HTTP%d가 3회 연속이면 제한적으로 교체하고 복구 대기를 유지한다',
  async (status) => {
    vi.useFakeTimers();
    const f = fixture();
    try {
      for (let i = 0; i < 3; i++) {
        f.fetcher.mockResolvedValueOnce(new Response('<html>challenge</html>', { status }));
        await expect(f.life.run('/p', {})).rejects.toThrow();
      }
      expect(f.owner.close).toHaveBeenCalledTimes(1);
      expect(f.life.status()).toMatchObject({ state: 'idle', reason: 'session-rejected' });
      await expect(f.life.run('/p', {})).rejects.toThrow('backoff');
      expect(f.launch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(60001);
      await expect(f.life.run('/p', {})).resolves.toMatchObject({ status: 'SUCCESS' });
      expect(f.launch).toHaveBeenCalledTimes(2);
    } finally {
      await f.life.close();
    }
  },
);
it('HTTP 오류 본문을 즉시 취소하고 비공개 본문을 읽지 않는다', async () => {
  const f = fixture();
  const cancel = vi.fn();
  f.fetcher.mockResolvedValueOnce(new Response(new ReadableStream({ cancel }), { status: 503 }));
  try {
    await expect(f.life.run('/p', {})).rejects.toMatchObject({ upstreamStatus: 503 });
    expect(cancel).toHaveBeenCalledTimes(1);
  } finally {
    await f.life.close();
  }
});
it('HTTP 503 실패만 200회여도 세션 사용 상한에 따라 교체한다', async () => {
  const f = fixture();
  f.fetcher.mockImplementation(async () => new Response(null, { status: 503 }));
  try {
    for (let i = 0; i < 200; i++)
      await expect(f.life.run('/p', {})).rejects.toMatchObject({ upstreamStatus: 503 });
    f.fetcher.mockImplementation(async () => Response.json({ status: 'SUCCESS' }));
    await expect(f.life.run('/p', {})).resolves.toMatchObject({ status: 'SUCCESS' });
    expect(f.life.status()).toMatchObject({ state: 'ready', rotations: 1, retryAt: 0 });
    expect(f.launch).toHaveBeenCalledTimes(2);
  } finally {
    await f.life.close();
  }
});

it('첫 조회 뒤 페이지 이동으로 사라진 컨텍스트는 이동 완료 후 한 번 재시도한다', async () => {
  const f = fixture();
  f.page.evaluate.mockRejectedValueOnce(
    new Error(
      'page.evaluate: Execution context was destroyed, most likely because of a navigation',
    ),
  );
  try {
    await expect(f.life.run('/p', {})).resolves.toMatchObject({ status: 'SUCCESS' });
    expect(f.page.waitForURL).toHaveBeenLastCalledWith('https://www.oliveyoung.co.kr/store/**', {
      waitUntil: 'domcontentloaded',
      timeout: 5000,
    });
    expect(f.page.evaluate).toHaveBeenCalledTimes(2);
    expect(f.owner.close).not.toHaveBeenCalled();
  } finally {
    await f.life.close();
  }
});
it('페이지 이동 오류의 재시도도 실패하면 기존 유한 복구 절차를 따른다', async () => {
  const f = fixture();
  f.page.evaluate.mockRejectedValue(new Error('Execution context was destroyed'));
  try {
    await expect(f.life.run('/p', {})).rejects.toThrow('Execution context was destroyed');
    expect(f.page.evaluate).toHaveBeenCalledTimes(2);
    expect(f.owner.close).toHaveBeenCalledTimes(1);
  } finally {
    await f.life.close();
  }
});
it('비 Error 컨텍스트 오류는 임의로 재시도하지 않는다', async () => {
  const f = fixture();
  f.page.evaluate.mockRejectedValueOnce('unavailable');
  try {
    await expect(f.life.run('/p', {})).rejects.toBe('unavailable');
    expect(f.page.evaluate).toHaveBeenCalledTimes(1);
  } finally {
    await f.life.close();
  }
});

it.each([true, false])(
  '페이지 이동 재시도도 별도 원본 할당량 승인 %s를 따른다',
  async (allowed) => {
    const takeQuota = vi.fn().mockResolvedValue(allowed);
    const f = fixture(takeQuota);
    f.page.evaluate.mockRejectedValueOnce(new Error('Execution context was destroyed'));
    try {
      if (allowed) await expect(f.life.run('/p', {})).resolves.toMatchObject({ status: 'SUCCESS' });
      else await expect(f.life.run('/p', {})).rejects.toMatchObject({ reason: 'retry-quota' });
      expect(takeQuota).toHaveBeenCalledTimes(1);
      expect(f.page.evaluate).toHaveBeenCalledTimes(allowed ? 2 : 1);
      expect(f.owner.close).not.toHaveBeenCalled();
    } finally {
      await f.life.close();
    }
  },
);
it('세션 교체는 이전 세션의 거절 횟수를 이어받지 않는다', async () => {
  const f = fixture();
  vi.useFakeTimers();
  try {
    for (let i = 0; i < 2; i++) {
      f.fetcher.mockResolvedValueOnce(new Response(null, { status: 403 }));
      await expect(f.life.run('/p', {})).rejects.toThrow();
    }
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000 + 1);
    f.fetcher.mockResolvedValueOnce(new Response(null, { status: 403 }));
    await expect(f.life.run('/p', {})).rejects.toThrow();
    expect(f.life.status()).toMatchObject({ state: 'ready', retryAt: 0 });
  } finally {
    await f.life.close();
  }
});
