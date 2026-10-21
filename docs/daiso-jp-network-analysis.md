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
- 상세: `https://jp.daisonet.com/products/{13자리 상품 ID}`의 공개 HTML에서 `data-product-json` 상품 데이터를 읽습니다. 가격의 소수 단위를 엔화로 변환합니다. 검색 HTML은 세금 포함 가격을 사용합니다.
- `.js` 상세 JSON과 상품 HTML 모두 로컬에서는 200이지만 Cloudflare Worker에서는 403을 확인했습니다. 상세 HTML이 403일 때 공식 검색에 상품 코드를 넣고 정확한 ID가 일치하는 상품만 반환합니다. 이 대체 조회는 `note`로 안내하며 온라인 판매 가능 여부는 `null`입니다. 검색마저 실패하거나 ID가 일치하지 않으면 오류로 반환합니다. 원본 차단을 판매 가능·품절로 바꾸지 않습니다.
- 매장: `https://www.daiso-sangyo.co.jp/shop/result?keyword=...`의 공개 HTML. 별도 한국 주소검색을 호출하지 않습니다.
- Shopify 검색 제안 JSON 경로는 조사 중 HTTP 417을 반환했으므로 사용하지 않습니다.
- 공식 앱은 회원가입 없는 매장별 재고 검색을 안내하지만, 안정적으로 호출할 재고 경로는 아직 검증하지 않았습니다. 앱 화면이나 온라인몰 구매 가능 여부를 재고 조회 성공으로 취급하지 않습니다.
- 원본 차단·연결 실패·HTML 구조 변경은 오류로 응답합니다. 정상적으로 확인된 빈 검색과 구분합니다.

## 공식 자료

- [일본 다이소 공식 앱](https://www.daiso-sangyo.co.jp/app)
- [일본 다이소 공식 온라인몰](https://jp.daisonet.com/)
- [일본 다이소 공식 매장 검색](https://www.daiso-sangyo.co.jp/shop)


## 2026-10-21 상세 조회 정기 점검 보완

상세 페이지403 시 공식 코드 검색에서 정확히 일치하는 상품만 반환하는 기존 경로를 유지합니다. 오늘 캐시 키를 달리한 운영 상세와 코드 검색은 모두 성공했지만 이전 간헐403의 영구 복구를 의미하지 않습니다. 원인을 확인하지 못한 상태에서 헤더 변경·반복 재시도·새 중계를 추가하지 않았습니다.

정기 deep/full의 CLI 계약 검사에 일본 상세 `/api/daiso-jp/products/4550746075917`을 추가했습니다. 일본 REST 상품·상세·매장에도 다른 서비스와 같은 인증된 `x-health-check-force-fresh: true` 캐시 우회를 적용했습니다. 인증 없는 요청은 기존 캐시 정책을 유지하며, 검사 실패를 성공 캐시로 숨기지 않습니다.

같은 날 운영 반영 후 인증된 캐시 우회 상세503 및 CLI/MCP 실패가 다시 재현됐고, 별도 공식 코드 검색은 정확한 상품으로200을 반환했습니다. 후속 수정에서는 상품 코드 검색을 먼저 확보한 뒤 상세 HTML로 온라인 판매 여부를 보강합니다. 상세403이면 이미 확보한 정확한ID만 제한 안내와 함께 반환하며, 검색이 실패해도 상세 성공은 사용합니다. 상세404·429·500이나 파싱 오류는 검색 성공으로 감추지 않습니다. 조회는 검색1회·상세1회로 제한하며 재시도를 추가하지 않습니다. 직접 상세가 성공하던 환경에는 검색1회가 추가되는 비용이 있습니다. 이 순서 변경의 실제 운영 검증과 원본403의 영구 해소 여부는 구분합니다.


### 최종 상세 전송: 명시적 Mac HTTP 중계

앞의 검색 선조회 순서 변경은 실제 운영403을 해소하지 못해 철회했습니다. 로컬과 자체 배포에서 별도 설정이 없으면 기존 상세→403시 정확한코드검색 흐름을 유지합니다. 운영 Worker는 `DAISO_JP_PRODUCT_RELAY_ENABLED="true"`를 명시하고 기존 DTRYX_RELAY_URL/TOKEN/ACCESS_CLIENT_ID/ACCESS_CLIENT_SECRET 설정으로 일본 상세만 HTTP 중계에 연결합니다. 이 플래그가 없으면 DTRYX 설정만으로 일본 전송이 바뀌지 않습니다.

`POST /v1/dtryx/daiso-jp-product`는 `{ "id": "4550746075917" }`만 받으며 임의 URL을 허용하지 않습니다. Mac에서 공식 `https://jp.daisonet.com/products/{id}.js`만 읽고 요청ID와 대조합니다. 리다이렉트는 거절하고 본문2MiB·전체15초 제한을 적용합니다. Worker도 같은 파서로 응답ID를 다시 검증합니다. 재시작할 때 공유 파서의 `src/services/daisoJp/parser.ts`와 types.ts도 runtime에 배치해야 합니다.

상품 검색·매장 검색은 기존 직접 경로를 유지하며 상세에는 브라우저·가상기기·새 로그인·유료 프록시가 필요하지 않습니다. 상세는 연결시험 후 재요청하는 대신 명시적 중계 경로를 사용합니다. 공통 DTRYX 중계의 건강 상태는 기존5분 Cron으로 확인되며 일본 상세는 deep/full CLI 계약에서 실제 조회합니다. 별도 직접상세 probe를 늘리지 않습니다.

일본 상세는 DTRYX/CGV와 동일한 호출 예산 원장을 공유하지만 서비스별 접수·동시성 큐는 별도입니다. 상품정보 캐시는 기존 REST와 동일하게30분이며 인증된 force-fresh는 Worker와 중계 양쪽을 우회합니다. 자체 할당량429·중계인증·원본차단·미확인판매 여부를 성공이나 재고0으로 바꾸지 않습니다. 원본 HTTP상태는 비공개 중계로그에서 확인하고 Worker 공개진단의 upstreamStatus는 중계응답 상태입니다. 일본 오프라인 매장 재고 미지원 범위는 그대로입니다.

기존 운영 Tunnel ingress는 `^/v1/dtryx/.*$`만4320에 전달합니다. 새 작업도 이 경로 안의 `/v1/dtryx/daiso-jp-product`에 배치하여 기존 인증·터널 범위를 유지합니다. 별도 `/v1/daiso-jp/` 경로는 올리브영 서비스로 전달돼401을 반환하는 것을 확인해 사용하지 않습니다.
