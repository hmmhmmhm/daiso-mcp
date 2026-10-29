import { expect, it, vi } from 'vitest';
import { createBrowserRunner } from '../../scripts/relay/browser.js';
it('성공 JSON만 반환하고 브라우저 fetch에 제한시간을 설정한다', async () => {
  const page = {
    evaluate: vi.fn().mockResolvedValue({ status: 200, body: { status: 'SUCCESS' } }),
  };
  const run = createBrowserRunner(page);
  expect(await run('/oystore/api/stock/stock-goods-info-v3', { goodsNo: 'A1' })).toEqual({
    status: 'SUCCESS',
  });
  expect(page.evaluate).toHaveBeenCalledWith(
    expect.any(Function),
    expect.objectContaining({ timeout: 15000 }),
  );
  for (const response of [
    { status: 403, body: {} },
    { status: 200, body: null },
    { status: 200, body: { status: 'FAIL' } },
  ]) {
    page.evaluate.mockResolvedValue(response);
    await expect(run('/path', {})).rejects.toThrow('올리브영 브라우저 응답 실패');
  }
});
it('브라우저 컨텍스트에서 JSON 요청과 응답을 처리하고 HTML은 거절한다', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ status: 'SUCCESS' }));
  vi.stubGlobal('fetch', fetch);
  const page = { evaluate: vi.fn().mockImplementation((fn, args) => fn(args)) };
  const run = createBrowserRunner(page);
  try {
    expect(await run('/oystore/api/stock/stock-goods-info-v3', { goodsNo: 'A1' })).toEqual({
      status: 'SUCCESS',
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://www.oliveyoung.co.kr/oystore/api/stock/stock-goods-info-v3',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: '{"goodsNo":"A1"}',
        signal: expect.any(AbortSignal),
      }),
    );
    fetch.mockResolvedValue(new Response('<html>challenge</html>'));
    await expect(run('/p', {})).rejects.toThrow('브라우저 응답 실패');
    fetch.mockRejectedValue(new Error('network'));
    await expect(run('/p', {})).rejects.toThrow('network');
  } finally {
    vi.unstubAllGlobals();
  }
});
it('2MiB를 넘는 원본 응답은 읽기를 취소한다', async () => {
  const cancel = vi.fn();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
    },
    cancel,
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream)));
  const page = { evaluate: vi.fn().mockImplementation((fn, args) => fn(args)) };
  try {
    await expect(createBrowserRunner(page)('/p', {})).rejects.toThrow('response size');
    expect(cancel).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
  }
});
it('본문 없는 HTTP 응답을 거절한다', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null)));
  const page = { evaluate: vi.fn().mockImplementation((fn, args) => fn(args)) };
  try {
    await expect(createBrowserRunner(page)('/p', {})).rejects.toThrow('body missing');
  } finally {
    vi.unstubAllGlobals();
  }
});
it.each([['17', 17], ['0', undefined], ['1.5', undefined], ['bad', undefined], ['999999', 86400], [null, undefined]])('원본 429의 안전한 숫자 Retry-After %s만 보존한다', async (header, retryAfter) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private challenge', { status: 429, headers: header === null ? {} : { 'retry-after': header } })));
  try {
    const page = { evaluate: vi.fn().mockImplementation((fn, args) => fn(args)) };
    await expect(createBrowserRunner(page)('/p', {})).rejects.toMatchObject({ reason: 'http-429', upstreamStatus: 429, retryAfter });
  } finally { vi.unstubAllGlobals(); }
});

it.each([[17000, 17], [17001, 18], [-1000, undefined], [0, undefined], [86401000, 86400]])('원본 Retry-After HTTP 날짜의 남은 초 %s를 안전하게 보존한다', async (remaining, retryAfter) => {
  const now = Date.UTC(2026, 9, 26, 1, 0, 0);
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now + (remaining === 17001 ? 999 : 0));
  const deadline = now + (remaining === 17001 ? 18000 : remaining);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private challenge', { status: 429, headers: { 'retry-after': new Date(deadline).toUTCString() } })));
  try {
    const page = { evaluate: vi.fn().mockImplementation((fn, args) => fn(args)) };
    await expect(createBrowserRunner(page)('/p', {})).rejects.toMatchObject({ reason: 'http-429', upstreamStatus: 429, retryAfter });
  } finally { clock.mockRestore(); vi.unstubAllGlobals(); }
});
it('오특 HTML은 고정 주소를 GET으로 읽고 검증한 HTML만 성공으로 감싼다', async () => {
  const html = '<li data-impression="A1^오특_오특상품리스트_인기순^1">';
  const fetch = vi.fn().mockResolvedValue(new Response(html));
  vi.stubGlobal('fetch', fetch);
  const page = { evaluate: vi.fn().mockImplementation((fn, args) => fn(args)) };
  const run = createBrowserRunner(page);
  const list = '/store/main/getHotdealPagingListAjax.do';
  try {
    expect(await run(list, { date: '20261026', pageIdx: 2 })).toEqual({
      status: 'SUCCESS',
      data: { html },
    });
    expect(fetch).toHaveBeenCalledWith(
      `https://www.oliveyoung.co.kr${list}?date=20261026&pageIdx=2&fltCondition=02&fltDispCatNo=&prdSort=rank`,
      expect.objectContaining({ method: 'GET', credentials: 'include', body: undefined }),
    );
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty('Content-Type');
    fetch.mockResolvedValue(new Response('<html>잠시만 기다려 주세요</html>'));
    await expect(run(list, { date: '20261026', pageIdx: 1 })).rejects.toThrow('브라우저 응답 실패');
    fetch.mockResolvedValue(new Response(html, { status: 403 }));
    await expect(run(list, { date: '20261026', pageIdx: 1 })).rejects.toThrow('브라우저 응답 실패');
    await expect(run(list, { date: 'today', pageIdx: 1 })).rejects.toThrow('날짜 형식');
    expect(fetch).toHaveBeenCalledTimes(3);
  } finally {
    vi.unstubAllGlobals();
  }
});
