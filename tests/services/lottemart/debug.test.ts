import { describe, expect, it, vi } from 'vitest';
import * as session from '../../../src/services/lottemart/session.js';
import { buildLotteMartDebugRequest, probeLotteMartUpstream } from '../../../src/services/lottemart/debug.js';

describe('buildLotteMartDebugRequest', () => {
  it('market-options 요청을 만든다', () => {
    const request = buildLotteMartDebugRequest({
      target: 'market-options',
      area: '제주',
      type: '2',
      storeCode: '2901',
    });

    expect(request.method).toBe('GET');
    expect(request.url).toContain('p_area=%EA%B8%B0%ED%83%80');
    expect(request.url).toContain('p_type=2');
    expect(request.url).toContain('p_werks=2901');
  });

  it('stores 요청을 만든다', () => {
    const request = buildLotteMartDebugRequest({
      target: 'stores',
      area: '서울',
      keyword: '강변',
      storeCode: '2301',
    });

    expect(request.method).toBe('POST');
    expect(request.bodyText).toBe('m_area=%EC%84%9C%EC%9A%B8&m_market=2301&m_schWord=%EA%B0%95%EB%B3%80');
  });

  it('products 요청을 만든다', () => {
    const request = buildLotteMartDebugRequest({
      target: 'products',
      area: '경기',
      storeCode: '2415',
      keyword: '핫식스',
    });

    expect(request.method).toBe('POST');
    expect(request.bodyText).toBe('p_area=%EA%B2%BD%EA%B8%B0&p_market=2415&p_schWord=%ED%95%AB%EC%8B%9D%EC%8A%A4');
  });

  it('product-page 요청을 만든다', () => {
    const request = buildLotteMartDebugRequest({
      target: 'product-page',
      storeCode: '2415',
      keyword: '핫식스',
      page: 3,
    });

    expect(request.method).toBe('GET');
    expect(request.url).toContain('p_market=2415');
    expect(request.url).toContain('p_schWord=%ED%95%AB%EC%8B%9D%EC%8A%A4');
    expect(request.url).toContain('page=3');
  });

  it('기본값으로 경기/타입1/핫식스/2415/page2를 사용한다', () => {
    const marketOptions = buildLotteMartDebugRequest({
      target: 'market-options',
    });
    const stores = buildLotteMartDebugRequest({
      target: 'stores',
    });
    const products = buildLotteMartDebugRequest({
      target: 'products',
    });
    const productPage = buildLotteMartDebugRequest({
      target: 'product-page',
      page: 0,
    });

    expect(marketOptions.url).toContain('p_area=%EA%B2%BD%EA%B8%B0');
    expect(marketOptions.url).toContain('p_type=1');
    expect(stores.bodyText).toBe('m_area=%EA%B2%BD%EA%B8%B0');
    expect(products.bodyText).toBe('p_area=%EA%B2%BD%EA%B8%B0&p_market=2415&p_schWord=%ED%95%AB%EC%8B%9D%EC%8A%A4');
    expect(productPage.url).toContain('p_market=2415');
    expect(productPage.url).toContain('p_schWord=%ED%95%AB%EC%8B%9D%EC%8A%A4');
    expect(productPage.url).toContain('page=2');
  });

  it('지원하지 않는 area면 경기로 fallback한다', () => {
    const request = buildLotteMartDebugRequest({
      target: 'stores',
      area: '없는지역',
    });

    expect(request.bodyText).toBe('m_area=%EA%B2%BD%EA%B8%B0');
  });
});

describe('probeLotteMartUpstream', () => {
  it('세션 probe 호출 결과를 감싼다', async () => {
    vi.spyOn(session, 'probeLotteMartRequest').mockResolvedValueOnce([
      {
        used: 'direct',
        success: false,
        status: null,
        statusText: null,
        error: 'The operation was aborted',
        bodyPreview: null,
        sessionCookie: null,
      },
      {
        used: 'zyte',
        success: false,
        status: null,
        statusText: null,
        error: 'Zyte API 호출 실패: 520 Website Ban',
        bodyPreview: null,
        sessionCookie: null,
      },
    ]);

    const result = await probeLotteMartUpstream({
      target: 'stores',
      area: '경기',
      keyword: '안산 중앙역',
      zyteApiKey: 'test-key',
    });

    expect(result.request.target).toBe('stores');
    expect(result.request.hasZyteApiKey).toBe(true);
    expect(result.attempts).toHaveLength(2);
  });

  it('GET target이면 HTML 조회 헤더와 기본 timeout을 사용한다', async () => {
    const probeSpy = vi.spyOn(session, 'probeLotteMartRequest').mockResolvedValueOnce([]);

    await probeLotteMartUpstream({
      target: 'market-options',
    });

    expect(probeSpy).toHaveBeenCalledWith(
      expect.stringContaining('/mobiledowa/inc/asp/search_market_list.asp'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Accept: 'text/html, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
        }),
      }),
      45000,
      '',
      undefined,
    );
  });
});
