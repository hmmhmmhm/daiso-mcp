# GS25 앱 캡처 시도 로그 (2026-03-08)

작성일: 2026-03-08 (KST)
대상 앱: 우리동네GS iOS (`com.gsretail.gscvs`)

## 1. 목적

- GS25 앱 재고조회 트래픽 실측
- 재고 API 엔드포인트/인증 구조 파악
- MCP 구현 가능성 판정

## 2. 시도 이력

### Round 1

- 산출물:
  - `captures/gs25-20260308/raw.mitm`
  - `captures/gs25-20260308/requests.jsonl`
  - `captures/gs25-20260308/summary.json`
- 결과:
  - `matchedFlows = 0`
- 메모:
  - 호스트 필터가 너무 좁아 핵심 트래픽 누락

### Round 2

- 산출물:
  - `captures/gs25-20260308-r2/raw.mitm`
  - `captures/gs25-20260308-r2/requests.jsonl`
  - `captures/gs25-20260308-r2/summary.json`
- 결과:
  - `matchedFlows = 19`
- 주요 관측:
  - `GET m.woodongs.com/app_error/login`
  - `POST tms31.gsshop.com/msg-api/{deviceCert,newMsg,login,setConfig}.m`
- 메모:
  - 재고 API는 미관측
  - `msg-api` 바디가 암호화/난독화 형태

### Round 3

- 산출물:
  - `captures/gs25-20260308-r3/raw.mitm`
  - `captures/gs25-20260308-r3/requests.jsonl`
  - `captures/gs25-20260308-r3/summary.json`
- 결과:
  - `matchedFlows = 17`
- 주요 관측:
  - Round 2와 동일 패턴 반복
- 메모:
  - `app_error/login` 경로 진입 상태 지속

### Round 4 (전체 호스트)

- 설정:
  - `gs25_capture_hosts='*'`
- 산출물:
  - `captures/gs25-20260308-r4/raw.mitm`
  - `captures/gs25-20260308-r4/requests.jsonl`
  - `captures/gs25-20260308-r4/summary.json`
- 결과:
  - `matchedFlows = 224`
- 주요 관측:
  - 광고/지도/분석 트래픽 다수
  - GS 관련은 여전히 `m.woodongs.com`, `tms31.gsshop.com` 중심
- 메모:
  - 재고 API 직접 호출은 여전히 미관측

### Round 5 (오류/CONNECT 포함)

- 설정:
  - `gs25_capture_hosts='*'`
  - `scripts/mitmproxy/gs25_capture_export.py`에 `connects/errors` 로그 추가
- 산출물:
  - `captures/gs25-20260308-r5/raw.mitm`
  - `captures/gs25-20260308-r5/requests.jsonl`
  - `captures/gs25-20260308-r5/connects.jsonl`
  - `captures/gs25-20260308-r5/errors.jsonl`
  - `captures/gs25-20260308-r5/summary.json`
- 결과:
  - `matchedFlows = 164`
  - `connectFlows = 563`
  - `errorFlows = 2`
- 주요 관측:
  - `gateway.icloud.com` CONNECT 대량
  - `m.woodongs.com/app_error/login` 반복
  - `tms31.gsshop.com/msg-api/*` 반복
  - `errors`는 `core-track.airbridge.io` peer closed connection 2건
- 메모:
  - 재고 API 후보 도메인(`b2c-apigw.woodongs.com`, `b2c-bff.woodongs.com`) 미관측

## 3. 정적 번들 확인

- 소스:
  - `https://m.woodongs.com/static/js/main.774a174e.js`
- 확인된 문자열:
  - `https://b2c-apigw.woodongs.com`
  - `https://b2c-bff.woodongs.com`
  - `https://b2c-apigw.woodongs.com/catalog`
- 해석:
  - 재고/상품 API가 `b2c-*` 계열일 가능성은 높음
  - 단, iOS MITM 실측에서는 해당 도메인 트래픽이 나타나지 않음

## 4. 현재 판정

- iOS 기준 CU와 동일 MITM 방식만으로는 GS25 재고 API 확보 실패
- 앱 화면에서 재고가 표시되어도 네트워크 핵심 호출이 복호화 경로에 안 잡히는 상태
- 다음 단계는 Android 우회 실측(핀닝 대응)으로 전환 필요

## 5. 후속 문서

- 우회 실측 가이드:
  - `docs/gs25-android-bypass-capture-guide.md`
