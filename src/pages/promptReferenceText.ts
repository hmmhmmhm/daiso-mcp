/**
 * 프롬프트 응답/사용 팁 섹션
 */

export function buildPromptReferenceText(baseUrl: string): string {
  return `## 응답 형식

### 성공 응답
\`\`\`json
{
  "success": true,
  "data": { ... },
  "meta": {
    "total": 100,
    "page": 1,
    "pageSize": 30
  }
}
\`\`\`

### 에러 응답
\`\`\`json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "에러 메시지"
  }
}
\`\`\`

### 에러 코드
| 코드 | 설명 |
|------|------|
| MISSING_QUERY | 검색어가 누락됨 |
| MISSING_PARAMS | 필수 파라미터 누락 |
| MISSING_PRODUCT_ID | 제품 ID 누락 |
| MISSING_STORE_CODE | 매장 코드 누락 |
| NOT_FOUND | 결과를 찾을 수 없음 |
| SEARCH_FAILED | 검색 실패 |
| FETCH_FAILED | 데이터 조회 실패 |
| DISPLAY_LOCATION_FAILED | 진열 위치 조회 실패 |
| OLIVEYOUNG_STORE_SEARCH_FAILED | 올리브영 매장 조회 실패 |
| OLIVEYOUNG_PRODUCT_SEARCH_FAILED | 올리브영 상품 조회 실패 |
| OLIVEYOUNG_INVENTORY_CHECK_FAILED | 올리브영 재고 조회 실패 |
| MEGABOX_THEATER_SEARCH_FAILED | 메가박스 지점 조회 실패 |
| MEGABOX_MOVIE_LIST_FAILED | 메가박스 영화 목록 조회 실패 |
| MEGABOX_SEAT_LIST_FAILED | 메가박스 좌석 조회 실패 |
| LOTTECINEMA_THEATER_SEARCH_FAILED | 롯데시네마 지점 조회 실패 |
| LOTTECINEMA_MOVIE_LIST_FAILED | 롯데시네마 영화 목록 조회 실패 |
| LOTTECINEMA_SEAT_LIST_FAILED | 롯데시네마 좌석 조회 실패 |
| CGV_THEATER_SEARCH_FAILED | CGV 극장 조회 실패 |
| CGV_MOVIE_SEARCH_FAILED | CGV 영화 목록 조회 실패 |
| CGV_TIMETABLE_FETCH_FAILED | CGV 시간표 조회 실패 |
| GS25_STORE_SEARCH_FAILED | GS25 매장 조회 실패 |
| GS25_PRODUCT_SEARCH_FAILED | GS25 상품 조회 실패 |
| GS25_INVENTORY_CHECK_FAILED | GS25 재고 조회 실패 |
| LOTTEMART_STORE_SEARCH_FAILED | 롯데마트 매장 조회 실패 |
| LOTTEMART_PRODUCT_SEARCH_FAILED | 롯데마트 상품 조회 실패 |
| SEVENELEVEN_INVENTORY_CHECK_FAILED | 세븐일레븐 재고 조회 실패 |

---

## 사용 팁

1. **한글 검색어**: URL 인코딩이 자동으로 처리됩니다
2. **페이지네이션**: 결과가 많을 경우 page 파라미터 사용
3. **브랜드 고정**: 사용자가 "다이소에서", "GS25에서"처럼 브랜드를 명시하면 품목상 어색해 보여도 먼저 그 브랜드에서 실제 검색/조회하고, 결과가 없을 때만 다른 브랜드 대안을 짧게 제안합니다.
   - 금지: "핫식스는 다이소가 아니라 편의점 상품이라서 조회할 수 없습니다"처럼 사전 판단으로 검색을 거부
   - 원칙: 브랜드가 명시되면 일단 해당 브랜드에서 실제 조회 후, 결과가 없을 때만 다른 브랜드 제안
   - 확장 해석: "안산 중앙역 주변 다이소 찾아주시고 핫식스 재고 찾아주세요"처럼 브랜드가 앞부분에만 나와도 뒤 요청 전체를 다이소 기준으로 처리
4. **이미지 적극 표시**:
   - **규칙 1**: MCP/REST 응답에 \`imageUrl\`이 있으면 반드시 마크다운 이미지로 렌더링하세요.
   - **규칙 2**: 사용자가 따로 요청하기 전까지 이미지를 임의로 생략하지 마세요.
   - **규칙 3**: 이미지가 여러 개이면 첫 번째만 대표로 보여주지 말고 각 항목의 이미지를 전부 표시하세요.
   - **규칙 4**: "길어서 일부만 표시", "대표 이미지만 표시", "나머지는 생략" 같은 동작을 하지 마세요.
   - **규칙 5**: 텍스트 요약보다 이미지 표시 의무가 우선이며, 이미지가 있으면 답변 길이 때문에라도 빼지 마세요.
   - **규칙 6**: \`imageUrl\`에 query string이 있으면 \`?l=ko\` 같은 쿼리를 절대 삭제하거나 정규화하지 말고, 마크다운 이미지 src에 전체 URL을 그대로 사용하세요.
   - **규칙 7**: 이미지 src를 비교하거나 캐시 키를 판단할 때도 hostname + pathname만 쓰지 말고 query string까지 포함한 전체 URL을 기준으로 취급하세요.
5. **재고 확인 워크플로우**:
   - 먼저 /api/daiso/products로 제품 검색
   - 결과에서 원하는 제품의 id 확인
   - /api/daiso/inventory에 해당 id로 재고 조회
   - 진열 위치가 필요하면 재고 응답의 storeCode를 확인한 뒤 /api/daiso/display-location에 productId + storeCode로 조회
6. **상품명 단계 검색**:
   - 재고 검색은 어떤 서비스이든 검색어 전체를 먼저 그대로 조회하고, 실패할 때만 공백/브랜드어 제거, 표기 변형, 더 짧은 핵심어 순으로 단계적으로 넓혀서 다시 시도합니다.
   - 너무 넓은 축약어로만 매칭된 경우에는 확정 상품처럼 단정하지 말고, 추정 매칭임을 짧게 밝힌 뒤 재고를 안내합니다.
   - 위치/브랜드/상품명은 한 인자에 섞지 말고 가능한 한 분리해서 도구에 전달합니다.
7. **위치 기반 재고**: lat, lng 파라미터로 가까운 매장 우선 조회
8. **롯데마트 상품 조회**: /api/lottemart/products는 keyword와 함께 storeCode 또는 storeName이 필요합니다.
9. **세븐일레븐 재고 조회**: /api/seveneleven/inventory에 keyword + storeKeyword를 함께 주면 매장별 수량을 바로 확인할 수 있습니다.
10. **이마트24 재고 조회**: /api/emart24/inventory는 pluCd + storeKeyword 조합도 지원하므로, 상품 선택 뒤 매장 코드를 다시 모으지 않아도 됩니다.
11. **올리브영 재고 해석**: inventory.products[].storeInventory.stores[]가 있으면 그 매장별 stockLabel과 remainQuantity를 우선 사용하고, inStock는 그 주변 매장 기준 결과로 해석합니다.
12. **올리브영 상품 이미지 표시**: /api/oliveyoung/products 또는 oliveyoung_search_products 결과에 imageUrl이 있으면 목록형 답변에서도 각 상품 이미지를 생략하지 말고 모두 렌더링합니다. 특히 \`?l=ko\` 같은 query string을 삭제하지 말고 전체 URL 그대로 마크다운 이미지 src에 넣습니다.

---

## MCP 지원 서비스

MCP를 지원하는 AI 에이전트(Claude 등)는 더 풍부한 기능을 사용할 수 있습니다.
MCP 연결 정보: ${baseUrl}/mcp

지원 도구:
- daiso_search_products: 제품 검색
- daiso_find_stores: 매장 검색
- daiso_check_inventory: 재고 확인
- daiso_get_price_info: 가격 정보 조회
- daiso_get_display_location: 진열 위치 조회
- lottemart_find_nearby_stores: 롯데마트 주변 매장 탐색
- lottemart_search_products: 롯데마트 상품 검색
- gs25_find_nearby_stores: GS25 주변 매장 탐색
- gs25_search_products: GS25 상품 검색
- gs25_check_inventory: GS25 재고 조회
- seveneleven_search_products: 세븐일레븐 상품 검색
- seveneleven_search_stores: 세븐일레븐 매장 검색
- seveneleven_check_inventory: 세븐일레븐 재고 조회
- seveneleven_get_search_popwords: 세븐일레븐 인기 검색어 조회
- seveneleven_get_catalog_snapshot: 세븐일레븐 카탈로그 조회
- oliveyoung_search_products: 올리브영 상품 검색
- oliveyoung_find_nearby_stores: 올리브영 주변 매장 탐색
- oliveyoung_check_inventory: 올리브영 재고 파악
- megabox_find_nearby_theaters: 메가박스 주변 지점 탐색
- megabox_list_now_showing: 메가박스 영화 목록 조회
- megabox_get_remaining_seats: 메가박스 잔여 좌석 조회
- lottecinema_find_nearby_theaters: 롯데시네마 주변 지점 탐색
- lottecinema_list_now_showing: 롯데시네마 영화 목록 조회
- lottecinema_get_remaining_seats: 롯데시네마 잔여 좌석 조회
- cgv_find_theaters: CGV 극장 검색
- cgv_search_movies: CGV 영화 검색
- cgv_get_timetable: CGV 시간표 조회
`;
}
