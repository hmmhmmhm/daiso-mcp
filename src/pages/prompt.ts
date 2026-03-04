/**
 * 프롬프트 페이지
 *
 * MCP 미지원 AI 에이전트를 위한 API 설명 페이지입니다.
 * 에이전트가 이 페이지를 읽고 GET API를 사용할 수 있습니다.
 */

/**
 * 프롬프트 텍스트 생성
 */
export function generatePromptText(baseUrl: string): string {
  return `# 다이소 MCP API

다이소 제품 검색, 매장 찾기, 재고 확인을 위한 API입니다.
모든 요청은 GET 방식이며, 결과는 JSON으로 반환됩니다.

Base URL: ${baseUrl}

---

## 사용 가능한 기능

### 1. 제품 검색

**설명**: 키워드로 다이소 제품을 검색합니다.

**URL**: ${baseUrl}/api/daiso/products?q={검색어}

**필수 파라미터**:
- q: 검색 키워드 (예: 수납박스, 펜, 정리함)

**선택 파라미터**:
- page: 페이지 번호 (기본값: 1)
- pageSize: 페이지당 결과 수 (기본값: 30, 최대: 100)

**예시**:
- ${baseUrl}/api/daiso/products?q=수납박스
- ${baseUrl}/api/daiso/products?q=펜&page=2&pageSize=10

**응답 예시**:
\`\`\`json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "1234567890",
        "name": "PP 수납박스 대형",
        "price": 5000,
        "imageUrl": "https://img.daisomall.co.kr/...",
        "soldOut": false,
        "isNew": false,
        "pickupAvailable": true
      }
    ]
  },
  "meta": { "total": 150, "page": 1, "pageSize": 30 }
}
\`\`\`

---

### 2. 제품 상세 정보

**설명**: 제품 ID로 상세 정보를 조회합니다.

**URL**: ${baseUrl}/api/daiso/products/{제품ID}

**예시**:
- ${baseUrl}/api/daiso/products/1234567890

**응답 예시**:
\`\`\`json
{
  "success": true,
  "data": {
    "id": "1234567890",
    "name": "PP 수납박스 대형",
    "price": 5000,
    "currency": "KRW",
    "imageUrl": "https://img.daisomall.co.kr/...",
    "brand": "다이소",
    "soldOut": false,
    "isNew": false
  }
}
\`\`\`

---

### 3. 매장 찾기

**설명**: 키워드 또는 지역으로 다이소 매장을 검색합니다.

**URL**: ${baseUrl}/api/daiso/stores?keyword={키워드}

**필수 파라미터** (둘 중 하나 필수):
- keyword: 매장명 또는 주소 키워드 (예: 강남, 홍대, 안산)
- sido: 시/도 (예: 서울, 경기, 부산)

**선택 파라미터**:
- gugun: 구/군 (예: 강남구, 마포구)
- dong: 동 (예: 역삼동, 합정동)
- limit: 최대 결과 수 (기본값: 50)

**예시**:
- ${baseUrl}/api/daiso/stores?keyword=강남
- ${baseUrl}/api/daiso/stores?sido=서울&gugun=마포구
- ${baseUrl}/api/daiso/stores?keyword=홍대&limit=10

**응답 예시**:
\`\`\`json
{
  "success": true,
  "data": {
    "stores": [
      {
        "name": "다이소 강남역점",
        "phone": "02-1234-5678",
        "address": "서울특별시 강남구 강남대로 123",
        "lat": 37.4979,
        "lng": 127.0276,
        "openTime": "10:00",
        "closeTime": "22:00",
        "options": {
          "parking": true,
          "pickup": true,
          "taxFree": false
        }
      }
    ]
  },
  "meta": { "total": 5 }
}
\`\`\`

---

### 4. 재고 확인

**설명**: 특정 제품의 매장별 재고와 온라인 재고를 확인합니다.

**URL**: ${baseUrl}/api/daiso/inventory?productId={제품ID}

**필수 파라미터**:
- productId: 제품 ID (제품 검색 API에서 조회한 id 값)

**선택 파라미터**:
- lat: 위도 (기본값: 37.5665, 서울 시청)
- lng: 경도 (기본값: 126.978, 서울 시청)
- keyword: 매장 검색어 (예: 안산, 강남)
- page: 페이지 번호 (기본값: 1)
- pageSize: 페이지당 결과 수 (기본값: 30)

**예시**:
- ${baseUrl}/api/daiso/inventory?productId=1234567890
- ${baseUrl}/api/daiso/inventory?productId=1234567890&lat=37.3219&lng=126.8309
- ${baseUrl}/api/daiso/inventory?productId=1234567890&keyword=안산

**응답 예시**:
\`\`\`json
{
  "success": true,
  "data": {
    "productId": "1234567890",
    "location": { "latitude": 37.5665, "longitude": 126.978 },
    "onlineStock": 150,
    "storeInventory": {
      "totalStores": 25,
      "inStockCount": 18,
      "stores": [
        {
          "storeCode": "ST001",
          "storeName": "다이소 강남역점",
          "address": "서울특별시 강남구...",
          "distance": "0.5km",
          "quantity": 12,
          "options": { "parking": true, "pickup": true }
        }
      ]
    }
  },
  "meta": { "total": 25, "page": 1, "pageSize": 30 }
}
\`\`\`

---

### 5. 올리브영 매장 찾기

**설명**: 위치 기반으로 주변 올리브영 매장을 검색합니다.

**URL**: ${baseUrl}/api/oliveyoung/stores?keyword={키워드}

**선택 파라미터**:
- keyword: 매장명/지역 키워드 (예: 명동, 강남)
- lat: 위도 (기본값: 37.5665)
- lng: 경도 (기본값: 126.978)
- pageIdx: 페이지 번호 (기본값: 1)
- limit: 최대 결과 수 (기본값: 20)

**예시**:
- ${baseUrl}/api/oliveyoung/stores?keyword=명동
- ${baseUrl}/api/oliveyoung/stores?lat=37.498&lng=127.027&limit=5

---

### 6. 올리브영 재고 확인

**설명**: 상품 키워드 기준 올리브영 재고를 조회하고 주변 매장 목록을 함께 반환합니다.

**URL**: ${baseUrl}/api/oliveyoung/inventory?keyword={검색어}

**필수 파라미터**:
- keyword: 상품 검색어 (예: 선크림, 립밤)

**선택 파라미터**:
- lat: 위도 (기본값: 37.5665)
- lng: 경도 (기본값: 126.978)
- storeKeyword: 매장 필터 키워드
- page: 상품 검색 페이지 (기본값: 1)
- size: 페이지당 결과 수 (기본값: 20)
- includeSoldOut: 품절 포함 여부 (기본값: false)

**예시**:
- ${baseUrl}/api/oliveyoung/inventory?keyword=선크림
- ${baseUrl}/api/oliveyoung/inventory?keyword=립밤&storeKeyword=명동

---

### 7. 메가박스 주변 지점 찾기

**설명**: 사용자 좌표 기준으로 메가박스 지점을 거리순으로 조회합니다.

**URL**: ${baseUrl}/api/megabox/theaters?lat={위도}&lng={경도}

**선택 파라미터**:
- lat: 위도 (기본값: 37.5665)
- lng: 경도 (기본값: 126.978)
- playDate: 조회 날짜 (YYYYMMDD, 기본값: 오늘)
- areaCode: 지역 코드 (기본값: 11, 서울)
- limit: 최대 결과 수 (기본값: 10)

**예시**:
- ${baseUrl}/api/megabox/theaters?lat=37.4982&lng=127.0264
- ${baseUrl}/api/megabox/theaters?areaCode=11&limit=5

---

### 8. 메가박스 영화/회차 목록

**설명**: 날짜/지점 조건으로 메가박스 영화와 상영 회차를 조회합니다.

**URL**: ${baseUrl}/api/megabox/movies?playDate={YYYYMMDD}

**선택 파라미터**:
- playDate: 조회 날짜 (YYYYMMDD, 기본값: 오늘)
- theaterId: 지점 ID (예: 1372)
- movieId: 영화 ID (예: 25104500)
- areaCode: 지역 코드 (기본값: 11)

**예시**:
- ${baseUrl}/api/megabox/movies?playDate=20260304&theaterId=1372
- ${baseUrl}/api/megabox/movies?playDate=20260304&movieId=25104500

---

### 9. 메가박스 잔여 좌석 조회

**설명**: 영화/지점/날짜 기준으로 회차별 잔여 좌석 수를 조회합니다.

**URL**: ${baseUrl}/api/megabox/seats?playDate={YYYYMMDD}

**선택 파라미터**:
- playDate: 조회 날짜 (YYYYMMDD, 기본값: 오늘)
- theaterId: 지점 ID
- movieId: 영화 ID
- areaCode: 지역 코드 (기본값: 11)
- limit: 최대 결과 수 (기본값: 50)

**예시**:
- ${baseUrl}/api/megabox/seats?playDate=20260304&theaterId=1372
- ${baseUrl}/api/megabox/seats?playDate=20260304&movieId=25104500&limit=20

---

### 10. CGV 극장 검색

**설명**: 지역 코드 기준으로 CGV 극장 목록을 조회합니다.

**URL**: ${baseUrl}/api/cgv/theaters?playDate={YYYYMMDD}

**선택 파라미터**:
- playDate: 조회 날짜 (YYYYMMDD, 기본값: 오늘)
- regionCode: 지역 코드 (예: 01)
- limit: 최대 결과 수 (기본값: 30)

**예시**:
- ${baseUrl}/api/cgv/theaters?playDate=20260304&regionCode=01
- ${baseUrl}/api/cgv/theaters?playDate=20260304&limit=10

---

### 11. CGV 영화 검색

**설명**: 날짜/극장 조건으로 CGV 영화 목록을 조회합니다.

**URL**: ${baseUrl}/api/cgv/movies?playDate={YYYYMMDD}

**선택 파라미터**:
- playDate: 조회 날짜 (YYYYMMDD, 기본값: 오늘)
- theaterCode: 극장 코드 (예: 0056)

**예시**:
- ${baseUrl}/api/cgv/movies?playDate=20260304&theaterCode=0056

---

### 12. CGV 시간표 조회

**설명**: 날짜/극장/영화 조건으로 CGV 상영 시간표를 조회합니다.

**URL**: ${baseUrl}/api/cgv/timetable?playDate={YYYYMMDD}

**선택 파라미터**:
- playDate: 조회 날짜 (YYYYMMDD, 기본값: 오늘)
- theaterCode: 극장 코드 (예: 0056)
- movieCode: 영화 코드
- limit: 최대 결과 수 (기본값: 50)

**예시**:
- ${baseUrl}/api/cgv/timetable?playDate=20260304&theaterCode=0056
- ${baseUrl}/api/cgv/timetable?playDate=20260304&movieCode=200001

---

## 응답 형식

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
| NOT_FOUND | 결과를 찾을 수 없음 |
| SEARCH_FAILED | 검색 실패 |
| FETCH_FAILED | 데이터 조회 실패 |
| OLIVEYOUNG_STORE_SEARCH_FAILED | 올리브영 매장 조회 실패 |
| OLIVEYOUNG_INVENTORY_CHECK_FAILED | 올리브영 재고 조회 실패 |
| MEGABOX_THEATER_SEARCH_FAILED | 메가박스 지점 조회 실패 |
| MEGABOX_MOVIE_LIST_FAILED | 메가박스 영화 목록 조회 실패 |
| MEGABOX_SEAT_LIST_FAILED | 메가박스 좌석 조회 실패 |
| CGV_THEATER_SEARCH_FAILED | CGV 극장 조회 실패 |
| CGV_MOVIE_SEARCH_FAILED | CGV 영화 목록 조회 실패 |
| CGV_TIMETABLE_FETCH_FAILED | CGV 시간표 조회 실패 |

---

## 사용 팁

1. **한글 검색어**: URL 인코딩이 자동으로 처리됩니다
2. **페이지네이션**: 결과가 많을 경우 page 파라미터 사용
3. **재고 확인 워크플로우**:
   - 먼저 /api/daiso/products로 제품 검색
   - 결과에서 원하는 제품의 id 확인
   - /api/daiso/inventory에 해당 id로 재고 조회
4. **위치 기반 재고**: lat, lng 파라미터로 가까운 매장 우선 조회

---

## MCP 지원 서비스

MCP를 지원하는 AI 에이전트(Claude 등)는 더 풍부한 기능을 사용할 수 있습니다.
MCP 연결 정보: ${baseUrl}/mcp

지원 도구:
- daiso_search_products: 제품 검색
- daiso_find_stores: 매장 검색
- daiso_check_inventory: 재고 확인
- daiso_get_price_info: 가격 정보 조회
- oliveyoung_find_nearby_stores: 올리브영 주변 매장 탐색
- oliveyoung_check_inventory: 올리브영 재고 파악
- megabox_find_nearby_theaters: 메가박스 주변 지점 탐색
- megabox_list_now_showing: 메가박스 영화 목록 조회
- megabox_get_remaining_seats: 메가박스 잔여 좌석 조회
- cgv_find_theaters: CGV 극장 검색
- cgv_search_movies: CGV 영화 검색
- cgv_get_timetable: CGV 시간표 조회
`;
}

/**
 * 프롬프트 페이지 응답 생성
 */
export function createPromptResponse(baseUrl: string): Response {
  const text = generatePromptText(baseUrl);

  return new Response(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
