/**
 * 프롬프트 핵심 API 섹션
 */

export function buildPromptCoreText(baseUrl: string): string {
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

`;
}
