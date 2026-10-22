# 공개 MCP 도구

공개 도구는 정확히 10개이며 절대 늘리지 않습니다. 새 기능과 서비스는 기존 도구의 service/operation/requestType 안에서 확장합니다. 이 규칙은 일반 MCP와 PlayMCP 모두에 적용합니다.

| 도구                  | 역할                    |
| --------------------- | ----------------------- |
| `search_products`     | 상품 검색               |
| `find_stores`         | 매장 검색               |
| `check_inventory`     | 상품 재고 조회          |
| `get_product_details` | 상품 상세 조회          |
| `find_places`         | 주변 장소와 영화관 검색 |
| `get_showtimes`       | 영화와 상영 시간표 조회 |
| `get_fuel_info`       | 유가와 주유소 조회      |
| `get_catalog`         | 인기 검색어와 기획전    |
| `compare_products`    | 상품 비교               |
| `submit_request`      | 요청 제출               |

## 호출 예시

아래 예시는 이미 연결된 MCP 도구의 호출 계약입니다. 웹 읽기만 가능한 환경에서는 설치·연결 설정 없이 [첫 HTML 조회](https://mcp.aka.page/browse/daiso/products/%EC%88%98%EB%82%A9%EB%B0%95%EC%8A%A4/pageSize/3)를 open/WebFetch로 엽니다. 모든 후속 조회는 `/browse/` 경로이며 쿼리 문자열이나 format 지정은 필요 없습니다.

상품 검색: `search_products {"service":"daiso","query":"수납박스","pageSize":3}`

재고: `check_inventory {"service":"gs25","keyword":"오감자","storeKeyword":"강남"}`

상품명으로 다이소 재고: `check_inventory {"service":"daiso","operation":"by_name","query":"수납박스","storeQuery":"강남"}`

일본 상세: `get_product_details {"service":"daiso_jp","operation":"product","id":"4550746075917"}`. 일본 매장별 재고는 지원하지 않습니다.

요청 제출: `submit_request {"requestType":"developer","request":{"title":"문서 개선","description":"개선할 내용을 적습니다","type":"docs"}}`. 현재 개발자 요청 저장만 지원합니다. 다른 요청 유형은 거절하며 요청자의 의도 없이 제출하지 않습니다. 이 도구의 이름과 요청 구분은 미래 유형 확장을 위해 범용으로 유지합니다.

매개변수는 기존 작업의 이름과 형식을 사용합니다. operation은 같은 서비스에 작업이 여러 개인 경우 필수입니다. 예를 들어 CGV 시간표는 service=cgv, operation=timetable, playDate=YYYYMMDD이며 seats 작업은 지원하지 않습니다. 미지원 조합과 알 수 없는 인수·오타는 조회 전에 거절합니다. 공개 스키마에 있지만 선택한 서비스/작업에서 쓰지 않는 옵션은 실행을 막지 않고 응답의 추가 안내와 `_meta.ignoredArguments`로 미적용 사실을 알립니다. 미적용 조건을 충족했다고 안내하면 안 됩니다. 기본값은 선택한 작업의 기본값만 적용합니다. tools/list의 입력/출력 스키마를 참고하세요.

### 카탈로그와 매장 재고 검증

`get_catalog`는 세븐일레븐의 공개 콘텐츠 조회입니다. `operation`은 필수이며 `popwords`(인기 검색어) 또는 `snapshot`(상품·이슈·기획전)을 지정합니다. `includeIssues`와 `includeExhibition`은 `snapshot` 전용입니다. 인기 검색어 원본 목록이 비어 있으면 `available=false`이며 외부 오류와 구분합니다. 원본 차단·중계 실패는 오류로 반환하며 빈 성공으로 바꾸지 않습니다.

다이소 `check_inventory`에서 `storeLimit`은 `pageSize`와 같은 매장 수 조건입니다. 함께 전달하면 두 값이 같아야 합니다. `productLimit`은 상품 후보 수이며 여러 상품의 재고를 모두 조회하는 옵션이 아닙니다. 결과의 `selectedProduct`가 재고 조회 기준 상품입니다.

다이소 `search_products`의 `includeSoldOut=false`는 현재 페이지의 품절 상품을 제외합니다. `count`는 반환된 상품 수이며 `totalCount`는 필터 전 전체 검색 건수입니다.

정기 MCP smoke는 실제 상품 ID·이름·매장 코드·매장명·수량과 집계 일치를 검사합니다. 정상 수량 0은 통과하지만 수량 미확인만 있는 응답이나 요약 문장만 있는 응답은 정상 조회로 통과시키지 않습니다. 세븐일레븐 matrix는 상품 검색 외에 카탈로그 두 작업도 실제 호출합니다. 단위 테스트와 캐시된 성공만으로 PlayMCP 정상 동작을 판단하지 않고, 등록 스키마 갱신 후 플랫폼 채팅에서 실제 인수·결과를 확인합니다.

## Deprecated 하위호환

기존 44개 호출 계약은 유지합니다. compare_products는 공개 이름이 그대로이며 나머지 43개 구형 이름은 deprecated 별칭입니다. 구형 이름도 동일한 / 및 /mcp의 tools/call로 호출할 수 있고 기존 인수/결과/오류 의미를 유지합니다. 성공 또는 반환된 오류 응답의 _meta.deprecated=true와 _meta.replacement는 이동할 공개 도구를 안내합니다. SDK 입력 검증 단계에서 거절된 요청에는 이 추가 정보가 없을 수 있습니다. tools/list와 공개 발견 목록에는 구형 별칭을 노출하지 않습니다.

REST 경로와 CLI 명령은 변경하지 않습니다. 구형 별칭을 삭제하거나 다시 공개 목록에 등록하지 마세요. 새 연동은 아래 오른쪽 도구만 사용합니다.

| 기존 이름                          | 공개 도구             | service     | operation        |
| ---------------------------------- | --------------------- | ----------- | ---------------- |
| `daiso_search_products`            | `search_products`     | daiso       |                  |
| `daiso_jp_search_products`         | `search_products`     | daiso_jp    |                  |
| `gs25_search_products`             | `search_products`     | gs25        |                  |
| `seveneleven_search_products`      | `search_products`     | seveneleven |                  |
| `emart24_search_products`          | `search_products`     | emart24     |                  |
| `oliveyoung_search_products`       | `search_products`     | oliveyoung  |                  |
| `daiso_find_stores`                | `find_stores`         | daiso       |                  |
| `daiso_jp_find_stores`             | `find_stores`         | daiso_jp    |                  |
| `gs25_find_nearby_stores`          | `find_stores`         | gs25        |                  |
| `seveneleven_search_stores`        | `find_stores`         | seveneleven |                  |
| `cu_find_nearby_stores`            | `find_stores`         | cu          |                  |
| `emart24_find_nearby_stores`       | `find_stores`         | emart24     |                  |
| `oliveyoung_find_nearby_stores`    | `find_stores`         | oliveyoung  |                  |
| `daiso_check_inventory`            | `check_inventory`     | daiso       | by_id            |
| `daiso_find_inventory_by_name`     | `check_inventory`     | daiso       | by_name          |
| `gs25_check_inventory`             | `check_inventory`     | gs25        |                  |
| `seveneleven_check_inventory`      | `check_inventory`     | seveneleven |                  |
| `cu_check_inventory`               | `check_inventory`     | cu          |                  |
| `emart24_check_inventory`          | `check_inventory`     | emart24     |                  |
| `oliveyoung_check_inventory`       | `check_inventory`     | oliveyoung  |                  |
| `daiso_get_price_info`             | `get_product_details` | daiso       | price            |
| `daiso_get_display_location`       | `get_product_details` | daiso       | display_location |
| `daiso_jp_get_product`             | `get_product_details` | daiso_jp    | product          |
| `places_search_nearby`             | `find_places`         | places      |                  |
| `megabox_find_nearby_theaters`     | `find_places`         | megabox     |                  |
| `dtryx_list_cinemas`               | `find_places`         | dtryx       |                  |
| `lottecinema_find_nearby_theaters` | `find_places`         | lottecinema |                  |
| `cgv_find_theaters`                | `find_places`         | cgv         |                  |
| `megabox_list_now_showing`         | `get_showtimes`       | megabox     | movies           |
| `megabox_get_remaining_seats`      | `get_showtimes`       | megabox     | seats            |
| `dtryx_list_now_showing`           | `get_showtimes`       | dtryx       | movies           |
| `dtryx_get_remaining_seats`        | `get_showtimes`       | dtryx       | seats            |
| `lottecinema_list_now_showing`     | `get_showtimes`       | lottecinema | movies           |
| `lottecinema_get_remaining_seats`  | `get_showtimes`       | lottecinema | seats            |
| `cgv_search_movies`                | `get_showtimes`       | cgv         | movies           |
| `cgv_get_timetable`                | `get_showtimes`       | cgv         | timetable        |
| `opinet_get_average_prices`        | `get_fuel_info`       |             | average          |
| `opinet_get_lowest_price_stations` | `get_fuel_info`       |             | lowest           |
| `opinet_search_stations_around`    | `get_fuel_info`       |             | around           |
| `opinet_get_station_detail`        | `get_fuel_info`       |             | detail           |
| `seveneleven_get_search_popwords`  | `get_catalog`         |             | popwords         |
| `seveneleven_get_catalog_snapshot` | `get_catalog`         |             | snapshot         |
| `compare_products`                 | `compare_products`    |             |                  |
| `submit_developer_request`         | `submit_request`      |             |                  |

PlayMCP의 등록된 도구 스냅샷은 서버 배포만으로 바로 갱신되지 않을 수 있습니다. 등록 도구를 새 목록으로 갱신한 뒤 실제 대화를 검증하세요.
