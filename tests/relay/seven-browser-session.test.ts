import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ launch: vi.fn() }));
vi.mock('../../scripts/relay/supervisor.js', () => ({ launchGuardedBrowser: mocks.launch }));
import { prepareSevenBrowserSession } from '../../scripts/relay/seven-browser-session.js';
const page = { goto: vi.fn(), evaluate: vi.fn() };
const context = { newPage: vi.fn(), cookies: vi.fn() };
const owner = { browser: { newContext: vi.fn() }, close: vi.fn() };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.launch.mockResolvedValue(owner);
  owner.browser.newContext.mockResolvedValue(context);
  context.newPage.mockResolvedValue(page);
  page.goto.mockResolvedValue({ status: () => 200 });
  vi.stubGlobal('navigator', { userAgent: 'Browser' });
  page.evaluate.mockImplementation((fn) => fn());
  context.cookies.mockResolvedValue([{ name: 'public', value: 'session' }]);
  owner.close.mockResolvedValue(undefined);
});
it('비개인 일반 브라우저에서 고정 원점의 쿠키만 준비하고 API 재고는 호출하지 않는다', async () => {
  const result = await prepareSevenBrowserSession('/state/seven-marker', '/browser/chrome');
  expect(mocks.launch).toHaveBeenCalledWith(
    '/state/seven-marker',
    undefined,
    '/browser/chrome',
    'headed',
  );
  expect(result).toMatchObject({ cookie: 'public=session', userAgent: 'Browser' });
  expect(page.goto).toHaveBeenCalledWith(
    'https://new.7-elevenapp.co.kr/',
    expect.objectContaining({ timeout: 10000 }),
  );
  expect(context.cookies).toHaveBeenCalledWith('https://new.7-elevenapp.co.kr/');
  expect(owner.close).toHaveBeenCalledTimes(1);
});
it.each([undefined, { status: () => 403 }])(
  '준비 페이지가 정상200이 아니면 원문 없이 실패하고 회수한다',
  async (response) => {
    page.goto.mockResolvedValue(response);
    await expect(prepareSevenBrowserSession('/state/marker', '/chrome')).rejects.toThrow(
      'unavailable',
    );
    expect(owner.close).toHaveBeenCalledTimes(1);
  },
);
it('세션 조회가 실패해도 소유 브라우저 종료를 기다린다', async () => {
  context.cookies.mockRejectedValue(new Error('unavailable'));
  await expect(prepareSevenBrowserSession('/state/marker', '/chrome')).rejects.toThrow(
    'unavailable',
  );
  expect(owner.close).toHaveBeenCalledTimes(1);
});

afterEach(() => vi.unstubAllGlobals());
