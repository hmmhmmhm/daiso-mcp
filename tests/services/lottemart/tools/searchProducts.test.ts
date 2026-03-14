/**
 * 롯데마트 상품 검색 도구 테스트
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __testOnlyClearLotteMartCaches } from '../../../../src/services/lottemart/client.js';
import { createSearchProductsTool } from '../../../../src/services/lottemart/tools/searchProducts.js';

const mockFetch = vi.fn();
const createSessionResponse = () => new Response('', { headers: { 'set-cookie': 'ASPSESSIONID=TEST; path=/' } });

beforeEach(() => {
  mockFetch.mockReset();
  __testOnlyClearLotteMartCaches();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createSearchProductsTool', () => {
  it('올바른 도구 정의를 반환한다', () => {
    const tool = createSearchProductsTool();

    expect(tool.name).toBe('lottemart_search_products');
    expect(tool.metadata.title).toBe('롯데마트 상품 검색');
  });

  it('상품 검색 결과를 반환한다', async () => {
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
                <div class="prod-count"><!--8801094011307-->1.2L</div>
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

    const tool = createSearchProductsTool();
    const result = await tool.handler({
      area: '서울',
      storeName: '강변점',
      keyword: '콜라',
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.totalCount).toBe(1);
    expect(parsed.products[0].productName).toBe('코카콜라');
  });
});
