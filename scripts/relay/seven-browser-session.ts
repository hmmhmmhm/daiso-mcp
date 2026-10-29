/** 개인 프로필을 사용하지 않고 공개 웹 세션만 준비한 뒤 소유 브라우저를 종료합니다. */
import { bounded } from './lifecycle.js';
import { launchGuardedBrowser } from './supervisor.js';
import type { SevenPublicSession } from './seven-session.js';
export async function prepareSevenBrowserSession(
  marker: string,
  executable: string,
): Promise<SevenPublicSession> {
  const owner = await launchGuardedBrowser(marker, undefined, executable, 'headed');
  try {
    return await bounded(
      (async () => {
        const context = await owner.browser.newContext({ locale: 'ko-KR' });
        const page = await context.newPage();
        const response = await page.goto('https://new.7-elevenapp.co.kr/', {
          waitUntil: 'domcontentloaded',
          timeout: 10000,
        });
        if (response?.status() !== 200) throw new Error('Seven public session unavailable');
        const userAgent = await page.evaluate(() => navigator.userAgent);
        const cookies = await context.cookies('https://new.7-elevenapp.co.kr/');
        return {
          cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; '),
          userAgent,
          expiresAt: Date.now() + 30 * 60000,
        };
      })(),
      15000,
    );
  } finally {
    await owner.close();
  }
}
