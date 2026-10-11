import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  clearMegaboxTheaterInfoCache,
  withMegaboxTheaterInfoCache,
} from '../../../src/services/megabox/theaterInfoCache.js';
const value = { theaterId: 'one', address: '서울', latitude: 37.5, longitude: 127 };
beforeEach(clearMegaboxTheaterInfoCache);
afterEach(() => vi.useRealTimers());

it('동일 지점의 진행 중 조회를 공유하고 반환 객체를 분리한다', async () => {
  let finish!: (result: typeof value) => void;
  const request = vi.fn(
    () =>
      new Promise<typeof value>((resolve) => {
        finish = resolve;
      }),
  );
  const a = withMegaboxTheaterInfoCache('one', request);
  const b = withMegaboxTheaterInfoCache('one', request);
  finish(value);
  const [first, second] = await Promise.all([a, b]);
  first.address = '수정';
  expect(second.address).toBe('서울');
  expect((await withMegaboxTheaterInfoCache('one', request)).address).toBe('서울');
  expect(request).toHaveBeenCalledTimes(1);
});

it('한 시간이 지나면 다시 조회한다', async () => {
  vi.useFakeTimers();
  const request = vi.fn().mockResolvedValue(value);
  await withMegaboxTheaterInfoCache('one', request);
  vi.advanceTimersByTime(3_600_000 - 1);
  await withMegaboxTheaterInfoCache('one', request);
  vi.advanceTimersByTime(1);
  await withMegaboxTheaterInfoCache('one', request);
  expect(request).toHaveBeenCalledTimes(2);
});

it('오류와 좌표 미확인 응답은 저장하지 않는다', async () => {
  const request = vi
    .fn()
    .mockRejectedValueOnce(new Error('failed'))
    .mockResolvedValueOnce({ ...value, latitude: null })
    .mockResolvedValueOnce({ ...value, longitude: null })
    .mockResolvedValue(value);
  await expect(withMegaboxTheaterInfoCache('one', request)).rejects.toThrow('failed');
  await withMegaboxTheaterInfoCache('one', request);
  await withMegaboxTheaterInfoCache('one', request);
  await withMegaboxTheaterInfoCache('one', request);
  expect(request).toHaveBeenCalledTimes(4);
});

it('성공 결과 256개 상한과 초기화를 적용한다', async () => {
  const request = vi.fn().mockResolvedValue(value);
  for (let i = 0; i < 257; i++) await withMegaboxTheaterInfoCache(String(i), request);
  await withMegaboxTheaterInfoCache('0', request);
  expect(request).toHaveBeenCalledTimes(258);
  clearMegaboxTheaterInfoCache();
  await withMegaboxTheaterInfoCache('0', request);
  expect(request).toHaveBeenCalledTimes(259);
});

it('진행 중 작업 256개를 넘는 새 키는 보관하지 않는다', async () => {
  const finishes: Array<(result: typeof value) => void> = [];
  const request = vi.fn(() => new Promise<typeof value>((resolve) => finishes.push(resolve)));
  const calls = Array.from({ length: 256 }, (_, i) =>
    withMegaboxTheaterInfoCache(String(i), request),
  );
  const extra = vi.fn().mockResolvedValue(value);
  await withMegaboxTheaterInfoCache('extra', extra);
  await withMegaboxTheaterInfoCache('extra', extra);
  expect(extra).toHaveBeenCalledTimes(2);
  finishes.forEach((finish) => finish(value));
  await Promise.all(calls);
});

it('fresh 조회는 기존 진행 작업을 공유하거나 캐시를 갱신하지 않는다', async () => {
  let finish!: (result: typeof value) => void;
  const request = vi.fn(
    () =>
      new Promise<typeof value>((resolve) => {
        finish = resolve;
      }),
  );
  const old = withMegaboxTheaterInfoCache('one', request);
  const fresh = vi.fn().mockResolvedValue({ ...value, address: '새 주소' });
  expect((await withMegaboxTheaterInfoCache('one', fresh, true)).address).toBe('새 주소');
  finish(value);
  await old;
  expect((await withMegaboxTheaterInfoCache('one', fresh)).address).toBe('서울');
});

it('초기화 전에 시작한 조회가 늦게 끝나도 새 조회 결과를 대체하지 않는다', async () => {
  let finishOld!: (result: typeof value) => void;
  let finishNew!: (result: typeof value) => void;
  const oldRequest = vi.fn(
    () =>
      new Promise<typeof value>((resolve) => {
        finishOld = resolve;
      }),
  );
  const newRequest = vi.fn(
    () =>
      new Promise<typeof value>((resolve) => {
        finishNew = resolve;
      }),
  );
  const old = withMegaboxTheaterInfoCache('one', oldRequest);
  clearMegaboxTheaterInfoCache();
  const current = withMegaboxTheaterInfoCache('one', newRequest);
  finishOld({ ...value, address: '초기화 이전 주소' });
  expect((await old).address).toBe('초기화 이전 주소');
  const follower = withMegaboxTheaterInfoCache('one', newRequest);
  finishNew({ ...value, address: '현재 주소' });
  expect((await current).address).toBe('현재 주소');
  expect((await follower).address).toBe('현재 주소');
  expect(newRequest).toHaveBeenCalledTimes(1);
  expect((await withMegaboxTheaterInfoCache('one', newRequest)).address).toBe('현재 주소');
});

it('서로 다른 제한 시간의 진행 요청은 공유하지 않고 짧은 요청의 실패를 격리한다', async () => {
  vi.useFakeTimers();
  const longRequest = vi.fn(
    () => new Promise<typeof value>((resolve) => setTimeout(() => resolve(value), 1000)),
  );
  const shortRequest = vi.fn(
    () =>
      new Promise<typeof value>((_resolve, reject) =>
        setTimeout(() => reject(new Error('지점 조회 시간 초과')), 10),
      ),
  );
  let longFinished = false;
  let shortError: string | undefined;
  const long = withMegaboxTheaterInfoCache('one', longRequest, false, 1000).then((result) => {
    longFinished = true;
    return result;
  });
  const short = withMegaboxTheaterInfoCache('one', shortRequest, false, 10).catch(
    (error: Error) => {
      shortError = error.message;
    },
  );
  await vi.advanceTimersByTimeAsync(10);
  expect(shortError).toBe('지점 조회 시간 초과');
  expect(longFinished).toBe(false);
  expect(shortRequest).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(990);
  expect(await long).toEqual(value);
  await short;
  expect(await withMegaboxTheaterInfoCache('one', shortRequest, false, 10)).toEqual(value);
  expect(shortRequest).toHaveBeenCalledTimes(1);
});
