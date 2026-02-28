# 다이소 매장 검색 API 분석 결과

## 분석 일시
2026-02-28

## 결론: 리플레이 가능 ✅

**쿠키 및 특별한 헤더 없이 API 호출이 가능합니다.**

---

## 발견된 API 엔드포인트

### 1. 매장 검색 (키워드)

```
GET /cs/ajax/shop_search?name_address={검색어}&sido=&gugun=&dong=
```

**요청 예시:**
```bash
curl 'https://www.daiso.co.kr/cs/ajax/shop_search?name_address=%EA%B0%95%EB%82%A8&sido=&gugun=&dong='
```

**응답 형식:** HTML
- 전체 HTML 페이지 반환
- 매장 데이터는 HTML 내 `div.bx-store` 요소에 포함
- 파싱 필요

**매장 데이터 구조 (HTML data 속성):**
```html
<div class="bx-store"
     data-start="1000"
     data-end="2200"
     data-lat="37.5171892352971"
     data-lng="127.04130142966"
     data-info='{"shp_pak":"N","entrramp":"N","elvtor":"N",...}'
     data-opnday="20160423">
  <h4 class="place">강남구청역점</h4>
  <em class="phone">T.1522-4400</em>
  <p class="addr">서울특별시 강남구 학동로 지하 346 (삼성동) B1층</p>
</div>
```

---

### 2. 시/도 → 구/군 목록 조회

```
GET /cs/ajax/sido_search?sido={시도명}
```

**요청 예시:**
```bash
curl 'https://www.daiso.co.kr/cs/ajax/sido_search?sido=%EC%84%9C%EC%9A%B8'
```

**응답 형식:** JSON
```json
[
  {"value":"동대문구"},
  {"value":"강남구"},
  {"value":"중랑구"},
  {"value":"은평구"},
  ...
]
```

---

### 3. 구/군 → 동 목록 조회

```
GET /cs/ajax/gugun_search?sido={시도명}&gugun={구군명}
```

**요청 예시:**
```bash
curl 'https://www.daiso.co.kr/cs/ajax/gugun_search?sido=%EC%84%9C%EC%9A%B8&gugun=%EA%B0%95%EB%82%A8%EA%B5%AC'
```

**응답 형식:** JSON
```json
[
  {"value":"일원동"},
  {"value":"도곡동"},
  {"value":"논현동"},
  {"value":"역삼동"},
  ...
]
```

---

### 4. 지역으로 매장 검색

```
GET /cs/ajax/shop_search?name_address=&sido={시도}&gugun={구군}&dong={동}
```

**요청 예시:**
```bash
curl 'https://www.daiso.co.kr/cs/ajax/shop_search?name_address=&sido=%EC%84%9C%EC%9A%B8&gugun=%EA%B0%95%EB%82%A8%EA%B5%AC&dong='
```

**응답 형식:** HTML (키워드 검색과 동일)

---

## 시/도 코드 목록

| 코드 | 지역명 |
|------|--------|
| 서울 | 서울특별시 |
| 경기 | 경기도 |
| 인천 | 인천광역시 |
| 강원 | 강원도 |
| 광주 | 광주광역시 |
| 대전 | 대전광역시 |
| 울산 | 울산광역시 |
| 세종 | 세종특별자치시 |
| 충북 | 충청북도 |
| 충남 | 충청남도 |
| 전북 | 전라북도 |
| 전남 | 전라남도 |
| 경북 | 경상북도 |
| 경남 | 경상남도 |
| 대구 | 대구광역시 |
| 부산 | 부산광역시 |
| 제주 | 제주특별자치도 |

---

## 매장 옵션 필터 파라미터

| 파라미터 | 설명 |
|----------|------|
| shp_pak | 주차 가능 |
| entrramp | 출입구 경사로 |
| elvtor | 엘리베이터 |
| ptcard | 현금없는매장 |
| ptstk | 포토 스티커 |
| nmstk | 네임 스티커 |
| usim_yn | 심카드 |
| tax_free | 택스리펀드 |
| group_yn | 단체주문 |
| online_yn | 매장픽업 |

---

## 인증 요구사항

| 항목 | 필요 여부 |
|------|-----------|
| 세션 쿠키 | ❌ 불필요 |
| X-Requested-With 헤더 | ❌ 불필요 |
| Referer 헤더 | ❌ 불필요 |
| CSRF 토큰 | ❌ 불필요 |

---

## 구현 권장사항

### Cloudflare Workers 구현 가능 ✅

1. **HTTP 클라이언트만으로 충분**
   - Puppeteer/Playwright 불필요
   - fetch API로 직접 호출 가능

2. **HTML 파싱 필요**
   - 매장 검색 응답은 HTML
   - cheerio 또는 정규식으로 파싱 권장

3. **JSON API 활용**
   - 시/도, 구/군 목록은 JSON
   - 직접 파싱 가능

### 구현 예시

```typescript
// 매장 검색
async function searchStores(query: string): Promise<Store[]> {
  const url = `https://www.daiso.co.kr/cs/ajax/shop_search?name_address=${encodeURIComponent(query)}&sido=&gugun=&dong=`;
  const response = await fetch(url);
  const html = await response.text();
  return parseStoresFromHtml(html);
}

// 시/도 → 구/군 목록
async function getDistricts(sido: string): Promise<string[]> {
  const url = `https://www.daiso.co.kr/cs/ajax/sido_search?sido=${encodeURIComponent(sido)}`;
  const response = await fetch(url);
  const data = await response.json();
  return data.map((item: {value: string}) => item.value);
}

// 구/군 → 동 목록
async function getNeighborhoods(sido: string, gugun: string): Promise<string[]> {
  const url = `https://www.daiso.co.kr/cs/ajax/gugun_search?sido=${encodeURIComponent(sido)}&gugun=${encodeURIComponent(gugun)}`;
  const response = await fetch(url);
  const data = await response.json();
  return data.map((item: {value: string}) => item.value);
}
```

---

## 매장 데이터 파싱 예시

```typescript
interface Store {
  name: string;
  phone: string;
  address: string;
  lat: number;
  lng: number;
  openTime: string;
  closeTime: string;
  options: {
    parking: boolean;
    ramp: boolean;
    elevator: boolean;
    cashless: boolean;
    photoSticker: boolean;
    nameSticker: boolean;
    simCard: boolean;
    taxFree: boolean;
    groupOrder: boolean;
    pickup: boolean;
  };
}

function parseStoresFromHtml(html: string): Store[] {
  const stores: Store[] = [];
  const regex = /<div class="bx-store"[^>]*data-start="(\d+)"[^>]*data-end="(\d+)"[^>]*data-lat="([^"]+)"[^>]*data-lng="([^"]+)"[^>]*data-info="([^"]+)"[^>]*>[\s\S]*?<h4 class="place">([^<]+)<\/h4>[\s\S]*?<em class="phone">([^<]*)<\/em>[\s\S]*?<p class="addr">([^<]+)<\/p>/g;

  let match;
  while ((match = regex.exec(html)) !== null) {
    const info = JSON.parse(match[5].replace(/&quot;/g, '"'));
    stores.push({
      name: match[6],
      phone: match[7].replace('T.', '').trim(),
      address: match[8],
      lat: parseFloat(match[3]),
      lng: parseFloat(match[4]),
      openTime: match[1],
      closeTime: match[2],
      options: {
        parking: info.shp_pak === 'Y',
        ramp: info.entrramp === 'Y',
        elevator: info.elvtor === 'Y',
        cashless: info.ptcard === 'Y',
        photoSticker: info.ptstk === 'Y',
        nameSticker: info.nmstk === 'Y',
        simCard: info.usim_yn === 'Y',
        taxFree: info.tax_free === 'Y',
        groupOrder: info['ext.group_yn'] === 'Y',
        pickup: info.online_yn === 'Y',
      }
    });
  }

  return stores;
}
```

---

## 테스트 결과 요약

| 테스트 | 결과 |
|--------|------|
| 쿠키 없이 매장 검색 | ✅ 성공 |
| 헤더 없이 매장 검색 | ✅ 성공 |
| 쿠키 없이 시/도 API | ✅ 성공 |
| 쿠키 없이 구/군 API | ✅ 성공 |
| curl로 리플레이 | ✅ 성공 |

---

## 다이소몰 재고 조회 API (mapi.daisomall.co.kr)

### 1. 상품 검색

```
GET https://prdm.daisomall.co.kr/ssn/search/FindStoreGoods?searchTerm={검색어}&cntPerPage=30&pageNum=1
```

**요청 예시:**
```bash
curl 'https://prdm.daisomall.co.kr/ssn/search/FindStoreGoods?searchTerm=%EB%AC%BC%ED%8B%B0%EC%8A%88&cntPerPage=30&pageNum=1'
```

**응답 형식:** JSON
```json
{
  "resultSet": {
    "result": [{
      "totalSize": 250,
      "resultDocuments": [
        {"PD_NO": "1068725", "PD_NM": "픽사_토이스토리_빅사이즈물티슈80매", ...}
      ]
    }]
  }
}
```

---

### 2. 온라인 재고 조회

```
POST https://mapi.daisomall.co.kr/ms/msg/selOnlStck
Content-Type: application/json
```

**요청 Body:**
```json
{"pdNo": "1068725"}
```

**요청 예시:**
```bash
curl 'https://mapi.daisomall.co.kr/ms/msg/selOnlStck' \
  -H 'Content-Type: application/json' \
  -d '{"pdNo":"1068725"}'
```

**응답 형식:** JSON
```json
{
  "data": {
    "pdNo": "1068725",
    "stck": 17
  },
  "success": true
}
```

---

### 3. 매장별 재고 조회 (위치 기반)

```
POST https://mapi.daisomall.co.kr/ms/msg/newIntSelStr
Content-Type: application/json
```

**요청 Body:**
```json
{
  "keyword": "",
  "pdNo": "1068725",
  "curLttd": 37.5665,      // 위도
  "curLitd": 126.978,      // 경도
  "geolocationAgrYn": "Y",
  "pkupYn": "",
  "intCd": "",
  "pageSize": 30,
  "currentPage": 1
}
```

**요청 예시:**
```bash
curl 'https://mapi.daisomall.co.kr/ms/msg/newIntSelStr' \
  -H 'Content-Type: application/json' \
  -d '{"keyword":"","pdNo":"1068725","curLttd":37.5665,"curLitd":126.978,"geolocationAgrYn":"Y","pkupYn":"","intCd":"","pageSize":30,"currentPage":1}'
```

**응답 형식:** JSON
```json
{
  "data": {
    "msStrVOList": [
      {
        "strCd": "10856",
        "strNm": "서울시청광장점",
        "strAddr": "서울특별시 중구 세종대로 93",
        "strTno": "1522-4400",
        "opngTime": "10:00",
        "clsngTime": "22:00",
        "strLttd": 37.5647,
        "strLitd": 126.9766,
        "km": "0.2",
        "qty": "1",
        "parkYn": "N",
        "usimYn": "Y",
        "pkupYn": "N",
        "taxfYn": "Y"
      }
    ],
    "intStrCont": 33
  },
  "success": true
}
```

---

### 매장 재고 응답 필드

| 필드 | 설명 |
|------|------|
| strCd | 매장 코드 |
| strNm | 매장명 |
| strAddr | 주소 |
| strTno | 전화번호 |
| opngTime | 오픈 시간 |
| clsngTime | 마감 시간 |
| strLttd | 위도 |
| strLitd | 경도 |
| km | 거리 (km) |
| **qty** | **재고 수량** |
| parkYn | 주차 가능 |
| usimYn | 심카드 |
| pkupYn | 매장픽업 |
| taxfYn | 택스리펀드 |
| elvtYn | 엘리베이터 |
| entrRampYn | 경사로 |
| nocashYn | 현금없는매장 |

---

### 다이소몰 API 인증 요구사항

| 항목 | 필요 여부 |
|------|-----------|
| 세션 쿠키 | ❌ 불필요 |
| Authorization 헤더 | ❌ 불필요 |
| Content-Type | ✅ application/json |

---

### 재고 조회 구현 예시

```typescript
interface StoreInventory {
  storeCode: string;
  storeName: string;
  address: string;
  phone: string;
  openTime: string;
  closeTime: string;
  lat: number;
  lng: number;
  distance: string;
  quantity: number;
  options: {
    parking: boolean;
    simCard: boolean;
    pickup: boolean;
    taxFree: boolean;
  };
}

// 온라인 재고 조회
async function getOnlineStock(productNo: string): Promise<number> {
  const response = await fetch('https://mapi.daisomall.co.kr/ms/msg/selOnlStck', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pdNo: productNo })
  });
  const data = await response.json();
  return data.data?.stck || 0;
}

// 매장별 재고 조회
async function getStoreInventory(
  productNo: string,
  lat: number,
  lng: number
): Promise<StoreInventory[]> {
  const response = await fetch('https://mapi.daisomall.co.kr/ms/msg/newIntSelStr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      keyword: '',
      pdNo: productNo,
      curLttd: lat,
      curLitd: lng,
      geolocationAgrYn: 'Y',
      pkupYn: '',
      intCd: '',
      pageSize: 30,
      currentPage: 1
    })
  });

  const data = await response.json();
  return data.data?.msStrVOList?.map((store: any) => ({
    storeCode: store.strCd,
    storeName: store.strNm,
    address: store.strAddr,
    phone: store.strTno,
    openTime: store.opngTime,
    closeTime: store.clsngTime,
    lat: store.strLttd,
    lng: store.strLitd,
    distance: store.km,
    quantity: parseInt(store.qty) || 0,
    options: {
      parking: store.parkYn === 'Y',
      simCard: store.usimYn === 'Y',
      pickup: store.pkupYn === 'Y',
      taxFree: store.taxfYn === 'Y'
    }
  })) || [];
}
```

---

## 테스트 결과 요약

| 테스트 | 결과 |
|--------|------|
| 쿠키 없이 매장 검색 | ✅ 성공 |
| 헤더 없이 매장 검색 | ✅ 성공 |
| 쿠키 없이 시/도 API | ✅ 성공 |
| 쿠키 없이 구/군 API | ✅ 성공 |
| curl로 리플레이 | ✅ 성공 |
| 온라인 재고 조회 | ✅ 성공 |
| 매장별 재고 조회 | ✅ 성공 |

---

## 다음 단계

1. ✅ 매장 검색 API 분석 완료
2. ✅ 재고 조회 API 분석 완료
3. ⏳ HTML 파싱 유틸리티 구현
4. ⏳ MCP 도구 통합
5. ⏳ 테스트 작성
