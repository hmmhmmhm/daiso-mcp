/** 개인 프로필과 분리된 브라우저의 동일 출처 조회. */
import type { Page } from 'playwright';
import {
  buildOliveyoungHtmlPath,
  isOliveyoungHtmlPath,
  toOliveyoungHtmlResponse,
} from '../../src/services/oliveyoung/htmlRoute.js';
import type { BrowserRunner } from './oliveyoung.js';
export class BrowserRequestError extends Error {
  constructor(
    readonly reason: string,
    readonly upstreamStatus?: number,
    readonly retryAfter?: number,
  ) {
    super(`올리브영 브라우저 응답 실패: ${reason}`);
  }
}
export function createBrowserRunner(page: Pick<Page, 'evaluate'>): BrowserRunner {
  return async (path, body) => {
    // 오특은 JSON API가 없어 고정 HTML 경로만 GET으로 읽고 검증한 뒤 JSON으로 감쌉니다.
    const html = isOliveyoungHtmlPath(path);
    const target = html ? buildOliveyoungHtmlPath(path, body) : path;
    const result = await page.evaluate(
      async ({ path, body, html, timeout }) => {
        let status: number | undefined;
        try {
          const response = await fetch(`https://www.oliveyoung.co.kr${path}`, {
            method: html ? 'GET' : 'POST',
            credentials: 'include',
            headers: html
              ? { Accept: 'text/html', 'X-Requested-With': 'XMLHttpRequest' }
              : {
                  'Content-Type': 'application/json',
                  Accept: 'application/json',
                  'X-Requested-With': 'XMLHttpRequest',
                },
            body: html ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(timeout),
          });
          status = response.status;
          if (status !== 200) {
            await response.body?.cancel();
            const header = response.headers.get('retry-after');
            const seconds = header && /^\d+$/.test(header) ? Number(header)
              : header ? Math.ceil((Date.parse(header) - Date.now()) / 1000) : NaN;
            const retryAfter = Number.isSafeInteger(seconds) && seconds > 0
              ? Math.min(seconds, 86400) : undefined;
            return { status, body: null, retryAfter };
          }
          const reader = response.body?.getReader();
          if (!reader) throw new Error('Browser response body missing');
          const decoder = new TextDecoder();
          let bytes = 0;
          let text = '';
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > 2 * 1024 * 1024) {
              await reader.cancel();
              throw new Error('Browser response size limit');
            }
            text += decoder.decode(chunk.value, { stream: true });
          }
          text += decoder.decode();
          if (html) return { status: response.status, body: text };
          let parsed = null;
          try {
            parsed = JSON.parse(text);
          } catch {
            /* 보안 검증 HTML을 정상 데이터로 반환하지 않습니다. */
          }
          return { status: response.status, body: parsed };
        } catch (error) {
          const name = error instanceof Error ? error.name : '';
          const message = error instanceof Error ? error.message : '';
          const reason =
            name === 'TimeoutError' || name === 'AbortError'
              ? 'timeout'
              : message === 'Browser response size limit'
                ? 'response size limit'
                : message === 'Browser response body missing'
                  ? 'body missing'
                  : 'network';
          return { status, body: null, reason };
        }
      },
      { path: target, body, html, timeout: 15000 },
    );
    if (html && !result.reason && result.status === 200) {
      try {
        return toOliveyoungHtmlResponse(path, result.body);
      } catch {
        // 보안 확인 화면이나 다른 페이지를 빈 오특 목록으로 반환하지 않습니다.
        throw new BrowserRequestError('invalid-html', result.status);
      }
    }
    if (result.reason || result.status !== 200 || result.body?.status !== 'SUCCESS')
      throw new BrowserRequestError(
        result.reason ||
          (result.status !== 200
            ? `http-${result.status}`
            : result.body
              ? 'business'
              : 'invalid-json'),
        result.status,
        result.retryAfter,
      );
    return result.body;
  };
}
