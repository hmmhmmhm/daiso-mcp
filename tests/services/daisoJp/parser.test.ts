import * as parser from '../../../src/services/daisoJp/parser.js';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseProductSearch,
  parseProductDetail,
  parseStoreSearch,
} from '../../../src/services/daisoJp/parser.js';
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}.html`, import.meta.url), 'utf8');
const products = fixture('products');
const stores = fixture('stores');

describe('일본 공식 응답 파싱', () => {
  it('세금 포함 엔 가격과 공개 상품 식별자를 읽는다', () => {
    const result = parseProductSearch(products);
    expect(result.hasNext).toBe(true);
    expect(result.products[0]).toEqual({
      country: 'JP',
      id: '4550480417295',
      name: 'テスト & ボウル',
      price: 110,
      currency: 'JPY',
      url: 'https://jp.daisonet.com/products/4550480417295',
      onlineAvailable: null,
      storeInventorySupported: false,
      imageUrl: 'https://jp.daisonet.com/cdn/shop/files/sample_600x.jpg',
    });
    expect(result.products[1].price).toBeNull();
  });
  it('정상 검색의 빈 결과만 허용한다', () => {
    expect(
      parseProductSearch('<p class="empty-state__description">検索が見つかりませんでした</p>'),
    ).toEqual({ products: [], hasNext: false });
    expect(parseStoreSearch('<ul class="resultList">該当する店舗がありません。</ul>')).toEqual({
      stores: [],
      hasNext: false,
    });
    for (const html of [
      '',
      '<html>Access denied secret</html>',
      '<div class="product-list"></div>',
    ])
      expect(() => parseProductSearch(html)).toThrow('응답 형식');
    expect(() => parseStoreSearch('<ul class="resultList"></ul>')).toThrow('응답 형식');
  });
  it('상품 응답 누락이나 변경을 빈 결과로 숨기지 않는다', () => {
    expect(() => parseProductSearch(products.replace('テスト &amp; ボウル', ''))).toThrow(
      '응답 형식',
    );
    expect(() =>
      parseProductSearch(
        products.replace(
          '/products/4550480417295?_pos=1" class="product-item__title',
          '/products/bad" class="product-item__title',
        ),
      ),
    ).toThrow();
  });
  it('공개 JSON 센트 단위를 엔으로 바꾸고 온라인 판매만 표시한다', () => {
    expect(
      parseProductDetail(
        {
          handle: '4550746075917',
          title: 'ボウル',
          price: 22000,
          available: true,
          featured_image: '//cdn.shopify.com/a.jpg',
        },
        '4550746075917',
      ),
    ).toEqual({
      country: 'JP',
      id: '4550746075917',
      name: 'ボウル',
      price: 220,
      currency: 'JPY',
      url: 'https://jp.daisonet.com/products/4550746075917',
      onlineAvailable: true,
      storeInventorySupported: false,
      imageUrl: 'https://cdn.shopify.com/a.jpg',
    });
    expect(
      parseProductDetail({ handle: '4550746075917', title: 'ボウル' }, '4550746075917'),
    ).toMatchObject({ price: null, onlineAvailable: null });
  });
  it('공식 매장 코드와 지도 좌표를 읽는다', () => {
    expect(parseStoreSearch(stores)).toEqual({
      stores: [
        {
          id: '000001',
          name: 'DAISO テスト店',
          address: '東京都テスト1-2-3',
          hours: '10:00-21:00',
          url: 'https://www.daiso-sangyo.co.jp/shop/detail/000001',
          latitude: 35.6,
          longitude: 139.7,
          brand: 'DAISO',
        },
      ],
      hasNext: true,
    });
  });
});

it('상품 카드 밖의 가격을 누락된 카드 가격으로 사용하지 않는다', () => {
  const html = products.replace(
    '<a class="pagination__next',
    '<p>税込999円</p><a class="pagination__next',
  );
  expect(parseProductSearch(html).products[1].price).toBeNull();
});

it('누락된 필수 카드와 식별자는 응답 변경으로 처리한다', () => {
  expect(() =>
    parseProductSearch(products.replace('product-item__title', 'changed-title')),
  ).toThrow();
  expect(() =>
    parseProductSearch(
      products.replace(
        'href="/products/4550480417295?_pos=1" class="product-item__title',
        'class="product-item__title',
      ),
    ),
  ).toThrow();
  for (const data of [
    null,
    'blocked',
    {},
    { handle: 'bad' },
    { handle: '4550746075917', title: 7 },
    { handle: '4550746075917', title: ' ' },
  ])
    expect(() => parseProductDetail(data, '4550746075917')).toThrow('응답 형식');
  for (const html of [
    stores.replace('/detail/000001', '/detail/bad'),
    stores.replace('DAISO テスト店', ''),
    stores.replace('<dt>住所</dt>', '<dt>変更</dt>'),
    stores.replace('東京都テスト1-2-3', ''),
  ])
    expect(() => parseStoreSearch(html)).toThrow('응답 형식');
});

it('제공되지 않거나 유효하지 않은 정보는 확인 불가로 보존한다', () => {
  for (const price of [-1, NaN, Infinity, '22000'])
    expect(
      parseProductDetail({ handle: '4550746075917', title: 'ボウル', price }, '4550746075917')
        .price,
    ).toBeNull();
  for (const featured_image of ['https://cdn.shopify.com/a.jpg', 'javascript:alert(1)', '']) {
    const result = parseProductDetail(
      { handle: '4550746075917', title: 'ボウル', featured_image },
      '4550746075917',
    );
    expect(result.imageUrl).toBe(featured_image.startsWith('https:') ? featured_image : undefined);
  }
  expect(parseProductSearch(products.replace('data-src=', 'src=')).products[0].imageUrl).toContain(
    '600x',
  );
  expect(
    parseProductSearch(products.replace(/<img[^>]*>/, '<img>')).products[0].imageUrl,
  ).toBeUndefined();
  expect(
    parseStoreSearch(
      stores
        .replace('<dl><dt>営業時間</dt><dd>10:00-21:00</dd></dl>', '')
        .replace(/<a href="https:\/\/www.daiso-sangyo.co.jp\/shop\/map[^>]*>/, '<a>'),
    ).stores[0],
  ).toMatchObject({ hours: '', latitude: null, longitude: null });
  for (const replacement of ['lat=&amp;lon=', 'lat=999&amp;lon=-999', 'lat=NaN&amp;lon=Infinity'])
    expect(
      parseStoreSearch(stores.replace('lat=35.6&amp;lon=139.7', replacement)).stores[0],
    ).toMatchObject({ latitude: null, longitude: null });
  expect(
    parseStoreSearch(stores.replace('<span class="resultList-item-category">DAISO</span>', ''))
      .stores[0].brand,
  ).toBe('');
});

it('일본 이름과 주소의 숫자 문자 참조와 공백을 복원한다', () => {
  expect(
    parseProductSearch(
      products.replace(
        'テスト &amp; ボウル',
        '&#12486;&#x30b9;&#x30c8; &quot;&apos;&lt;&gt;&nbsp;&#39; &#999999999;',
      ),
    ).products[0].name,
  ).toBe("テスト \"'<> ' &#999999999;");
});

it('공식 지도가 아닌 주소 링크에서 좌표를 추측하지 않는다', () => {
  expect(parseStoreSearch(stores.replace('/shop/map?', '/unrelated?')).stores[0]).toMatchObject({
    latitude: null,
    longitude: null,
  });
  expect(
    parseStoreSearch(stores.replace('<span class="resultList-item-category">DAISO</span>', ''))
      .stores[0].brand,
  ).toBe('');
});

it('공식 카테고리 수정 클래스가 있는 계열 브랜드를 보존한다', () => {
  expect(parseStoreSearch(fixture('store-brands')).stores.map((store) => store.brand)).toEqual([
    'Standard Products',
    'THREEPPY',
  ]);
});

it('상품 HTML의 전용 JSON만 읽고 엔 가격과 온라인 판매 여부를 복원한다', () => {
  expect(parser.parseProductPage(fixture('product-detail'), '4550746075917')).toMatchObject({
    country: 'JP',
    id: '4550746075917',
    name: 'ステンレスボウル',
    price: 220,
    onlineAvailable: false,
  });
  expect(
    parser.parseProductPage(
      '<script data-product-json type="application/json">{"product":{"handle":"4550746075917","title":"ボウル"}}</script>',
      '4550746075917',
    ),
  ).toMatchObject({ price: null, onlineAvailable: null });
});

it('누락·차단·오염된 상품 HTML은 빈 결과 대신 안전한 형식 오류로 처리한다', () => {
  const page = fixture('product-detail');
  const malformed = page.replace('"price":22000', '"price":invalid');
  const missingProduct = '<script type="application/json" data-product-json>{}</script>';
  const nullWrapper = '<script type="application/json" data-product-json>null</script>';
  for (const html of [
    '',
    '<html>secret blocked</html>',
    page.replace('data-product-json>', 'data-product-json-other>'),
    page.replace('application/json" data-product-json', 'text/plain" data-product-json'),
    malformed,
    missingProduct,
    nullWrapper,
    page.replace('4550746075917', '4550746075918'),
    page.replace('"title":"ステンレスボウル",', ''),
  ]) {
    expect(() => parser.parseProductPage(html, '4550746075917')).toThrow(
      expect.objectContaining({ name: 'ServiceError', code: 'DAISO_JP_PARSE_FAILED', status: 502 }),
    );
    expect(() => parser.parseProductPage(html, '4550746075917')).not.toThrow('secret');
  }
});
