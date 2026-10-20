# 일본 다이소 사용법과 연동 범위

2026-10-20 확인. 한국 다이소와 일본 다이소는 별도 서비스입니다.

## 지원 범위

- 온라인 상품 검색과 상세, 세금 포함 엔화 가격(JPY).
- 공식 매장명·주소 키워드 검색, 영업시간, 공식 지도에 기재된 좌표.
- 매장별 재고·재고 수량은 아직 지원하지 않습니다. 온라인 판매 가능 여부(`onlineAvailable`)는 오프라인 재고가 아닙니다. 확인할 수 없으면 `null`입니다.
- 상품 검색어는 일본어 또는 JAN 코드를 권장합니다. 한국어 번역이나 한국 상품 ID를 자동 변환하지 않습니다.
- 매장 검색은 이름과 주소를 모두 대상으로 합니다. `渋谷`가 다른 도시의 주소에도 포함될 수 있으므로 주소를 확인하세요. DAISO와 계열 브랜드는 `brand`로 구분합니다.

## 호출 예시

원격 MCP `https://mcp.aka.page`에서 다음 도구를 호출합니다.

```json
{"name":"daiso_jp_search_products","arguments":{"query":"ボウル","page":1}}
{"name":"daiso_jp_get_product","arguments":{"id":"4550746075917"}}
{"name":"daiso_jp_find_stores","arguments":{"keyword":"東京都渋谷区","page":1}}
```

웹 읽기 에이전트는 후속 요청을 포함해 반드시 `format=html`을 지정합니다.

- [상품 검색](https://mcp.aka.page/api/daiso-jp/products?q=%E3%83%9C%E3%82%A6%E3%83%AB&format=html)
- [상품 상세](https://mcp.aka.page/api/daiso-jp/products/4550746075917?format=html)
- [매장 검색](https://mcp.aka.page/api/daiso-jp/stores?keyword=%E6%9D%B1%E4%BA%AC%E9%83%BD%E6%B8%8B%E8%B0%B7%E5%8C%BA&format=html)

개발자용 JSON 응답은 기존처럼 format을 생략하면 됩니다. 페이지는 원본 페이지 단위이며 `hasNext`가 true인 경우에만 page를 증가시킵니다. 전체 검색을 한 번에 수집하지 않습니다.

```sh
npx daiso jp-products ボウル --json
npx daiso jp-product 4550746075917 --json
npx daiso jp-stores 東京都渋谷区 --json
```

## 원본 경로와 제약

- 상품 검색: `https://jp.daisonet.com/search?q=...&type=product&page=1`의 공개 HTML.
- 상세: `https://jp.daisonet.com/products/{13자리 상품 ID}.js`의 공개 JSON. 가격의 소수 단위를 엔화로 변환합니다. 검색 HTML은 세금 포함 가격을 사용합니다.
- 매장: `https://www.daiso-sangyo.co.jp/shop/result?keyword=...`의 공개 HTML. 별도 한국 주소검색을 호출하지 않습니다.
- Shopify 검색 제안 JSON 경로는 조사 중 HTTP 417을 반환했으므로 사용하지 않습니다.
- 공식 앱은 회원가입 없는 매장별 재고 검색을 안내하지만, 안정적으로 호출할 재고 경로는 아직 검증하지 않았습니다. 앱 화면이나 온라인몰 구매 가능 여부를 재고 조회 성공으로 취급하지 않습니다.
- 원본 차단·연결 실패·HTML 구조 변경은 오류로 응답합니다. 정상적으로 확인된 빈 검색과 구분합니다.

## 공식 자료

- [일본 다이소 공식 앱](https://www.daiso-sangyo.co.jp/app)
- [일본 다이소 공식 온라인몰](https://jp.daisonet.com/)
- [일본 다이소 공식 매장 검색](https://www.daiso-sangyo.co.jp/shop)
