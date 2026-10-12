import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { createBrowserLifecycle } from '../../scripts/relay/lifecycle.js';
afterEach(() => vi.useRealTimers());
function session() {
  const page = Object.assign(new EventEmitter(), {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForURL: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue({ status: 200, body: { status: 'SUCCESS' } }),
  });
  const context = Object.assign(new EventEmitter(), {
    newPage: vi.fn().mockResolvedValue(page),
    pages: () => [page],
  });
  const owner = {
    browser: { newContext: vi.fn().mockResolvedValue(context) },
    close: vi.fn().mockResolvedValue(undefined),
    rss: vi.fn().mockResolvedValue(100),
    pid: 1,
  };
  return { page, context, owner };
}
it('교체 준비 중 정상 요청은 기존 페이지에서 즉시 처리하고 준비 완료 뒤 교환한다', async () => {
  vi.useFakeTimers();
  const a = session(),
    b = session();
  let ready!: () => void;
  b.page.waitForURL.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        ready = resolve;
      }),
  );
  const launch = vi.fn().mockResolvedValueOnce(a.owner).mockResolvedValueOnce(b.owner);
  const life = createBrowserLifecycle(launch);
  await life.start();
  await vi.advanceTimersByTimeAsync(27 * 60 * 1000);
  expect(launch).toHaveBeenCalledTimes(2);
  await life.run('/p', {});
  expect(a.page.evaluate).toHaveBeenCalledTimes(1);
  expect(a.owner.close).not.toHaveBeenCalled();
  ready();
  await vi.advanceTimersByTimeAsync(0);
  await life.run('/p', {});
  expect(b.page.evaluate).toHaveBeenCalledTimes(1);
  expect(a.owner.close).toHaveBeenCalledTimes(1);
  await life.close();
  expect(b.owner.close).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
it('후보 준비 실패는 정상 기존 세션을 보존하고 무한 재시도하지 않는다', async () => {
  vi.useFakeTimers();
  const a = session(),
    b = session();
  b.page.goto.mockRejectedValue(new Error('navigation'));
  const launch = vi.fn().mockResolvedValueOnce(a.owner).mockResolvedValueOnce(b.owner);
  const life = createBrowserLifecycle(launch);
  await life.start();
  await vi.advanceTimersByTimeAsync(27 * 60 * 1000);
  expect(b.owner.close).toHaveBeenCalledTimes(1);
  expect(a.owner.close).not.toHaveBeenCalled();
  await life.run('/p', {});
  await vi.advanceTimersByTimeAsync(60000);
  expect(launch).toHaveBeenCalledTimes(2);
  expect(life.status().state).toBe('ready');
  await life.close();
});
it('기존 RSS가 교체용 절반 예산을 넘으면 겹친 실행을 건너뛴다', async () => {
  vi.useFakeTimers();
  const a = session();
  a.owner.rss.mockResolvedValue(2 ** 29 + 1);
  const launch = vi.fn().mockResolvedValue(a.owner);
  const life = createBrowserLifecycle(launch);
  await life.start();
  await vi.advanceTimersByTimeAsync(27 * 60 * 1000);
  expect(launch).toHaveBeenCalledTimes(1);
  await life.run('/p', {});
  expect(a.page.evaluate).toHaveBeenCalledTimes(1);
  await life.close();
});
it('실행 시작 시간부터 30분 수명을 계산한다', async () => {
  vi.useFakeTimers();
  const a = session(),
    b = session();
  let finish!: (owner: typeof a.owner) => void;
  const launch = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(b.owner);
  const life = createBrowserLifecycle(launch);
  const starting = life.start();
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
  finish(a.owner);
  await starting;
  await vi.advanceTimersByTimeAsync(22 * 60 * 1000);
  expect(launch).toHaveBeenCalledTimes(2);
  await life.close();
});
it('후보가 준비되어도 실행 중 API가 끝나기 전에는 교환하지 않는다', async () => {
  vi.useFakeTimers();
  const a = session(),
    b = session();
  let ready!: () => void, done!: (value: unknown) => void;
  b.page.waitForURL.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        ready = resolve;
      }),
  );
  const life = createBrowserLifecycle(
    vi.fn().mockResolvedValueOnce(a.owner).mockResolvedValueOnce(b.owner),
  );
  await life.start();
  await vi.advanceTimersByTimeAsync(27 * 60 * 1000);
  a.page.evaluate.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        done = resolve;
      }),
  );
  const request = life.run('/p', {});
  await vi.advanceTimersByTimeAsync(0);
  ready();
  await vi.advanceTimersByTimeAsync(0);
  expect(a.owner.close).not.toHaveBeenCalled();
  expect(life.status()).toMatchObject({ active: true, owned: 2 });
  done({ status: 200, body: { status: 'SUCCESS' } });
  await request;
  expect(a.owner.close).toHaveBeenCalledTimes(1);
  await life.close();
});
it('후보 준비 중 기존 페이지 충돌은 같은 준비를 기다리고 세 번째 실행을 만들지 않는다', async () => {
  vi.useFakeTimers();
  const a = session(),
    b = session();
  let ready!: () => void;
  b.page.waitForURL.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        ready = resolve;
      }),
  );
  const launch = vi.fn().mockResolvedValueOnce(a.owner).mockResolvedValueOnce(b.owner);
  const life = createBrowserLifecycle(launch);
  await life.start();
  await vi.advanceTimersByTimeAsync(27 * 60 * 1000);
  a.page.emit('crash');
  const request = life.run('/p', {});
  await vi.advanceTimersByTimeAsync(0);
  expect(launch).toHaveBeenCalledTimes(2);
  ready();
  await request;
  expect(b.page.evaluate).toHaveBeenCalledTimes(1);
  await life.close();
});
it('후보와 기존 세션 합계 RSS가 예산을 넘으면 후보부터 회수한다', async () => {
  vi.useFakeTimers();
  const a = session(),
    b = session();
  a.owner.rss.mockResolvedValue(400 * 2 ** 20);
  b.owner.rss.mockResolvedValue(700 * 2 ** 20);
  const life = createBrowserLifecycle(
    vi.fn().mockResolvedValueOnce(a.owner).mockResolvedValueOnce(b.owner),
  );
  await life.start();
  await vi.advanceTimersByTimeAsync(27 * 60 * 1000);
  expect(b.owner.close).toHaveBeenCalledTimes(1);
  expect(a.owner.close).not.toHaveBeenCalled();
  expect(b.context.newPage).not.toHaveBeenCalled();
  await life.run('/p', {});
  await life.close();
});
it('종료는 늦게 준비되는 후보와 정상 기존 소유자를 모두 회수한다', async () => {
  vi.useFakeTimers();
  const a = session(),
    b = session();
  let finish!: (owner: typeof b.owner) => void;
  const launch = vi
    .fn()
    .mockResolvedValueOnce(a.owner)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  const life = createBrowserLifecycle(launch);
  await life.start();
  await vi.advanceTimersByTimeAsync(27 * 60 * 1000);
  const closing = life.close();
  finish(b.owner);
  await closing;
  expect(a.owner.close).toHaveBeenCalledTimes(1);
  expect(b.owner.close).toHaveBeenCalledTimes(1);
  expect(b.context.newPage).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
it('이전 회수 실패는 준비된 새 세션이 있어도 추가 요청과 실행을 차단한다', async () => {
  vi.useFakeTimers();
  const a = session(),
    b = session();
  a.owner.close.mockRejectedValue(new Error('uncertain'));
  const launch = vi.fn().mockResolvedValueOnce(a.owner).mockResolvedValueOnce(b.owner);
  const life = createBrowserLifecycle(launch);
  await life.start();
  await vi.advanceTimersByTimeAsync(27 * 60 * 1000);
  expect(life.status().state).toBe('failed');
  await expect(life.run('/p', {})).rejects.toThrow('uncertain');
  expect(launch).toHaveBeenCalledTimes(2);
  await expect(life.close()).rejects.toThrow('uncertain');
  expect(b.owner.close).toHaveBeenCalledTimes(1);
});
it('후보가 지연되어도 기존 페이지에 200회를 넘는 요청을 보내지 않는다', async () => {
  vi.useFakeTimers();
  const a = session(),
    b = session();
  let ready!: () => void;
  b.page.waitForURL.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        ready = resolve;
      }),
  );
  const launch = vi.fn().mockResolvedValueOnce(a.owner).mockResolvedValueOnce(b.owner);
  const life = createBrowserLifecycle(launch);
  await life.start();
  for (let i = 0; i < 200; i++) await life.run('/p', {});
  expect(a.page.evaluate).toHaveBeenCalledTimes(200);
  expect(a.owner.close).toHaveBeenCalledTimes(1);
  const next = life.run('/p', {});
  await vi.advanceTimersByTimeAsync(0);
  ready();
  await next;
  expect(a.page.evaluate).toHaveBeenCalledTimes(200);
  expect(b.page.evaluate).toHaveBeenCalledTimes(1);
  await life.close();
});
it('종료는 후보 탐색 완료를 기다리기 전에 알려진 두 소유자를 회수한다', async () => {
  vi.useFakeTimers();
  const a = session(),
    b = session();
  let finish!: () => void;
  b.page.goto.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const life = createBrowserLifecycle(
    vi.fn().mockResolvedValueOnce(a.owner).mockResolvedValueOnce(b.owner),
  );
  await life.start();
  await vi.advanceTimersByTimeAsync(27 * 60 * 1000);
  const closing = life.close();
  await vi.advanceTimersByTimeAsync(0);
  expect(a.owner.close).toHaveBeenCalledTimes(1);
  expect(b.owner.close).toHaveBeenCalledTimes(1);
  finish();
  await closing;
  expect(b.page.waitForURL).not.toHaveBeenCalled();
});
it('교환 후 회수 중인 이전 소유자 RSS도 종료 확인까지 합산한다', async () => {
  vi.useFakeTimers();
  const a = session(),
    b = session();
  let gone!: () => void, ready!: () => void;
  a.owner.rss.mockResolvedValue(400 * 2 ** 20);
  b.owner.rss.mockResolvedValue(400 * 2 ** 20);
  b.page.waitForURL.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        ready = resolve;
      }),
  );
  a.owner.close.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        gone = resolve;
      }),
  );
  const life = createBrowserLifecycle(
    vi.fn().mockResolvedValueOnce(a.owner).mockResolvedValueOnce(b.owner),
  );
  await life.start();
  await vi.advanceTimersByTimeAsync(27 * 60 * 1000 + 29000);
  ready();
  await vi.advanceTimersByTimeAsync(1000);
  expect(life.status().rssBytes).toBe(800 * 2 ** 20);
  gone();
  await life.close();
});
it('회수 중 슬롯이 남으면 빠른 다음 160회에도 세 번째 소유자를 실행하지 않는다', async () => {
  vi.useFakeTimers();
  const a = session(),
    b = session();
  let gone!: () => void;
  a.owner.close.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        gone = resolve;
      }),
  );
  const launch = vi.fn().mockResolvedValueOnce(a.owner).mockResolvedValueOnce(b.owner);
  const life = createBrowserLifecycle(launch);
  await life.start();
  await vi.advanceTimersByTimeAsync(27 * 60 * 1000);
  for (let i = 0; i < 160; i++) await life.run('/p', {});
  expect(launch).toHaveBeenCalledTimes(2);
  gone();
  await life.close();
});
it('준비 자체가 30분을 넘은 세션은 준비 완료라도 요청에 사용하지 않는다', async () => {
  vi.useFakeTimers();
  const a = session();
  let finish!: (owner: typeof a.owner) => void;
  const life = createBrowserLifecycle(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const starting = life.start();
  const rejected = expect(starting).rejects.toThrow('unavailable');
  await vi.advanceTimersByTimeAsync(0);
  expect(life.status().state).toBe('starting');
  vi.setSystemTime(Date.now() + 31 * 60 * 1000);
  finish(a.owner);
  await rejected;
  expect(a.page.evaluate).not.toHaveBeenCalled();
  await life.close();
});
it.each(['context', 'page'] as const)(
  '종료 중 늦게 생성된 %s 이후 탐색을 계속하지 않는다',
  async (stage) => {
    vi.useFakeTimers();
    const a = session();
    let finish!: () => void;
    if (stage === 'context')
      a.owner.browser.newContext.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = () => resolve(a.context);
          }),
      );
    else
      a.context.newPage.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = () => resolve(a.page);
          }),
      );
    const life = createBrowserLifecycle(vi.fn().mockResolvedValue(a.owner));
    const starting = life.start();
    const rejected = expect(starting).rejects.toThrow('unavailable');
    await vi.advanceTimersByTimeAsync(0);
    const closing = life.close();
    finish();
    await rejected;
    await closing;
    expect(a.page.goto).not.toHaveBeenCalled();
    expect(a.owner.close).toHaveBeenCalledTimes(1);
  },
);
it('후보 준비 완료 시 RSS가 새로 초과하면 현재를 보존하고 후보를 거절한다', async () => {
  vi.useFakeTimers();
  const a = session(),
    b = session();
  b.owner.rss.mockResolvedValueOnce(100).mockResolvedValue(2 ** 30 + 1);
  const life = createBrowserLifecycle(
    vi.fn().mockResolvedValueOnce(a.owner).mockResolvedValueOnce(b.owner),
  );
  await life.start();
  await vi.advanceTimersByTimeAsync(27 * 60 * 1000);
  expect(b.page.waitForURL).toHaveBeenCalledTimes(1);
  expect(b.owner.close).toHaveBeenCalledTimes(1);
  expect(a.owner.close).not.toHaveBeenCalled();
  await life.close();
});
it('160번째 준비 실행 실패는 배경 거절을 처리하고 추가 실행을 차단한다', async () => {
  const a = session();
  const launch = vi
    .fn()
    .mockResolvedValueOnce(a.owner)
    .mockRejectedValue(new Error('guard uncertain'));
  const life = createBrowserLifecycle(launch);
  await life.start();
  for (let i = 0; i < 160; i++) await life.run('/p', {});
  await vi.waitFor(() => expect(life.status().state).toBe('failed'));
  await expect(life.close()).rejects.toThrow('guard uncertain');
});
it('요청 실패 뒤 자동 실행 실패도 처리하며 무한 실행을 만들지 않는다', async () => {
  const a = session();
  const launch = vi
    .fn()
    .mockResolvedValueOnce(a.owner)
    .mockRejectedValue(new Error('guard uncertain'));
  const life = createBrowserLifecycle(launch);
  await life.start();
  a.page.evaluate.mockRejectedValue(new Error('upstream'));
  await expect(life.run('/p', {})).rejects.toThrow('upstream');
  await vi.waitFor(() => expect(life.status().state).toBe('failed'));
  expect(launch).toHaveBeenCalledTimes(2);
  await expect(life.close()).rejects.toThrow('guard uncertain');
});
it.each(['context', 'page', 'navigation', 'store-wait'] as const)(
  '시작 실패는 고정된 %s 단계와 오류 분류만 기록한다',
  async (phase) => {
    const a = session();
    const events: string[] = [];
    const error = new Error('sentinel-content-not-for-logs');
    error.name = 'TimeoutError';
    if (phase === 'context') a.owner.browser.newContext.mockRejectedValueOnce(error);
    if (phase === 'page') a.context.newPage.mockRejectedValueOnce(error);
    if (phase === 'navigation') a.page.goto.mockRejectedValueOnce(error);
    if (phase === 'store-wait') a.page.waitForURL.mockRejectedValueOnce(error);
    const life = createBrowserLifecycle(vi.fn().mockResolvedValue(a.owner), (e) => {
      events.push(e);
    });
    await expect(life.start()).rejects.toThrow(error);
    expect(events).toContain(`prepare-${phase}`);
    expect(events).toContain(`startup-${phase}-timeout`);
    expect(events).toContain('startup-failed');
    expect(events.join(' ')).not.toContain('sentinel-content');
    await life.close();
  },
);
it('시작 오류의 임의 문자열은 기록하지 않고 error로 분류한다', async () => {
  const a = session();
  const events: string[] = [];
  a.page.goto.mockRejectedValueOnce('arbitrary-input');
  const life = createBrowserLifecycle(vi.fn().mockResolvedValue(a.owner), (e) => {
    events.push(e);
  });
  await expect(life.start()).rejects.toBe('arbitrary-input');
  expect(events).toContain('startup-navigation-error');
  expect(events.join(' ')).not.toContain('arbitrary-input');
  await life.close();
});
it('Node 시작 watchdog은 navigation timeout으로 기록한다', async () => {
  vi.useFakeTimers();
  const a = session();
  const events: string[] = [];
  a.page.goto.mockImplementationOnce(() => new Promise(() => {}));
  const life = createBrowserLifecycle(vi.fn().mockResolvedValue(a.owner), (e) => {
    events.push(e);
  });
  const starting = life.start();
  const rejected = expect(starting).rejects.toThrow('watchdog');
  await vi.advanceTimersByTimeAsync(32000);
  await rejected;
  expect(events).toContain('startup-navigation-timeout');
  await life.close();
});
