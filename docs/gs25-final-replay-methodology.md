# GS25 API 리플레이 방법론 (최종)

작성일: 2026-03-13

## 개요

GS25 우리동네GS 앱의 재고 조회 API를 리플레이하기까지의 전체 과정을 정리합니다.

---

## 1. 문제 정의

### 목표

- GS25 매장별 재고 조회 API 확보
- 외부에서 재현 가능한 HTTP 요청 구성

### 초기 장애물

- 앱이 Flutter 기반으로 구축됨
- 요청/응답이 앱 레이어에서 암호화됨
- Certificate Pinning으로 MITM 캡처 실패
- `b2c-apigw.woodongs.com`, `b2c-bff.woodongs.com` 도메인이 TLS SNI에서만 확인되고 평문 미확보

---

## 2. 접근 방법

### Phase 1: 네트워크 캡처 시도 (실패)

```
mitmproxy + Android 프록시 설정
→ 결과: Certificate Pinning으로 인해 b2c 도메인 평문 미확보
→ 관측된 것: tms31.gsshop.com/msg-api/* (암호화된 페이로드)
```

### Phase 2: Frida SSL 우회 시도 (부분 성공)

```
Frida + SSL Pinning 우회 스크립트
→ 결과: 일부 트래픽 복호화 성공, 그러나 b2c 도메인은 여전히 미확보
→ 원인: Flutter가 자체 TLS 스택(BoringSSL) 사용
```

### Phase 3: 정적 분석 - blutter (핵심 돌파구)

```
blutter로 libapp.so (Flutter AOT) 분석
→ 발견: ApiResponseEncryptionUtility 클래스
→ 발견: Encrypter::encrypt, decrypt64 함수 오프셋
→ 발견: /api/bff/v2/store/stock 등 API 경로 문자열
```

### Phase 4: Frida 런타임 후킹 (성공)

```
blutter 오프셋 기반 Frida 스크립트 작성
→ _encrypt (0xa98420), _decrypt (0xb07064) 후킹
→ 결과: 암복호화 전후 평문 캡처 성공
→ 획득: JWT 토큰, device-id, API 요청 파라미터
```

### Phase 5: API 리플레이 (성공)

```
캡처된 인증 정보로 curl 요청 구성
→ 결과: b2c-bff.woodongs.com API 응답 성공
```

---

## 3. 핵심 도구 및 기술

### 3.1 blutter (Flutter AOT 분석)

```bash
# libapp.so에서 Dart 심볼 추출
blutter libapp.so blutter-out-gs25
```

**발견한 핵심 정보:**

- 암복호화 함수 오프셋
- API 엔드포인트 경로
- 요청/응답 모델 구조

### 3.2 Frida 후킹 스크립트

**후킹 지점 (libapp.so 오프셋):**

| 함수                   | 오프셋   | 용도          |
| ---------------------- | -------- | ------------- |
| `_encrypt`             | 0xa98420 | 요청 암호화   |
| `_decrypt`             | 0xb07064 | 응답 복호화   |
| `Encrypter::encrypt`   | 0xa984c4 | 실제 암호화   |
| `Encrypter::decrypt64` | 0xa9b50c | Base64 복호화 |

**스크립트 위치:** `scripts/frida/gs25-blutter-encrypter-hook.ts`

### 3.3 실행 방법

```bash
# 1. frida-server 실행 (Android)
adb shell su -c '/data/local/tmp/frida-server &'

# 2. adb forward 설정
adb forward tcp:27042 tcp:27042

# 3. 앱 PID 확인
adb shell pidof com.gsr.gs25

# 4. Frida 스크립트 attach
frida -H 127.0.0.1:27042 -p {PID} -l scripts/frida/gs25-blutter-encrypter-hook.ts

# 5. 앱에서 재고찾기 수행 → 로그에 평문 캡처됨
```

---

## 4. 확보된 API 정보

### Base URL

```
https://b2c-bff.woodongs.com
```

### 인증 요구사항 (중요 발견)

**재고 조회 API는 인증이 필요 없습니다!**

앱 내부에서 암호화/인증을 수행하지만, 실제 서버는 인증 없이 호출 가능합니다.
이는 앱 레이어의 암호화가 난독화 목적임을 의미합니다.

| API                          | 인증 필요 | 비고                 |
| ---------------------------- | --------- | -------------------- |
| `/api/bff/v2/store/stock`    | ❌ 불필요 | 재고 조회            |
| `/api/bff/v2/store/detail`   | ❌ 불필요 | 매장 상세            |
| `/api/alive`                 | ❌ 불필요 | 헬스체크             |
| `/api/bff/v1/myRefrigerator` | ✅ 필요   | 내 냉장고 (401 반환) |

### 확인된 API 엔드포인트

| 엔드포인트                   | 메서드 | 용도                 | 인증   |
| ---------------------------- | ------ | -------------------- | ------ |
| `/api/bff/v2/store/stock`    | GET    | 매장별 재고 조회     | 불필요 |
| `/api/bff/v2/store/detail`   | GET    | 매장 상세 정보       | 불필요 |
| `/api/bff/v1/myRefrigerator` | GET    | 내 냉장고 (프로모션) | 필요   |
| `/api/bff/v1/store`          | GET    | 매장 검색            | 미확인 |

---

## 5. 리플레이 예시

### 상품 검색 → itemCode 획득 (필수 선행 단계)

```bash
# 1단계: totalSearch API로 키워드 → itemCode 변환
curl -s -X POST "https://b2c-apigw.woodongs.com/search/v3/totalSearch" \
  -H "Content-Type: application/json" \
  -d '{"query":"핫식스"}'
```

**응답에서 itemCode 추출:**

```json
{
  "SearchQueryResult": {
    "Collection": [
      {
        "Documentset": {
          "Document": [
            {
              "field": {
                "itemCode": "8801056249212",
                "itemName": "롯데)핫식스더킹애플홀릭355ML"
              }
            }
          ]
        }
      }
    ]
  }
}
```

### 매장 재고 조회 (itemCode + 좌표 필수!)

```bash
# 2단계: itemCode + 좌표로 재고 조회
curl -s "https://b2c-bff.woodongs.com/api/bff/v2/store/stock?serviceCode=01&itemCode=8801056249212&XCoordination=127.0276&YCoordination=37.4979&pageNumber=0&pageCount=100&realTimeStockYn=Y"
```

**중요: keyword 파라미터가 아닌 itemCode + 좌표가 필요합니다!**

**파라미터:**
| 파라미터 | 설명 | 필수 | 예시 |
|---------|------|------|------|
| serviceCode | 서비스 코드 (01=GS25) | O | `01` |
| itemCode | 상품 코드 (totalSearch에서 획득) | O | `8801056249212` |
| XCoordination | 경도 | O | `127.0276` |
| YCoordination | 위도 | O | `37.4979` |
| realTimeStockYn | 실시간 재고 여부 | O | `Y` |
| pageNumber | 페이지 번호 | - | `0` |
| pageCount | 페이지당 항목 수 | - | `100` |

**응답:**

```json
{
  "stores": [{
    "storeCode": "VY814",
    "storeName": "백령북포점",
    "storeAddress": "인천 옹진군 백령면 당후길 7",
    "storeXCoordination": "124.66430616954244",
    "storeYCoordination": "37.96076745609878",
    "realStockQuantity": "0",
    "propertyList": [...]
  }]
}
```

### 매장 상세 조회 (인증 불필요)

```bash
curl -s "https://b2c-bff.woodongs.com/api/bff/v2/store/detail?storeCode=VE463&serviceCode=01"
```

**응답:** 매장 속성 (상비의약품, 현금인출기, 와인25 등)

---

## 6. 핵심 교훈

### 성공 요인

1. **정적 분석 우선**: 네트워크 캡처 실패 시 앱 바이너리 분석으로 전환
2. **blutter 활용**: Flutter AOT 특화 도구로 Dart 심볼/오프셋 추출
3. **앱 레이어 후킹**: TLS가 아닌 암복호화 함수 직접 후킹
4. **오프셋 기반 접근**: 클래스명이 아닌 메모리 오프셋으로 정확한 후킹
5. **인증 검증**: 캡처된 인증 정보 없이도 API 호출 테스트 → 인증 불필요 발견

### 주요 발견

**앱 암호화 ≠ 서버 인증**

앱 내부에서 요청/응답을 암호화하지만, 실제 서버는 인증 없이 호출 가능합니다.
이는 앱 레이어 암호화가 난독화/리버스 엔지니어링 방지 목적임을 의미합니다.

**재고 조회는 2단계 프로세스**

1. `totalSearch` API: 키워드 → itemCode 변환
2. `store/stock` API: itemCode + 좌표 → 재고 정보

단순히 `keyword` 파라미터만 사용하면 결과가 0개로 나옵니다.
반드시 `itemCode` + `XCoordination` + `YCoordination` 조합이 필요합니다.

### 실패 원인 분석

| 시도      | 실패 원인              |
| --------- | ---------------------- |
| MITM      | Certificate Pinning    |
| SSL 우회  | Flutter 자체 TLS 스택  |
| Java 후킹 | Flutter는 Dart VM 사용 |

---

## 7. 관련 파일

```
docs/
├── gs25-final-replay-methodology.md       # 본 문서 (최종)
└── archive/                               # 중간 분석 기록 보관
    ├── gs25-network-analysis-result.md    # 네트워크 분석 기록
    ├── gs25-android-bypass-capture-guide.md # Frida 우회 가이드
    ├── gs25-new-blutter-analysis.md       # blutter 분석 결과
    ├── gs25-new-blutter-signal-summary.md # blutter 신호 요약
    └── ...                                # 기타 중간 문서들

scripts/frida/
└── gs25-blutter-encrypter-hook.js         # 최종 후킹 스크립트

tmp/gs25-static/
└── blutter-out-gs25/                      # blutter 산출물
```

---

## 8. 추가 발견 (2026-03-14)

### 재고 API 좌표 파라미터 수정

**문제**: 문서화된 파라미터로 API 호출 시 수도권 매장 재고가 모두 0으로 반환

**원인**: 앱이 사용하는 실제 파라미터명이 다름

| 잘못된 파라미터 | 올바른 파라미터                                           |
| --------------- | --------------------------------------------------------- |
| `XCoordination` | `myPositionXCoordination` + `centerPositionXCoordination` |
| `YCoordination` | `myPositionYCoordination` + `centerPositionYCoordination` |
| (없음)          | `radiusCondition=500`                                     |

**수정된 API 호출 예시**:

```bash
curl -s "https://b2c-bff.woodongs.com/api/bff/v2/store/stock?serviceCode=01&itemCode=8801056038861&myPositionXCoordination=126.841342&myPositionYCoordination=37.317730&centerPositionXCoordination=126.841342&centerPositionYCoordination=37.317730&radiusCondition=500&pickupStoreYn=N&realTimeStockYn=Y"
```

**발견 방법**: Frida v4 스크립트로 앱의 실제 요청 파라미터 평문 캡처

- 상세 가이드: `docs/gs25-frida-plaintext-capture-guide.md`

---

## 9. 완료된 항목

1. ~~**토큰 갱신**~~: 재고 조회 API는 인증 불필요로 확인됨 ✅
2. ~~**MCP 도구 구현**~~: `gs25_check_inventory` 구현 완료 ✅
3. ~~**좌표 파라미터 수정**~~: 올바른 파라미터명으로 수정 ✅
