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

상품 검색: `search_products {"service":"daiso","query":"수납박스","pageSize":3}`

재고: `check_inventory {"service":"gs25","keyword":"오감자","storeKeyword":"강남"}`

상품명으로 다이소 재고: `check_inventory {"service":"daiso","operation":"by_name","query":"수납박스","storeQuery":"강남"}`

일본 상세: `get_product_details {"service":"daiso_jp","operation":"product","id":"4550746075917"}`. 일본 매장별 재고는 지원하지 않습니다.

요청 제출: `submit_request {"requestType":"developer","request":{"title":"문서 개선","description":"개선할 내용을 적습니다","type":"docs"}}`. 현재 개발자 요청 저장만 지원합니다. 다른 요청 유형은 거절하며 요청자의 의도 없이 제출하지 않습니다. 이 도구의 이름과 요청 구분은 미래 유형 확장을 위해 범용으로 유지합니다.

매개변수는 기존 작업의 이름과 형식을 사용합니다. operation은 같은 서비스에 작업이 여러 개인 경우 필수입니다. 예를 들어 CGV 시간표는 service=cgv, operation=timetable, playDate=YYYYMMDD이며 seats 작업은 지원하지 않습니다. 미지원 조합, 다른 서비스 전용 인수와 오타는 조회 전에 거절합니다. 기본값은 선택한 작업의 기본값만 적용합니다. tools/list의 입력/출력 스키마를 참고하세요.

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
