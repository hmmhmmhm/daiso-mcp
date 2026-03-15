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
        "imageUrl": "https://cdn.daisomall.co.kr/...",
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
    "imageUrl": "https://cdn.daisomall.co.kr/...",
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

**주의**:
- 다이소 재고 조회는 storeCode가 필요하지 않습니다.
- storeCode는 재고 응답의 storeInventory.stores[].storeCode에서 확인한 뒤 진열 위치 조회에 사용합니다.
- 안산 중앙역 같은 역명 키워드가 비면 안산중앙역, 안산중앙, 고잔처럼 붙여쓴 변형으로 재시도하세요.

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
    "product": {
      "id": "1234567890",
      "name": "PP 수납박스 대형",
      "imageUrl": "https://cdn.daisomall.co.kr/...",
      "brand": "다이소",
      "soldOut": false,
      "isNew": false
    },
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

### 4-1. 진열 위치 조회

**설명**: 특정 상품이 특정 매장 내 어디에 진열되어 있는지(구역/층) 조회합니다.

**URL**: ${baseUrl}/api/daiso/display-location?productId={제품ID}&storeCode={매장코드}

**필수 파라미터**:
- productId: 제품 ID (제품 검색 API에서 조회한 id 값)
- storeCode: 매장 코드 (재고 확인 API 결과의 storeCode 값)

**예시**:
- ${baseUrl}/api/daiso/display-location?productId=1234567890&storeCode=04515

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

### 6. 올리브영 상품 검색

**설명**: 키워드로 올리브영 상품 목록을 조회합니다. 사용자가 "올리브영 마스크팩 어떤 거 있나요", "립밤 종류 보여줘"처럼 상품 후보나 종류를 묻는 경우에는 이 API를 먼저 사용하세요.

**표시 규칙**:
- 응답의 \`products[].imageUrl\`이 있으면 각 상품 이미지를 반드시 마크다운 이미지로 함께 렌더링합니다.
- 여러 상품이 나오면 첫 상품만 대표로 보여주지 말고, 이미지가 있는 상품은 전부 표시합니다.

**URL**: ${baseUrl}/api/oliveyoung/products?keyword={검색어}

**필수 파라미터**:
- keyword: 상품 검색어 (예: 마스크팩, 선크림, 립밤)

**선택 파라미터**:
- page: 상품 검색 페이지 (기본값: 1)
- size: 페이지당 상품 수 (기본값: 20)
- sort: 정렬 코드 (기본값: 01)
- includeSoldOut: 품절 포함 여부 (기본값: false)

**예시**:
- ${baseUrl}/api/oliveyoung/products?keyword=마스크팩
- ${baseUrl}/api/oliveyoung/products?keyword=립밤&size=10

---

### 7. 올리브영 재고 확인

**설명**: 상품 키워드 기준 올리브영 재고를 조회하고 주변 매장 목록을 함께 반환합니다. 상위 상품에는 storeInventory가 포함되며 매장별 재고 3개, 재고 9개 이상, 품절, 미판매 같은 상태를 제공합니다.

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

### 6-1. 롯데마트 매장/상품 조회

**설명**: 롯데마트 계열 매장 검색과 특정 매장 기준 상품 가격/재고 조회를 제공합니다.

**URL**:
- ${baseUrl}/api/lottemart/stores?keyword={키워드}
- ${baseUrl}/api/lottemart/products?keyword={검색어}&storeName={매장명}

**선택 파라미터**:
- area: 지역 (예: 서울, 경기, 제주)
- brandVariant: lottemart, toysrus, max, bottlebunker, mealguru, grandgrocery
- lat: 위도 (선택)
- lng: 경도 (선택)
- limit: 최대 결과 수 (기본값: 20)
- storeCode 또는 storeName: 상품 검색 대상 매장
- pageLimit: 추가 조회할 최대 페이지 수 (기본값: 3)

**예시**:
- ${baseUrl}/api/lottemart/stores?keyword=잠실&area=서울&limit=10
- ${baseUrl}/api/lottemart/stores?area=경기&brandVariant=lottemart&limit=10
- ${baseUrl}/api/lottemart/products?keyword=콜라&storeName=강변점&area=서울
- ${baseUrl}/api/lottemart/products?keyword=우유&storeCode=2301&pageLimit=2

---

### 6-2. GS25 매장/상품/재고 조회

**설명**: GS25 매장 탐색, 상품 키워드 검색, 재고 조회를 제공합니다.

**URL**:
- ${baseUrl}/api/gs25/stores?keyword={키워드}
- ${baseUrl}/api/gs25/products?keyword={검색어}
- ${baseUrl}/api/gs25/inventory?keyword={검색어}
- ${baseUrl}/api/gs25/inventory?itemCode={상품코드}

**선택 파라미터(공통)**:
- lat: 위도 (선택)
- lng: 경도 (선택)
- limit / storeLimit: 최대 결과 수
- serviceCode: 서비스 코드 (기본값: 01)

**예시**:
- ${baseUrl}/api/gs25/stores?keyword=강남&limit=10
- ${baseUrl}/api/gs25/products?keyword=오감자&limit=20
- ${baseUrl}/api/gs25/inventory?keyword=오감자&storeKeyword=강남&storeLimit=10
- ${baseUrl}/api/gs25/inventory?itemCode=8801056038861&storeKeyword=안산%20중앙역&storeLimit=10

---

### 6-3. 세븐일레븐 상품/매장/재고/인기검색어/카탈로그 조회

**설명**: 세븐일레븐 상품 검색, 매장 검색, 재고 수량 조회, 인기 검색어, 카탈로그 스냅샷을 제공합니다.

**URL**:
- ${baseUrl}/api/seveneleven/products?query={검색어}
- ${baseUrl}/api/seveneleven/stores?keyword={매장키워드}
- ${baseUrl}/api/seveneleven/inventory?keyword={검색어}
- ${baseUrl}/api/seveneleven/popwords?label={라벨}
- ${baseUrl}/api/seveneleven/catalog?includeIssues={true|false}&includeExhibition={true|false}&limit={개수}

**선택 파라미터**:
- page: 페이지 번호 (기본값: 1)
- size: 페이지당 결과 수 (기본값: 20)
- sort: 정렬 기준 (기본값: recommend)
- storeKeyword: 매장명/지역 키워드
- storeLimit: 최대 매장 수 (기본값: 20)
- timeoutMs: 요청 제한 시간 (기본값: 20000)
- label: 인기 검색어 라벨 (기본값: home)

**예시**:
- ${baseUrl}/api/seveneleven/products?query=삼각김밥&size=20
- ${baseUrl}/api/seveneleven/stores?keyword=안산%20중앙역&limit=10
- ${baseUrl}/api/seveneleven/inventory?keyword=핫식스&storeKeyword=안산%20중앙역&storeLimit=10
- ${baseUrl}/api/seveneleven/popwords?label=home
- ${baseUrl}/api/seveneleven/catalog?includeIssues=true&includeExhibition=true&limit=10

---

### 7. 메가박스 주변 지점 찾기

**설명**: 사용자 좌표 또는 위치 키워드 기준으로 메가박스 지점을 거리순으로 조회합니다.

**URL**: ${baseUrl}/api/megabox/theaters?lat={위도}&lng={경도}

**선택 파라미터**:
- keyword: 위치 키워드 (예: 안산 중앙역, 강남역)
- lat: 위도 (기본값: 37.5665)
- lng: 경도 (기본값: 126.978)
- playDate: 조회 날짜 (YYYYMMDD, 기본값: 오늘)
- areaCode: 지역 코드 (기본값: 11, 서울)
- limit: 최대 결과 수 (기본값: 10)

**예시**:
- ${baseUrl}/api/megabox/theaters?keyword=안산%20중앙역&limit=5
- ${baseUrl}/api/megabox/theaters?lat=37.4982&lng=127.0264
- ${baseUrl}/api/megabox/theaters?areaCode=11&limit=5

---

### 8. 메가박스 영화/회차 목록

**설명**: 날짜/지점 조건으로 메가박스 영화와 상영 회차를 조회합니다. theaterId가 없고 위치 키워드/좌표가 있으면 가장 가까운 지점을 먼저 선택합니다.

**URL**: ${baseUrl}/api/megabox/movies?playDate={YYYYMMDD}

**선택 파라미터**:
- playDate: 조회 날짜 (YYYYMMDD, 기본값: 오늘)
- theaterId: 지점 ID (예: 1372)
- movieId: 영화 ID (예: 25104500)
- keyword: 위치 키워드 (예: 안산 중앙역, 강남역)
- lat: 위도
- lng: 경도
- areaCode: 지역 코드 (기본값: 11)

**예시**:
- ${baseUrl}/api/megabox/movies?playDate=20260315&keyword=안산%20중앙역
- ${baseUrl}/api/megabox/movies?playDate=20260304&theaterId=1372
- ${baseUrl}/api/megabox/movies?playDate=20260304&movieId=25104500

---

### 9. 메가박스 잔여 좌석 조회

**설명**: 영화/지점/날짜 기준으로 회차별 잔여 좌석 수를 조회합니다. theaterId가 없고 위치 키워드/좌표가 있으면 가장 가까운 지점을 먼저 선택합니다.

**URL**: ${baseUrl}/api/megabox/seats?playDate={YYYYMMDD}

**선택 파라미터**:
- playDate: 조회 날짜 (YYYYMMDD, 기본값: 오늘)
- theaterId: 지점 ID
- movieId: 영화 ID
- keyword: 위치 키워드 (예: 안산 중앙역, 강남역)
- lat: 위도
- lng: 경도
- areaCode: 지역 코드 (기본값: 11)
- limit: 최대 결과 수 (기본값: 50)

**예시**:
- ${baseUrl}/api/megabox/seats?playDate=20260315&keyword=안산%20중앙역
- ${baseUrl}/api/megabox/seats?playDate=20260304&theaterId=1372
- ${baseUrl}/api/megabox/seats?playDate=20260304&movieId=25104500&limit=20

---

### 10. CGV 극장 검색

**설명**: 지역 코드 또는 위치 키워드 기준으로 CGV 극장 목록을 조회합니다.

**URL**: ${baseUrl}/api/cgv/theaters?playDate={YYYYMMDD}

**선택 파라미터**:
- playDate: 조회 날짜 (YYYYMMDD, 기본값: 오늘)
- regionCode: 지역 코드 (예: 01)
- keyword: 위치 키워드 (예: 안산 중앙역, 강남역)
- lat: 위도
- lng: 경도
- limit: 최대 결과 수 (기본값: 30)

**예시**:
- ${baseUrl}/api/cgv/theaters?playDate=20260304&regionCode=01
- ${baseUrl}/api/cgv/theaters?playDate=20260315&keyword=안산%20중앙역
- ${baseUrl}/api/cgv/theaters?playDate=20260304&limit=10

---

### 11. CGV 영화 검색

**설명**: 날짜/극장 조건으로 CGV 영화 목록을 조회합니다. theaterCode가 없으면 keyword 또는 lat,lng 기준으로 가장 가까운 극장을 먼저 선택합니다.

**URL**: ${baseUrl}/api/cgv/movies?playDate={YYYYMMDD}

**선택 파라미터**:
- playDate: 조회 날짜 (YYYYMMDD, 기본값: 오늘)
- theaterCode: 극장 코드 (예: 0056)
- keyword: 위치 키워드 (예: 안산 중앙역, 강남역)
- lat: 위도
- lng: 경도

**예시**:
- ${baseUrl}/api/cgv/movies?playDate=20260304&theaterCode=0056
- ${baseUrl}/api/cgv/movies?playDate=20260315&keyword=안산%20중앙역

---

### 12. CGV 시간표 조회

**설명**: 날짜/극장/영화 조건으로 CGV 상영 시간표를 조회합니다. theaterCode가 없으면 keyword 또는 lat,lng 기준으로 가장 가까운 극장을 먼저 선택합니다. 잔여 좌석은 각 회차의 \`remainingSeats\` 필드로 함께 내려옵니다.

**URL**: ${baseUrl}/api/cgv/timetable?playDate={YYYYMMDD}

**선택 파라미터**:
- playDate: 조회 날짜 (YYYYMMDD, 기본값: 오늘)
- theaterCode: 극장 코드 (예: 0056)
- movieCode: 영화 코드
- keyword: 위치 키워드 (예: 안산 중앙역, 강남역)
- lat: 위도
- lng: 경도
- limit: 최대 결과 수 (기본값: 50)

**예시**:
- ${baseUrl}/api/cgv/timetable?playDate=20260304&theaterCode=0056
- ${baseUrl}/api/cgv/timetable?playDate=20260315&keyword=안산%20중앙역
- ${baseUrl}/api/cgv/timetable?playDate=20260304&movieCode=200001

---

### 13. 롯데시네마 주변 지점 찾기

**설명**: 위치 키워드 또는 사용자 좌표 기준으로 롯데시네마 지점을 거리순으로 조회합니다.

**URL**: ${baseUrl}/api/lottecinema/theaters?keyword={위치키워드}

**선택 파라미터**:
- keyword: 위치 키워드 (예: 안산 중앙역, 잠실역)
- lat: 위도 (keyword가 없을 때 기본값: 37.5665)
- lng: 경도 (keyword가 없을 때 기본값: 126.978)
- playDate: 조회 날짜 (YYYYMMDD, 기본값: 오늘)
- limit: 최대 결과 수 (기본값: 10)

**예시**:
- ${baseUrl}/api/lottecinema/theaters?keyword=안산%20중앙역
- ${baseUrl}/api/lottecinema/theaters?lat=37.5133&lng=127.1042

---

### 14. 롯데시네마 영화/회차 목록

**설명**: 날짜/지점/영화 조건으로 롯데시네마 영화와 상영 회차를 조회합니다. theaterId가 없으면 위치 키워드 기준 최근접 지점을 선택할 수 있습니다.

**URL**: ${baseUrl}/api/lottecinema/movies?playDate={YYYYMMDD}

**선택 파라미터**:
- playDate: 조회 날짜 (YYYYMMDD, 기본값: 오늘)
- theaterId: 지점 ID (예: 1016)
- movieId: 대표 영화 코드 (예: 23816)
- keyword: 위치 키워드 (예: 안산 중앙역)
- lat: 위도 (theaterId가 없을 때 사용)
- lng: 경도 (theaterId가 없을 때 사용)

**예시**:
- ${baseUrl}/api/lottecinema/movies?playDate=20260315&keyword=안산%20중앙역
- ${baseUrl}/api/lottecinema/movies?playDate=20260310&theaterId=1016
- ${baseUrl}/api/lottecinema/movies?playDate=20260310&theaterId=1016&movieId=23816

---

### 15. 롯데시네마 잔여 좌석 조회

**설명**: 영화/지점/날짜 기준으로 회차별 잔여 좌석 수를 조회합니다. theaterId가 없으면 위치 키워드 기준 최근접 지점을 선택할 수 있습니다.

**URL**: ${baseUrl}/api/lottecinema/seats?playDate={YYYYMMDD}

**선택 파라미터**:
- playDate: 조회 날짜 (YYYYMMDD, 기본값: 오늘)
- theaterId: 지점 ID
- movieId: 대표 영화 코드
- keyword: 위치 키워드 (예: 안산 중앙역)
- lat: 위도 (theaterId가 없을 때 사용)
- lng: 경도 (theaterId가 없을 때 사용)
- limit: 최대 결과 수 (기본값: 50)

**예시**:
- ${baseUrl}/api/lottecinema/seats?playDate=20260315&keyword=안산%20중앙역
- ${baseUrl}/api/lottecinema/seats?playDate=20260310&theaterId=1016&movieId=23816

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
5. **재고 확인 워크플로우**:
   - 먼저 /api/daiso/products로 제품 검색
   - 결과에서 원하는 제품의 id 확인
   - /api/daiso/inventory에 해당 id로 재고 조회
   - 진열 위치가 필요하면 재고 응답의 storeCode를 확인한 뒤 /api/daiso/display-location에 productId + storeCode로 조회
6. **위치 기반 재고**: lat, lng 파라미터로 가까운 매장 우선 조회
7. **롯데마트 상품 조회**: /api/lottemart/products는 keyword와 함께 storeCode 또는 storeName이 필요합니다.
8. **세븐일레븐 재고 조회**: /api/seveneleven/inventory에 keyword + storeKeyword를 함께 주면 매장별 수량을 바로 확인할 수 있습니다.
9. **이마트24 재고 조회**: /api/emart24/inventory는 pluCd + storeKeyword 조합도 지원하므로, 상품 선택 뒤 매장 코드를 다시 모으지 않아도 됩니다.
10. **올리브영 재고 해석**: inventory.products[].storeInventory.stores[]가 있으면 그 매장별 stockLabel과 remainQuantity를 우선 사용하고, inStock는 그 주변 매장 기준 결과로 해석합니다.
11. **올리브영 상품 이미지 표시**: /api/oliveyoung/products 또는 oliveyoung_search_products 결과에 imageUrl이 있으면 목록형 답변에서도 각 상품 이미지를 생략하지 말고 모두 렌더링합니다.

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
