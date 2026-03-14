/**
 * 앱 통합 테스트 - 롯데마트 API
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../../src/index.js';
import { __testOnlyClearLotteMartCaches } from '../../src/services/lottemart/client.js';
import { setupFetchMock } from './testHelpers.js';

const mockFetch = vi.fn();
const createSessionResponse = () => new Response('', { headers: { 'set-cookie': 'ASPSESSIONID=TEST; path=/' } });
setupFetchMock(mockFetch);

beforeEach(() => {
  __testOnlyClearLotteMartCaches();
});

describe('GET /api/lottemart/stores', () => {
  it('롯데마트 매장 검색 결과를 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(createSessionResponse())
      .mockResolvedValueOnce(
        new Response(`
          <section class="sub-wrap result-shop-list">
            <ul class="list-result">
              <li>
                <div class="shop-tit">강변점</div>
                <div class="shop-desc">
                  <ul>
                    <li><span>주소 : </span> 서울 광진구 광나루로 56길 85</li>
                    <li><span>상담전화 : </span><a onclick="goClick('2301');">02-3424-2502</a></li>
                  </ul>
                </div>
                <a class="link" href="./detail_shop.asp?werks=2301"></a>
              </li>
            </ul>
          </section>
        `),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'OK',
            results: [{ geometry: { location: { lat: 37.5354, lng: 127.0958 } } }],
          }),
        ),
      );

    const res = await app.request('/api/lottemart/stores?area=서울&lat=37.5354&lng=127.0958', undefined, {
      GOOGLE_MAPS_API_KEY: 'test-key',
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.stores).toHaveLength(1);
  });
});

describe('GET /api/lottemart/products', () => {
  it('롯데마트 상품 검색 결과를 반환한다', async () => {
    mockFetch
      .mockResolvedValueOnce(createSessionResponse())
      .mockResolvedValueOnce(new Response('<option value="2301">강변점</option>'))
      .mockResolvedValueOnce(
        new Response(`
          <!doctype html>
          <div class="total-num">검색결과 : <span>1</span>건</div>
          <script>var totalPage = "1";</script>
          <ul class="list-result">
            <li>
              <div class="prod-box">
                <div class="prod-name">코카콜라</div>
                <div class="prod-count">1.2L</div>
              </div>
              <div class="layer_wrap">
                <div class="layer_popup">
                  <div class="layer-head">코카콜라</div>
                  <table><tbody>
                    <tr><th>ㆍ제조사 :</th><td>코카콜라음료 주식회사</td></tr>
                    <tr><th>ㆍ가격 : </th><td>2,980 원</td></tr>
                    <tr><th>ㆍ재고 : </th><td>20 개</td></tr>
                  </tbody></table>
                  <div class="layer-foot"><span>닫기</span></div>
                </div>
              </div>
            </li>
          </ul>
        `),
      );

    const res = await app.request('/api/lottemart/products?area=서울&storeName=강변점&keyword=콜라');
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.data.products).toHaveLength(1);
  });

  it('매장 정보가 없으면 에러를 반환한다', async () => {
    const res = await app.request('/api/lottemart/products?keyword=콜라');
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('MISSING_STORE');
  });
});
