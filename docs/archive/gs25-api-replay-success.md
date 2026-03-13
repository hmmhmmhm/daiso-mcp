# GS25 API 리플레이 성공 기록

작성일: 2026-03-13

## 요약

blutter 정적 분석 + Frida 런타임 후킹을 통해 GS25 우리동네GS 앱의 재고 조회 API 리플레이에 성공했습니다.

## 확보된 인증 정보

### JWT 토큰 구조

```
Header: {"alg":"HS256"}
Payload: {
  "access-key": "<REDACTED_ACCESS_KEY>",
  "iat": 1773402459,
  "exp": 1773488859
}
```

- JWT는 약 24시간 유효
- `access-key`는 암호화된 인증 키

### 디바이스 ID

```
<REDACTED_DEVICE_ID>
```

- UUID 형식
- 앱 설치 시 생성되는 것으로 추정

## 확인된 API 엔드포인트

### Base URL

```
https://b2c-bff.woodongs.com
```

### 재고 조회 API (확인됨 ✅)

```
GET /api/bff/v2/store/stock
```

**요청 헤더:**

```
Authorization: Bearer {JWT}
x-device-id: {device-id}
Content-Type: application/json
```

**쿼리 파라미터:**
| 파라미터 | 설명 | 예시 |
|---------|------|------|
| serviceCode | 서비스 코드 (01=GS25) | "01" |
| storeCode | 매장 코드 | "VE463" |
| pageNumber | 페이지 번호 | 0 |
| pageCount | 페이지당 항목 수 | 100 |

**응답 예시:**

```json
{
  "stores": [{
    "storeCode": "VY814",
    "storeName": "백령북포점",
    "storeAddress": "인천 옹진군 백령면 당후길 7",
    "storeXCoordination": "124.66430616954244",
    "storeYCoordination": "37.96076745609878",
    "realStockQuantity": "0",
    "pointOfSaleYn": "Y",
    "exchangePossibleYn": "N",
    "wishStoreYn": "N",
    "propertyList": [
      {"storePropertyName": "반값택배픽업"},
      {"storePropertyName": "와인25플러스"},
      ...
    ]
  }]
}
```

### 기타 발견된 API 경로 (blutter 분석 기반)

```
/api/bff/v1/ads/banners/stockSearch    # 재고검색 배너
/api/bff/v1/ads/banners/refrigerator   # 냉장고(픽업) 배너
/api/bff/v3/store/detail               # 매장 상세
/api/bff/v2/store/detail               # 매장 상세 (v2)
/api/bff/v1/basket                     # 장바구니
/api/bff/v1/basket/items               # 장바구니 아이템
/api/addition/autocomplete             # 자동완성
/api/addition/hotkeyword               # 인기검색어
/api/addition/popular                  # 인기
/api/addition/relatedKeyword           # 연관검색어
/api/alive                             # 헬스체크
```

## 캡처 방법

### 사용된 도구

1. **blutter**: Flutter AOT libapp.so 분석
2. **Frida**: 런타임 후킹 (암복호화 함수)
3. **mitmproxy**: 네트워크 캡처 (TLS 제한으로 일부만)

### 후킹 지점 (libapp.so 오프셋)

| 함수                   | 오프셋   | 용도          |
| ---------------------- | -------- | ------------- |
| `_encrypt`             | 0xa98420 | 요청 암호화   |
| `_decrypt`             | 0xb07064 | 응답 복호화   |
| `Encrypter::encrypt`   | 0xa984c4 | 실제 암호화   |
| `Encrypter::decrypt64` | 0xa9b50c | Base64 복호화 |

### 캡처된 요청 구조

```json
{
  "appinfo_os_type": "android",
  "queryParameters": {
    "serviceCode": "01",
    "storeCode": "VE463",
    "pageNumber": "0",
    "pageCount": "100"
  },
  "data": null
}
```

## 리플레이 테스트 결과

```bash
curl -s "https://b2c-bff.woodongs.com/api/bff/v2/store/stock?serviceCode=01&storeCode=VE463&pageNumber=0&pageCount=100" \
  -H "Authorization: Bearer {JWT}" \
  -H "x-device-id: {device-id}" \
  -H "Content-Type: application/json"
```

**결과:** ✅ 성공 (매장 목록 + 재고 정보 반환)

## 추가 확인된 API

### 내 냉장고 API ✅

```
GET /api/bff/v1/myRefrigerator
```

**응답:** 프로모션 상품 목록, 원플러스원, 와인25, 이벤트 상품 등

### 매장 검색 API ✅

```
GET /api/bff/v1/store?storeCode={storeCode}&serviceCode=01
```

**응답:** 매장 목록 (좌표, 주소, 전화번호, 서비스 속성 등)

## 확인된 API 요약

| API       | 경로                         | 상태 |
| --------- | ---------------------------- | ---- |
| 재고 조회 | `/api/bff/v2/store/stock`    | ✅   |
| 내 냉장고 | `/api/bff/v1/myRefrigerator` | ✅   |
| 매장 검색 | `/api/bff/v1/store`          | ✅   |

## 다음 단계

1. [x] 상품별 재고 조회 API 확인
2. [x] 매장 검색 API 확인
3. [ ] 토큰 갱신 로직 파악
4. [ ] MCP 도구 구현

## 관련 파일

- `scripts/frida/gs25-blutter-encrypter-hook.js`: Frida 후킹 스크립트
- `captures/gs25-blutter-test/frida-v3.log`: 캡처 로그
- `tmp/gs25-static/blutter-out-gs25/`: blutter 분석 결과
