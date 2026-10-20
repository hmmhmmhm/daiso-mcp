import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchProducts, getProduct, findStores } from '../../../src/services/daisoJp/client.js';
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}.html`, import.meta.url), 'utf8');
const respond = (body: string, status = 200) =>
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async () => new Response(body, { status })),
  );
afterEach(() => vi.unstubAllGlobals());

describe('일본 공식 클라이언트', () => {
  it('검색어를 인코딩하고 페이지와 출처 제한을 돌려준다', async () => {
    respond(fixture('products'));
    expect(await searchProducts(' ボウル ', 2)).toMatchObject({
      country: 'JP',
      currency: 'JPY',
      query: 'ボウル',
      page: 2,
      hasNext: true,
      note: expect.stringContaining('재고'),
    });
    const url = new URL(vi.mocked(fetch).mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe('https://jp.daisonet.com/search');
    expect(url.searchParams.get('q')).toBe('ボウル');
    expect(url.searchParams.get('type')).toBe('product');
    expect(url.searchParams.get('page')).toBe('2');
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });
  it('상품 JSON을 조회한다', async () => {
    respond(
      JSON.stringify({ handle: '4550746075917', title: 'ボウル', price: 22000, available: false }),
    );
    expect(await getProduct('4550746075917')).toMatchObject({
      id: '4550746075917',
      price: 220,
      onlineAvailable: false,
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://jp.daisonet.com/products/4550746075917.js',
      expect.any(Object),
    );
  });
  it('키워드 공식 경로와 후속 페이지를 사용한다', async () => {
    respond(fixture('stores'));
    expect(await findStores(' 東京 ')).toMatchObject({
      country: 'JP',
      keyword: '東京',
      page: 1,
      hasNext: true,
      note: expect.stringContaining('브랜드'),
    });
    expect(new URL(vi.mocked(fetch).mock.calls[0][0] as string).pathname).toBe('/shop/result');
    await findStores('東京', 2);
    const url = new URL(vi.mocked(fetch).mock.calls[1][0] as string);
    expect(url.pathname).toBe('/shop/result/page/2/');
    expect(url.searchParams.get('keyword')).toBe('東京');
  });
  it('입력 오류는 요청 전에 차단한다', async () => {
    vi.stubGlobal('fetch', vi.fn());
    for (const q of ['', ' ', 'a'.repeat(101), null, 12]) {
      await expect(searchProducts(q as string)).rejects.toThrow('검색어');
      await expect(findStores(q as string)).rejects.toThrow('검색어');
    }
    for (const page of [0, -1, 1.5, NaN, Infinity, 101]) {
      await expect(searchProducts('a', page)).rejects.toThrow('페이지');
      await expect(findStores('a', page)).rejects.toThrow('페이지');
    }
    for (const id of ['x', '../4550746075917', '123', null])
      await expect(getProduct(id as string)).rejects.toThrow('상품');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([403, 429, 500, 503])(
    'HTTP %i 오류의 원문은 노출하지 않고 재시도하지 않는다',
    async (status) => {
      respond('secret upstream body', status);
      await expect(searchProducts('a')).rejects.toMatchObject({
        name: 'ServiceError',
        status: 503,
        upstreamStatus: status,
      });
      expect(fetch).toHaveBeenCalledTimes(1);
      await expect(findStores('a')).rejects.not.toThrow('secret');
      await expect(getProduct('4550746075917')).rejects.not.toThrow('secret');
    },
  );
  it('네트워크와 JSON 오류를 안전하게 구분한다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('secret network')));
    await expect(searchProducts('a')).rejects.toMatchObject({ status: 503 });
    respond('<html>secret challenge</html>');
    await expect(getProduct('4550746075917')).rejects.toMatchObject({ status: 502 });
    respond('not JSON secret');
    await expect(getProduct('4550746075917')).rejects.toMatchObject({ status: 502 });
    respond('<html>secret changed</html>');
    await expect(searchProducts('a')).rejects.toMatchObject({
      code: 'DAISO_JP_PARSE_FAILED',
      status: 502,
    });
  });
});
