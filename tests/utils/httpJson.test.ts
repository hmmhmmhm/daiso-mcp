import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJson } from '../../src/utils/http.js';

afterEach(() => vi.unstubAllGlobals());

describe('JSON 응답 형식 검증', () => {
  it.each(['\r\n<!DOCTYPE html><html>private content</html>', '<HTML>private content</HTML>'])(
    'HTML 응답을 본문 노출 없는 구분 가능한 오류로 반환한다', async (body) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, {
        headers: { 'Content-Type': 'text/html' },
      })));
      await expect(fetchJson('https://example.com')).rejects.toMatchObject({
        name: 'UnexpectedHtmlResponseError', status: 200, contentType: 'text/html',
      });
    },
  );

  it('Content-Type이 없어도 HTML 본문을 구분한다', async () => {
    const response = new Response('<html>private content</html>');
    response.headers.delete('content-type');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await expect(fetchJson('https://example.com')).rejects.toMatchObject({
      name: 'UnexpectedHtmlResponseError', contentType: '',
      message: 'JSON 대신 HTML 응답을 받았습니다 (HTTP 200).',
    });
  });

  it('잘못 표기된 Content-Type의 유효한 JSON을 허용한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"ok":true}', {
      headers: { 'Content-Type': 'text/html' },
    })));
    await expect(fetchJson('https://example.com')).resolves.toEqual({ ok: true });
  });

  it.each(['{broken', '<not-html>', ''])('HTML이 아닌 잘못된 JSON은 구문 오류로 유지한다', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    await expect(fetchJson('https://example.com')).rejects.toBeInstanceOf(SyntaxError);
  });
});
