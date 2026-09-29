import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { createBrowserLifecycle } from '../../scripts/relay/lifecycle.js';
afterEach(() => vi.useRealTimers());
function fixture() {
  const page = Object.assign(new EventEmitter(), {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForURL: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue({ status: 200, body: { status: 'SUCCESS' } }),
    close: vi.fn().mockResolvedValue(undefined),
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
  return { page, context, owner, launch };
}
it('반복 요청은 한 페이지를 재사용하고200회 뒤 이전 세션 종료를 확인한 후 교체한다', async () => {
  const f = fixture();
  const life = createBrowserLifecycle(f.launch);
  for (let i = 0; i < 201; i++) await life.run('/p', {});
  expect(f.context.newPage).toHaveBeenCalledTimes(2);
  expect(f.owner.close).toHaveBeenCalledTimes(1);
  expect(f.owner.close.mock.invocationCallOrder[0]).toBeLessThan(
    f.launch.mock.invocationCallOrder[1],
  );
  await life.close();
  expect(life.status().state).toBe('closed');
});
it('종료 확인 실패 후 대체 브라우저를 실행하지 않는다', async () => {
  const f = fixture();
  const life = createBrowserLifecycle(f.launch);
  await life.run('/p', {});
  f.owner.close.mockRejectedValue(new Error('not gone'));
  f.page.emit('crash');
  await expect(life.run('/p', {})).rejects.toThrow();
  expect(f.launch).toHaveBeenCalledTimes(1);
  await expect(life.close()).rejects.toThrow();
});
it('팝업을 닫고 닫기 실패는 세션을 회수한다', async () => {
  const f = fixture();
  const life = createBrowserLifecycle(f.launch);
  await life.run('/p', {});
  const popup = { close: vi.fn().mockRejectedValue(new Error('hang')) };
  f.context.emit('page', popup);
  await vi.waitFor(() => expect(f.owner.close).toHaveBeenCalledTimes(1));
  await life.close();
  expect(popup.close).toHaveBeenCalledTimes(1);
});
it('Node watchdog이 멈춘 evaluate를 회수하고 종료 시 타이머를 제거한다', async () => {
  vi.useFakeTimers();
  const f = fixture();
  const life = createBrowserLifecycle(f.launch);
  await life.run('/p', {});
  f.page.evaluate.mockImplementation(() => new Promise(() => {}));
  const pending = life.run('/p', {});
  const rejected = expect(pending).rejects.toThrow('watchdog');
  await vi.advanceTimersByTimeAsync(18000);
  await rejected;
  expect(f.owner.close).toHaveBeenCalledTimes(1);
  await life.close();
  expect(vi.getTimerCount()).toBe(0);
});
it('메모리 한도와30분 유휴 수명을 점검한다', async () => {
  vi.useFakeTimers();
  const f = fixture();
  const life = createBrowserLifecycle(f.launch);
  await life.run('/p', {});
  f.owner.rss.mockResolvedValue(2 ** 30 + 1);
  await vi.advanceTimersByTimeAsync(30000);
  expect(f.owner.close).toHaveBeenCalledTimes(1);
  f.owner.rss.mockResolvedValue(1);
  await life.run('/p', {});
  await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
  await life.run('/p', {});
  expect(f.launch).toHaveBeenCalledTimes(3);
  await life.close();
});
it('200번째 조회 후 다음 요청 없이 세션을 교체하고 다음 조회는 준비된 페이지를 쓴다', async () => {
  const f = fixture();
  const life = createBrowserLifecycle(f.launch);
  for (let i = 0; i < 200; i++) await life.run('/p', {});
  expect(f.owner.close).toHaveBeenCalledTimes(1);
  await vi.waitFor(() => expect(f.page.waitForURL).toHaveBeenCalledTimes(2));
  await life.run('/p', {});
  expect(f.launch).toHaveBeenCalledTimes(2);
  await life.close();
});
it('유휴30분 만료는 다음 요청 없이 회수한다', async () => {
  vi.useFakeTimers();
  const f = fixture();
  const life = createBrowserLifecycle(f.launch);
  await life.start();
  await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
  expect(f.owner.close).toHaveBeenCalledTimes(1);
  expect(f.launch).toHaveBeenCalledTimes(2);
  await life.close();
});
it('종료된 수명은 재실행하지 않고 상태를 보고한다', async () => {
  const f = fixture();
  const life = createBrowserLifecycle(f.launch);
  expect(life.status().state).toBe('idle');
  await life.start();
  expect(life.status()).toMatchObject({ state: 'ready', pages: 1 });
  await life.close();
  await expect(life.run('/p', {})).rejects.toThrow('unavailable');
  expect(f.launch).toHaveBeenCalledTimes(1);
});
it('시작 중 종료는 늦게 도착한 소유 브라우저도 회수한다', async () => {
  const f = fixture();
  let finish!: (v: typeof f.owner) => void;
  f.launch.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const life = createBrowserLifecycle(f.launch);
  const pending = life.start();
  const rejected = expect(pending).rejects.toThrow('unavailable');
  await Promise.resolve();
  const closing = life.close();
  finish(f.owner);
  await rejected;
  await closing;
  expect(f.context.newPage).not.toHaveBeenCalled();
  expect(f.owner.close).toHaveBeenCalledTimes(1);
});
it('초기 페이지 접속 실패와 페이지 닫힘을 회수한다', async () => {
  const f = fixture();
  f.page.goto.mockRejectedValueOnce(new Error('navigation'));
  const life = createBrowserLifecycle(f.launch);
  await expect(life.start()).rejects.toThrow('navigation');
  expect(f.owner.close).toHaveBeenCalledTimes(1);
  await life.start();
  f.page.emit('close');
  await life.close();
  expect(f.owner.close).toHaveBeenCalledTimes(2);
});
it('동시 실행을 거절하고 다음 요청에서 만료된 세션을 교체한다', async () => {
  vi.useFakeTimers();
  const f = fixture();
  const life = createBrowserLifecycle(f.launch);
  await life.start();
  vi.setSystemTime(Date.now() + 30 * 60 * 1000);
  await life.run('/p', {});
  expect(f.launch).toHaveBeenCalledTimes(2);
  let finish!: (v: unknown) => void;
  f.page.evaluate.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = life.run('/p', {});
  await vi.advanceTimersByTimeAsync(0);
  await expect(life.run('/p', {})).rejects.toThrow('already active');
  finish({ status: 200, body: { status: 'SUCCESS' } });
  await pending;
  await life.close();
});
it('RSS 점검 실패는 세션 회수와 실패 상태로 이어진다', async () => {
  vi.useFakeTimers();
  const f = fixture();
  const life = createBrowserLifecycle(f.launch);
  await life.start();
  f.owner.rss.mockRejectedValue(new Error('ps'));
  f.owner.close.mockRejectedValue(new Error('uncertain'));
  await vi.advanceTimersByTimeAsync(30000);
  expect(life.status().state).toBe('failed');
  await expect(life.close()).rejects.toThrow('uncertain');
  expect(vi.getTimerCount()).toBe(0);
});
it('이전 세션 팝업 및 RSS 작업은 새 세션을 회수하지 않는다', async () => {
  vi.useFakeTimers();
  const f = fixture();
  const life = createBrowserLifecycle(f.launch);
  await life.start();
  let rss!: (v: number) => void;
  f.owner.rss.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        rss = resolve;
      }),
  );
  await vi.advanceTimersByTimeAsync(30000);
  let fail!: (v: Error) => void;
  f.context.emit('page', {
    close: () =>
      new Promise((_, reject) => {
        fail = reject;
      }),
  });
  await life.close();
  rss(2 ** 30 + 1);
  fail(new Error('old popup'));
  await vi.advanceTimersByTimeAsync(0);
  expect(f.owner.close).toHaveBeenCalledTimes(1);
});
it('이전 세션 RSS 실패는 종료 후 추가 작업을 만들지 않는다', async () => {
  vi.useFakeTimers();
  const f = fixture();
  const life = createBrowserLifecycle(f.launch);
  await life.start();
  let fail!: (v: Error) => void;
  f.owner.rss.mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        fail = reject;
      }),
  );
  await vi.advanceTimersByTimeAsync(30000);
  await life.close();
  fail(new Error('old'));
  await vi.advanceTimersByTimeAsync(0);
  expect(vi.getTimerCount()).toBe(0);
});

it('자동 교체 중 종료는 준비 중인 브라우저를 회수하고 타이머를 남기지 않는다', async () => {
  vi.useFakeTimers();
  const f = fixture();
  const life = createBrowserLifecycle(f.launch);
  await life.start();
  let finish!: () => void;
  f.page.goto.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
  expect(f.launch).toHaveBeenCalledTimes(2);
  expect(life.status().state).toBe('starting');
  const closing = life.close();
  finish();
  await closing;
  expect(f.owner.close).toHaveBeenCalledTimes(2);
  expect(life.status().state).toBe('closed');
  expect(vi.getTimerCount()).toBe(0);
});
it('자동 교체 준비 실패는 무한 재시작 없이 유휴 상태에서 멈춘다', async () => {
  vi.useFakeTimers();
  const f = fixture();
  const life = createBrowserLifecycle(f.launch);
  await life.start();
  f.page.goto.mockRejectedValueOnce(new Error('navigation'));
  await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
  expect(f.launch).toHaveBeenCalledTimes(2);
  expect(life.status()).toMatchObject({ state: 'idle', reason: 'startup-failed' });
  await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
  expect(f.launch).toHaveBeenCalledTimes(2);
  await life.close();
});
it('조회 중 RSS 초과는 조회 종료 후 한 번만 새 세션을 준비한다', async () => {
  vi.useFakeTimers();
  const f = fixture();
  const life = createBrowserLifecycle(f.launch);
  await life.start();
  let finish!: (v: unknown) => void;
  f.page.evaluate.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await vi.advanceTimersByTimeAsync(29000);
  const pending = life.run('/p', {});
  f.owner.rss.mockResolvedValue(2 ** 30 + 1);
  await vi.advanceTimersByTimeAsync(1000);
  expect(f.owner.close).toHaveBeenCalledTimes(1);
  expect(f.launch).toHaveBeenCalledTimes(1);
  f.owner.rss.mockResolvedValue(1);
  finish({ status: 200, body: { status: 'SUCCESS' } });
  await pending;
  await vi.advanceTimersByTimeAsync(0);
  expect(f.launch).toHaveBeenCalledTimes(2);
  await life.close();
});
it('자동 교체의 종료 확인 실패는 새 브라우저 실행을 차단한다', async () => {
  vi.useFakeTimers();
  const f = fixture();
  const life = createBrowserLifecycle(f.launch);
  await life.start();
  f.owner.close.mockRejectedValue(new Error('uncertain'));
  await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
  expect(f.launch).toHaveBeenCalledTimes(1);
  expect(life.status().state).toBe('failed');
  await expect(life.close()).rejects.toThrow('uncertain');
});
it('자동 준비의 페이지가 멈추면 제한 시간 후 회수하고 재시도하지 않는다', async () => {
  vi.useFakeTimers();
  const f = fixture();
  const life = createBrowserLifecycle(f.launch);
  await life.start();
  f.page.goto.mockImplementationOnce(() => new Promise(() => {}));
  await vi.advanceTimersByTimeAsync(30 * 60 * 1000 + 32000);
  expect(f.owner.close).toHaveBeenCalledTimes(2);
  expect(life.status().state).toBe('idle');
  await vi.advanceTimersByTimeAsync(60000);
  expect(f.launch).toHaveBeenCalledTimes(2);
  await life.close();
});
it('자동 준비 중 팝업 회수 실패는 준비 완료로 보고하지 않는다', async () => {
  vi.useFakeTimers();
  const f = fixture();
  const life = createBrowserLifecycle(f.launch);
  await life.start();
  let finish!: () => void;
  f.page.waitForURL.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
  await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
  f.context.emit('page', { close: vi.fn().mockRejectedValue(new Error('popup')) });
  await vi.advanceTimersByTimeAsync(0);
  finish();
  await vi.advanceTimersByTimeAsync(0);
  expect(life.status().state).toBe('idle');
  expect(vi.getTimerCount()).toBe(0);
  expect(f.launch).toHaveBeenCalledTimes(2);
  await life.close();
});
it('브라우저 시작/회수 사유를 기록하고 관측기 실패를 격리한다', async () => {
  const f = fixture(); const events: string[] = [];
  const life = createBrowserLifecycle(f.launch, event => { events.push(event); if(event==='shutdown') throw Error('log'); });
  await life.start(); await life.close(); expect(events).toEqual(['ready','shutdown']);
  const second = createBrowserLifecycle(f.launch, async()=>{throw Error('async log')});
  await second.start(); await second.close();
});
it('브라우저 프로세스 실행 실패도 별도 사건으로 기록한다',async()=>{
 const events:string[]=[];const life=createBrowserLifecycle(async()=>{throw Error('launch')},e=>{events.push(e)});
 await expect(life.start()).rejects.toThrow('launch');expect(events).toContain('launch-failed');await life.close();
});
