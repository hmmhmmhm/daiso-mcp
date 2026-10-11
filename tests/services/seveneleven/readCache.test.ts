import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SEVENELEVEN_API } from '../../../src/services/seveneleven/api.js';
import {
  clearSevenElevenReadCache,
  withSevenElevenReadCache,
} from '../../../src/services/seveneleven/readCache.js';

beforeEach(() => {
  clearSevenElevenReadCache();
  vi.useRealTimers();
});
const path = SEVENELEVEN_API.SEARCH_GOODS_PATH;
const result = () => ({ success: true, data: { values: ['original'] } });

describe('세븐일레븐 공용 읽기 캐시', () => {
  it('같은 조회를 합치고 성공 결과를 복제해서 재사용한다', async () => {
    let finish!: (value: ReturnType<typeof result>) => void;
    const request = vi.fn(
      () =>
        new Promise<ReturnType<typeof result>>((resolve) => {
          finish = resolve;
        }),
    );
    const first = withSevenElevenReadCache(path, { query: '커피' }, 1000, request);
    const second = withSevenElevenReadCache(path, { query: '커피' }, 1000, request);
    finish(result());
    const [a, b] = await Promise.all([first, second]);
    a.data!.values.push('changed');
    expect(b.data!.values).toEqual(['original']);
    expect(await withSevenElevenReadCache(path, { query: '커피' }, 1000, request)).toEqual(
      result(),
    );
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('실패한 요청은 저장하지 않고 다음 조회를 허용한다', async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error('failed')).mockResolvedValue(result());
    await expect(withSevenElevenReadCache(path, {}, 1000, request)).rejects.toThrow('failed');
    await expect(withSevenElevenReadCache(path, {}, 1000, request)).resolves.toEqual(result());
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('서버가 반환한 실패와 데이터 없는 응답을 캐시하지 않는다', async () => {
    for (const response of [{ success: false, data: {} }, { success: true }]) {
      const request = vi.fn().mockResolvedValue(response);
      await withSevenElevenReadCache(path, response, 1000, request);
      await withSevenElevenReadCache(path, response, 1000, request);
      expect(request).toHaveBeenCalledTimes(2);
    }
  });
  it('검색어와 제한 시간이 다른 요청을 분리하고 재고는 저장하지 않는다', async () => {
    const request = vi.fn().mockResolvedValue(result());
    await withSevenElevenReadCache(path, { query: '커피' }, 1000, request);
    await withSevenElevenReadCache(path, { query: '과자' }, 1000, request);
    await withSevenElevenReadCache(path, { query: '과자' }, 2000, request);
    await withSevenElevenReadCache(SEVENELEVEN_API.REAL_STOCK_MULTI_PATH, {}, 1000, request);
    await withSevenElevenReadCache(SEVENELEVEN_API.REAL_STOCK_MULTI_PATH, {}, 1000, request);
    expect(request).toHaveBeenCalledTimes(5);
  });
  it('상품은 5분, 매장은 30분이 지나면 갱신한다', async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockResolvedValue(result());
    for (const [target, ttl] of [
      [path, 300000],
      [SEVENELEVEN_API.SEARCH_STORE_PATH, 1800000],
    ] as const) {
      await withSevenElevenReadCache(target, {}, 1000, request);
      vi.advanceTimersByTime(ttl - 1);
      await withSevenElevenReadCache(target, {}, 1000, request);
      vi.advanceTimersByTime(1);
      await withSevenElevenReadCache(target, {}, 1000, request);
    }
    expect(request).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });
  it('성공 캐시 128개 상한을 지키고 오래된 항목을 내보낸다', async () => {
    const request = vi.fn().mockResolvedValue(result());
    for (let i = 0; i < 129; i++) await withSevenElevenReadCache(path, { i }, 1000, request);
    await withSevenElevenReadCache(path, { i: 0 }, 1000, request);
    expect(request).toHaveBeenCalledTimes(130);
  });
});

it('진행 중 조회가 128개이면 추가 키는 보관하지 않는다', async () => {
  const finishes: Array<(value: ReturnType<typeof result>) => void> = [];
  const request = vi.fn(
    () => new Promise<ReturnType<typeof result>>((resolve) => finishes.push(resolve)),
  );
  const calls = Array.from({ length: 128 }, (_, i) =>
    withSevenElevenReadCache(path, { i }, 1000, request),
  );
  const extra = vi.fn().mockResolvedValue(result());
  await withSevenElevenReadCache(path, { i: 129 }, 1000, extra);
  await withSevenElevenReadCache(path, { i: 129 }, 1000, extra);
  expect(extra).toHaveBeenCalledTimes(2);
  finishes.forEach((finish) => finish(result()));
  await Promise.all(calls);
});

it('실제 서비스 계층의 연속 검색이 원본 호출을 공유한다', async () => {
  const { searchSevenElevenProducts } = await import('../../../src/services/seveneleven/client.js');
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: { content: [{ itemCd: '8801', itemOnm: '커피' }] } }),
      ),
    );
  vi.stubGlobal('fetch', fetchMock);
  try {
    const first = await searchSevenElevenProducts({ query: '공유 테스트' });
    const second = await searchSevenElevenProducts({ query: '공유 테스트' });
    expect(first).toEqual(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('인기 검색어의 label 질의 문자열도 캐시하고 label별로 분리한다', async () => {
  const { fetchSevenElevenSearchPopwords } =
    await import('../../../src/services/seveneleven/client.js');
  const fetchMock = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ success: true, data: ['커피'] }))),
    );
  vi.stubGlobal('fetch', fetchMock);
  try {
    await fetchSevenElevenSearchPopwords('goods');
    await fetchSevenElevenSearchPopwords('goods');
    await fetchSevenElevenSearchPopwords('store');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('fresh 서비스 조회는 저장된 직접 조회 캐시를 읽거나 갱신하지 않는다', async () => {
  const { searchSevenElevenProducts } = await import('../../../src/services/seveneleven/client.js');
  let name = '기존 커피';
  const fetcher = vi
    .fn()
    .mockImplementation(async () =>
      Response.json({ success: true, data: { content: [{ itemCd: '8801', itemOnm: name }] } }),
    );
  vi.stubGlobal('fetch', fetcher);
  try {
    await searchSevenElevenProducts({ query: 'fresh-test' });
    name = '새 커피';
    const fresh = await searchSevenElevenProducts({ query: 'fresh-test' }, { bypassCache: true });
    expect(fresh.products[0].itemName).toBe('새 커피');
    expect((await searchSevenElevenProducts({ query: 'fresh-test' })).products[0].itemName).toBe(
      '기존 커피',
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  } finally {
    vi.unstubAllGlobals();
  }
});
