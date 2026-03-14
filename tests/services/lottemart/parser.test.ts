/**
 * 롯데마트 파서 테스트
 */

import { describe, expect, it } from 'vitest';
import {
  detectBrandVariant,
  parseMarketOptions,
  parseProductSummary,
  parseProducts,
  parseStores,
  sortStores,
} from '../../../src/services/lottemart/parser.js';
import type { LotteMartStore } from '../../../src/services/lottemart/types.js';

function createStore(overrides: Partial<LotteMartStore>): LotteMartStore {
  return {
    area: '서울',
    storeCode: '0001',
    storeName: '기본점',
    brandVariant: 'lottemart',
    address: '서울시',
    phone: '02-0000-0000',
    openTime: '',
    closedDays: '',
    parkingType: '',
    parkingDetails: '',
    detailUrl: '/mobiledowa/market/detail',
    latitude: 0,
    longitude: 0,
    distanceM: null,
    ...overrides,
  };
}

describe('detectBrandVariant', () => {
  it('매장명 접두사에 따라 브랜드 변형을 판별한다', () => {
    expect(detectBrandVariant('토이저러스 잠실점')).toBe('toysrus');
    expect(detectBrandVariant('맥스 금천점')).toBe('max');
    expect(detectBrandVariant('보틀벙커 제타플렉스점')).toBe('bottlebunker');
    expect(detectBrandVariant('Mealguru 잠실점')).toBe('mealguru');
    expect(detectBrandVariant('그랑그로서리 은평점')).toBe('grandgrocery');
    expect(detectBrandVariant('롯데마트 강변점')).toBe('lottemart');
  });
});

describe('sortStores', () => {
  it('거리, 지역, 매장명 순으로 정렬한다', () => {
    const stores = [
      createStore({ storeCode: '0004', storeName: '나점', area: '서울', distanceM: 100 }),
      createStore({ storeCode: '0003', storeName: '가까운점', area: '부산', distanceM: 50 }),
      createStore({ storeCode: '0002', storeName: '가점', area: '서울', distanceM: 100 }),
      createStore({ storeCode: '0001', storeName: '경기점', area: '경기', distanceM: 100 }),
      createStore({ storeCode: '0005', storeName: '미측정점', area: '서울', distanceM: null }),
    ];

    const sorted = sortStores(stores);

    expect(sorted.map((store) => store.storeCode)).toEqual(['0003', '0001', '0002', '0004', '0005']);
  });
});

describe('HTML 파서 보조 분기', () => {
  it('매장 옵션에서 빈 항목을 제거하고 브랜드를 판별한다', () => {
    expect(
      parseMarketOptions(
        '서울',
        '<option value="">선택</option><option value="2202"></option><option value="2201">토이저러스 잠실점</option>',
      ),
    ).toEqual([
      {
        area: '서울',
        storeCode: '2201',
        storeName: '토이저러스 잠실점',
        brandVariant: 'toysrus',
      },
    ]);
  });

  it('매장 상세 HTML을 파싱한다', () => {
    const [store] = parseStores(
      '서울',
      `
        <section class="sub-wrap result-shop-list">
          <ul class="list-result">
            <li>
              <div class="shop-tit">강변점</div>
              <div class="shop-desc">
                <ul>
                  <li><span>영업시간 : </span> 10:00~23:00</li>
                  <li><span>휴점일 : </span> 둘째 주 일요일</li>
                  <li><span>주소 : </span> 서울 광진구 광나루로 56길 85</li>
                  <li><span>상담전화 : </span><a onclick="goClick('2301');">02-3424-2502</a></li>
                  <li><span>주차정보 : 유료</span><div class="park-info">최초 1시간 무료</div></li>
                </ul>
              </div>
              <a class="link" href="./detail_shop.asp?werks=2301"></a>
            </li>
          </ul>
        </section>
      `,
    );

    expect(store).toEqual(
      expect.objectContaining({
        storeCode: '2301',
        storeName: '강변점',
        openTime: '10:00~23:00',
        closedDays: '둘째 주 일요일',
        parkingType: '유료',
        parkingDetails: '최초 1시간 무료',
        detailUrl: '/mobiledowa/market/detail_shop.asp?werks=2301',
      }),
    );
  });

  it('goClick 기반 매장 코드와 절대 상세 URL도 처리한다', () => {
    const [store] = parseStores(
      '서울',
      `
        <section class="sub-wrap result-shop-list">
          <ul class="list-result">
            <li>
              <div class="shop-tit">잠실점</div>
              <div class="shop-desc">
                <ul>
                  <li><span>주소 : </span> 서울 송파구 올림픽로 240</li>
                  <li><span>상담전화 : </span><a onclick="goClick('2201');">02-411-8025</a></li>
                </ul>
              </div>
              <a class="link" href="/mobiledowa/market/detail_shop.asp"></a>
            </li>
          </ul>
        </section>
      `,
    );

    expect(store.storeCode).toBe('2201');
    expect(store.detailUrl).toBe('/mobiledowa/market/detail_shop.asp');
  });

  it('상품명 fallback과 기본 페이지 수를 처리한다', () => {
    const [product] = parseProducts(
      '서울',
      '2301',
      '강변점',
      '콜라',
      `
        <ul class="list-result">
          <li>
            <div class="prod-box">
              <div class="prod-count">600ML</div>
            </div>
            <div class="layer_wrap">
              <div class="layer_popup">
                <div class="layer-head">펩시콜라</div>
                <table><tbody>
                  <tr><th>ㆍ제조사 :</th><td>롯데칠성음료</td></tr>
                  <tr><th>ㆍ가격 : </th><td>1,680 원</td></tr>
                  <tr><th>ㆍ재고 : </th><td>12 개</td></tr>
                </tbody></table>
              </div>
            </div>
          </li>
        </ul>
      `,
    );

    expect(product).toEqual(
      expect.objectContaining({
        productName: '펩시콜라',
        barcode: '',
        spec: '600ML',
        manufacturer: '롯데칠성음료',
        price: 1680,
        stockQuantity: 12,
      }),
    );

    expect(parseProductSummary('<div class="total-num">검색결과 : <span>0</span>건</div>')).toEqual({
      totalCount: 0,
      totalPages: 1,
    });
  });
});
