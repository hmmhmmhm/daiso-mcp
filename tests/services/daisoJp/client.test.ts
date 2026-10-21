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
  it('상품 HTML의 전용 JSON을 조회한다', async () => {
    respond(fixture('product-detail'));
    expect(await getProduct('4550746075917')).toMatchObject({
      id: '4550746075917',
      price: 220,
      onlineAvailable: false,
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://jp.daisonet.com/products/4550746075917',
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

describe('상세 페이지 차단 시 공식 상품 코드 검색', () => {
  it('상세 차단 이후 검색도 거절되는 경우 먼저 확보한 동일 상품을 반환한다', async () => {
    let denied = false;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (new URL(String(input)).pathname.startsWith('/products/')) denied = true;
      return denied ? new Response('denied', { status: 403 }) : new Response(fixture('products'));
    }));
    expect(await getProduct('4550746075917')).toMatchObject({ id: '4550746075917', onlineAvailable: null });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('코드 검색과 상세가 모두 성공하면 상세의 온라인 판매 여부를 유지한다', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(fixture('products')))
      .mockResolvedValueOnce(new Response(fixture('product-detail'))));
    expect(await getProduct('4550746075917')).toMatchObject({ onlineAvailable: false, price: 220 });
  });
  const deniedThen = (body: string, status = 200) => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(new Response(body, { status }))
      .mockResolvedValueOnce(new Response('secret denied', { status: 403 }));
    vi.stubGlobal('fetch', mock);
    return mock;
  };
  it('상세403일 때 먼저 확보한 코드 검색의 정확한 ID와 제한 안내를 반환한다', async () => {
    const mock = deniedThen(fixture('products'));
    expect(await getProduct('4550746075917')).toMatchObject({
      id: '4550746075917',
      name: 'ステンレスボウル',
      onlineAvailable: null,
      note: '상세 페이지 접근 제한으로 공식 상품 코드 검색 결과를 반환합니다. 온라인 판매 가능 여부는 확인하지 못했습니다.',
    });
    expect(mock).toHaveBeenCalledTimes(2);
    const url = new URL(mock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/search');
    expect(url.searchParams.get('q')).toBe('4550746075917');
    expect(url.searchParams.get('page')).toBe('1');
  });
  it('정확한 ID가 없으면 원래 상세 페이지 403 오류를 보존한다', async () => {
    deniedThen(fixture('products'));
    await expect(getProduct('4550746075918')).rejects.toMatchObject({
      name: 'ServiceError',
      code: 'DAISO_JP_UPSTREAM_FAILED',
      status: 503,
      upstreamStatus: 403,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('검색도 실패하면 검색의 안전한 오류를 반환한다', async () => {
    deniedThen('secret search failed', 503);
    await expect(getProduct('4550746075917')).rejects.toMatchObject({
      code: 'DAISO_JP_UPSTREAM_FAILED',
      upstreamStatus: 503,
    });
    deniedThen('<html>secret search changed</html>');
    await expect(getProduct('4550746075917')).rejects.toMatchObject({
      code: 'DAISO_JP_PARSE_FAILED',
      status: 502,
    });
  });
  it.each([404, 429, 500])('상세 페이지 %i는 검색 결과로 감추거나 재시도하지 않는다', async (status) => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(fixture('products')))
      .mockResolvedValueOnce(new Response('secret upstream error', { status })));
    await expect(getProduct('4550746075917')).rejects.toMatchObject({ upstreamStatus: status });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('직접 상세 조회 성공 시 확인된 온라인 판매 여부를 유지한다', async () => {
    respond(fixture('product-detail').replace('"available":false', '"available":true'));
    expect(await getProduct('4550746075917')).toMatchObject({ onlineAvailable: true, price: 220 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
