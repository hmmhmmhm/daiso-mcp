# GS25 네트워크 분석 결과 (실측 기반)

작성일: 2026-03-03 (KST)  
실측 도구: Playwright MCP, curl  
대상:
- `https://gs25.gsretail.com/gscvs/ko/store-services/locations`
- `https://gs25.gsretail.com/gscvs/ko/store-services/woodongs`
- `https://gs25.gsretail.com/gscvs/ko/store-services/myrefrigerator`

## 결론 요약

- 주변 매장 조회: `가능` (웹 API 실측 성공)
- 재고 조회: `앱 경유 가능성 높음` (`r7` pcap TLS SNI에서 `b2c-apigw/b2c-bff` 실접속 확인)
- 구현 판정:
  - `gs25_find_nearby_stores`는 구현 가능
  - `gs25_check_inventory`는 평문 요청/응답 확보 전까지 보류

## 1) 매장 조회 API 실측 결과

GS25 매장검색 페이지의 실제 UI 조작으로 아래 API 3종을 확인했습니다.

### A. 시/도 -> 시/군/구 조회

- Endpoint: `GET /gscvs/ko/gsapi/gis/searchGungu`
- 실측 호출 URL:
  - `https://gs25.gsretail.com/gscvs/ko/gsapi/gis/searchGungu?&stb1=11&_=...`
- 요청 파라미터:
  - `stb1`: 시/도 코드 (`11` = 서울시)
- 응답 형식: JSON
- 응답 예시:
  - `{"result":[["1168","강남구"],...],"resultCode":"00000"}`

### B. 시/군/구 -> 동 조회

- Endpoint: `GET /gscvs/ko/gsapi/gis/searchDong`
- 실측 호출 URL:
  - `https://gs25.gsretail.com/gscvs/ko/gsapi/gis/searchDong?&stb1=11&stb2=1168&_=...`
- 요청 파라미터:
  - `stb1`: 시/도 코드 (`11`)
  - `stb2`: 구/군 코드 (`1168` = 강남구)
- 응답 형식: JSON
- 응답 예시:
  - `{"result":[["11680101","역삼동"],...],"resultCode":"00000"}`

### C. 매장 목록 조회

- Endpoint: `POST /gscvs/ko/store-services/locationList`
- 실측 호출 URL:
  - `https://gs25.gsretail.com/gscvs/ko/store-services/locationList?CSRFToken=...`
- 요청 방식:
  - `application/x-www-form-urlencoded`
  - 지역/매장명/서비스 필터를 form 필드로 전송
- 응답 형식:
  - 본문이 JSON 문자열 형태로 내려오며, 프론트에서 `JSON.parse(result)`로 파싱
- 응답 핵심 필드:
  - `results[].shopCode`
  - `results[].shopName`
  - `results[].address`
  - `results[].offeringService[]`
  - `results[].longs` (위도값으로 내려옴)
  - `results[].lat` (경도값으로 내려옴)
  - `pagination.totalNumberOfResults`

## 2) 실측 증거

Playwright 실측에서 아래 요청/응답을 확인했습니다.

- `GET /gscvs/ko/gsapi/gis/searchGungu` -> `200`, `강남구` 포함
- `GET /gscvs/ko/gsapi/gis/searchDong` -> `200`, `역삼동` 포함
- `POST /gscvs/ko/store-services/locationList?CSRFToken=...` -> `200`, `results[]` 다수 매장 반환

매장 목록 응답에서 `GS25강남...` 점포들과 `shopCode`, `address`, `offeringService`가 실제 포함됨을 확인했습니다.

## 3) 요청 파라미터 구조 (실측 기반)

`locationList` 주요 파라미터:

- `pageNum`, `pageSize`
- `searchShopName`
- `searchSido`, `searchGugun`, `searchDong`
- 서비스 필터:
  - `searchTypeToto`
  - `searchTypeCafe25`
  - `searchTypeInstant`
  - `searchTypeDrug`
  - `searchTypeSelf25`
  - `searchTypePost`
  - `searchTypeATM`
  - `searchTypeWithdrawal`
  - `searchTypeTaxrefund`
  - `searchTypeSmartAtm`
  - `searchTypeSelfCookingUtensils`
  - `searchTypeDeliveryService`
  - `searchTypeParcelService`
  - `searchTypePotatoes`
  - `searchTypeCardiacDefi`
  - `searchTypeFishShapedBun`
  - `searchTypeWine25`
  - `searchTypeGoPizza`
  - `searchTypeSpiritWine`
  - `searchTypeFreshGanghw`
  - `searchTypeMusinsa`
  - `searchTypePosa`

## 4) 재고 조회 실측 결과

### 웹 채널 관찰

- `woodongs` 페이지는 재고찾기 기능을 소개하지만, 실측 리소스에서 재고 API 호출은 관찰되지 않음
- 페이지 내 링크는 우리동네GS 앱 설치로 연결
  - `https://apps.apple.com/kr/app/id426644449`
  - `https://play.google.com/store/apps/details?id=com.gsr.gs25`
- `myrefrigerator` URL은 웹에서 에러 페이지 응답

### 웹 추가 점검 (2026-03-03 추가)

- 상품 페이지 API 실측:
  - `POST /gscvs/ko/products/event-goods-search?CSRFToken=...`
  - `POST /products/youus-main-search?CSRFToken=...`
- 두 API 모두 브라우저 실측 응답은 정상(200)이며 상품 정보는 제공함
  - 확인 필드 예시: `goodsNm`, `price`, `eventTypeSp`, `goodsStatNm`, `attFileNm`
- 그러나 매장 단위 재고/수량 필드는 확인되지 않음
  - 미확인 필드 예시: `storeCode`, `storeName`, `inventoryQty`, `remainQty`
- 비브라우저 직접 재현 시(`curl`, 별도 HTTP 클라이언트) `403/에러 페이지`가 발생하는 케이스가 있어
  웹 상품 API는 세션/CSRF/실행 컨텍스트 제약이 있는 것으로 보임

### 판정

- GS25 재고조회는 현재 웹보다 우리동네GS 앱 채널 중심 기능으로 보임
- `gs25_check_inventory` 구현을 위해 앱 트래픽 실측이 선행되어야 함

## 5) 구현 권장안

### 즉시 구현 가능

- `gs25_find_nearby_stores`
  - 데이터 소스: `searchGungu`, `searchDong`, `locationList`
  - 구현 방식:
    - 지역 코드 -> 매장 목록 조회
    - 사용자 현재 좌표와 각 매장 좌표 거리 계산으로 근접순 정렬
  - 참고:
    - 응답의 `longs/lat` 필드가 일반적인 명칭과 반대로 사용되므로 정규화 필요

### 실측 후 구현

- `gs25_check_inventory`
  - 선행 조건: 우리동네GS 앱 재고조회 API 실측(엔드포인트, 인증, 요청 스키마)

## 6) 다음 실측 작업

1. Android/iOS 우리동네GS 앱에서 재고조회 시나리오 네트워크 캡처
2. 재고 API 엔드포인트 및 인증 헤더/토큰 요구사항 확인
3. 비로그인/로그인 상태 재현성 비교
4. Cloudflare Worker에서 재현 가능성 판정(A/B/C)

## 7) 2026-03-08 앱 실측 추가 결과 (mitmproxy)

실측 산출물:
- `captures/gs25-20260308/raw.mitm` (1차, 호스트 필터 미스)
- `captures/gs25-20260308/requests.jsonl` (1차, 0건)
- `captures/gs25-20260308-r2/raw.mitm` (2차)
- `captures/gs25-20260308-r2/requests.jsonl` (2차, 19건)
- `captures/gs25-20260308-r2/summary.json`
- `captures/gs25-20260308-r3/raw.mitm` (3차)
- `captures/gs25-20260308-r3/requests.jsonl` (3차, 17건)
- `captures/gs25-20260308-r3/summary.json`
- `captures/gs25-20260308-r4/raw.mitm` (4차, 전체 호스트)
- `captures/gs25-20260308-r4/requests.jsonl` (4차, 224건)
- `captures/gs25-20260308-r4/summary.json`

2차 캡처 호스트:
- `m.woodongs.com` (15건)
- `tms31.gsshop.com` (4건)

관측 엔드포인트:
- `GET /app_error/login` (`m.woodongs.com`)
- `POST /msg-api/deviceCert.m` (`tms31.gsshop.com`)
- `POST /msg-api/newMsg.m` (`tms31.gsshop.com`)
- `POST /msg-api/setConfig.m` (`tms31.gsshop.com`)
- `POST /msg-api/login.m` (`tms31.gsshop.com`)

판정 메모:
- `tms31.gsshop.com/msg-api/*` 요청/응답 바디는 암호화된 페이로드로 보이며,
  현 상태에서는 재고 필드를 직접 식별하기 어려움
- `m.woodongs.com` 경로는 이번 시나리오에서 `app_error/login` 및 정적 리소스 위주로 관측
- 앱의 실제 재고조회 핵심 시나리오(상품 검색 -> 매장 선택 -> 재고 수량 확인)가
  정상적으로 수행된 세션을 다시 캡처해야 재고 API 판정 가능
- 3차에서도 동일하게 `GET /app_error/login`이 먼저 관측되어,
  앱이 정상 인증/세션 상태로 진입하지 못했을 가능성이 높음
- 4차는 `gs25_capture_hosts='*'`로 전체 캡처를 수행했지만,
  핵심 패턴은 동일(`tms31.gsshop.com/msg-api/*` + `m.woodongs.com/app_error/login`)
  으로 확인됨

## 8) 2026-03-08 앱 실측 추가 결과 (r5: 오류/CONNECT 포함)

실측 산출물:
- `captures/gs25-20260308-r5/raw.mitm`
- `captures/gs25-20260308-r5/requests.jsonl` (164건)
- `captures/gs25-20260308-r5/connects.jsonl` (563건)
- `captures/gs25-20260308-r5/errors.jsonl` (2건)
- `captures/gs25-20260308-r5/summary.json`

관측 요약:
- HTTP 요청은 여전히 `m.woodongs.com/app_error/login` + 정적 리소스 + 광고/지도 트래픽 중심
- GS 관련 호출은 `tms31.gsshop.com/msg-api/*`만 반복 관측
- 번들 문자열에서 확인된 `b2c-apigw.woodongs.com`, `b2c-bff.woodongs.com`는
  이번 실측 `requests/connects`에 모두 미관측

CONNECT 요약:
- `gateway.icloud.com` CONNECT가 437건으로 대부분을 차지
- `m.woodongs.com` CONNECT는 2건
- `tms31.gsshop.com` CONNECT는 4건

오류 요약:
- `errors.jsonl` 2건 모두 `core-track.airbridge.io`의 `peer closed connection`
- 재고 API 후보 도메인에서 직접적인 HTTP 오류 레코드는 없음

판정:
- "앱 화면에서 재고가 보임"과 별개로, 현재 MITM 복호화 계층에서는
  재고 API 호출이 확인되지 않음
- 현재 세션은 실질적으로 `app_error/login` 경로로 들어가며,
  정상 재고 API 경로(`b2c-*`) 호출 전 단계에서 이탈한 상태로 판단됨

## 9) 2026-03-08 Android + Frida 우회 실측 준비 점검 (r1)

실행 시각:
- 2026-03-08 21:36 (KST)

준비 상태 점검:
- `mitmdump`: 설치/실행 가능 (`Mitmproxy 12.2.1`)
- `frida`: 설치 확인 (`17.5.2`)
- `adb`: 미설치(`adb not found`)로 로컬에서 기기 연결 상태 직접 점검 불가
- `scripts/frida/android-ssl-bypass.js`: 저장소 내 미확인

실행 중 캡처 세션:
- 명령:
  - `mitmdump --listen-host 0.0.0.0 --listen-port 8080 -s scripts/mitmproxy/gs25_capture_export.py --set gs25_capture_dir=captures/gs25-android-20260308-r1 --set gs25_capture_scenario='Android+Frida 재고조회 실측 2026-03-08' --set gs25_capture_hosts='*' -w captures/gs25-android-20260308-r1/raw.mitm`
- 출력:
  - `HTTP(S) proxy listening at *:8080`
  - `captures/gs25-android-20260308-r1` 초기화 완료

중간 판정(준비 단계):
- Android + Frida 우회 실측을 위한 MITM 수집 경로는 준비됨
- 단, 실제 우회 주입 검증(Frida attach, 핀닝 우회 성공)은 기기 재현 로그 확보 후 최종 판정 필요

재고 API 후보 도메인 판정(현시점):
- 기존 캡처(`r2~r5`) 기준 `b2c-apigw.woodongs.com`, `b2c-bff.woodongs.com`는 미관측
- 본 r1 세션은 대기 중이며, 재고 시나리오 재현 트래픽 수집 후 최종 판정 업데이트 예정

## 10) 2026-03-09 Android 루팅 + Frida 실측 결과 (r1)

실측 산출물:
- `captures/gs25-android-20260309-r1/raw.mitm`
- `captures/gs25-android-20260309-r1/requests.jsonl` (15건)
- `captures/gs25-android-20260309-r1/connects.jsonl` (38건)
- `captures/gs25-android-20260309-r1/errors.jsonl` (1건)
- `captures/gs25-android-20260309-r1/summary.json`

실행 조건:
- 기기 루팅 완료 (`su` 동작 확인)
- `frida-server 17.5.2 (android-arm64)` 기기 실행
- `scripts/frida/android-ssl-bypass.js` 주입 후 GS25 앱 실행
- Android 프록시 `172.30.1.27:8080` 설정

요청 관측 요약 (`requests.jsonl`):
- `POST https://tms31.gsshop.com/msg-api/setConfig.m`
- `POST https://tms31.gsshop.com/msg-api/login.m`
- `POST https://api2.amplitude.com/`
- `POST https://browser-intake-datadoghq.com/api/v2/{logs,rum}`

CONNECT 관측 요약 (`connects.jsonl`):
- `m.woodongs.com` CONNECT 1건
- `tms31.gsshop.com` CONNECT 2건
- 광고/분석/지도 계열 CONNECT 다수

오류 요약:
- `errors.jsonl` 1건: `api2.amplitude.com` `peer closed connection`

재고 API 후보 판정:
- `b2c-apigw.woodongs.com`: `requests/connects` 모두 미관측
- `b2c-bff.woodongs.com`: `requests/connects` 모두 미관측
- 이번 루팅+Frida 실측에서도 재고 API 직접 식별 실패

해석:
- 앱 경로가 여전히 `tms31.gsshop.com/msg-api/*` 중심이며, 바디는 암호화/난독화 형태
- 정적 번들에 존재하는 `b2c-*` 도메인이 실제 호출 경로에서 활성화되지 않았거나,
  다른 실행 조건(앱 버전/기능 플래그/계정 상태/지역/별도 전송 계층)이 필요할 가능성 있음

## 11) 2026-03-09 msg-api 프로브 실측 결과 (r2)

실측 산출물:
- `captures/gs25-android-20260309-r2/raw.mitm`
- `captures/gs25-android-20260309-r2/requests.jsonl` (9건)
- `captures/gs25-android-20260309-r2/connects.jsonl` (40건)
- `captures/gs25-android-20260309-r2/errors.jsonl` (0건)
- `captures/gs25-android-20260309-r2/summary.json`

프로브 설정:
- `scripts/frida/gs25-msgapi-probe.js` 주입
  - SSL 우회
  - `URL/URLConnection` 관찰
  - `Base64` 및 `Cipher.doFinal` 관찰

관측 결과:
- 요청은 여전히 아래 3종 중심
  - `POST /msg-api/deviceCert.m`
  - `POST /msg-api/setConfig.m`
  - `POST /msg-api/login.m`
- `requests/connects` 모두에서 `b2c-apigw.woodongs.com`, `b2c-bff.woodongs.com` 미관측
- Frida 로그에서 `msg-api` URL 생성은 확인되나, 재고/매장/수량 필드 평문은 미확보
- `m.woodongs.com` 및 WebView/광고 계열은 TLS 거부(`certificate unknown`)가 반복됨

판정:
- 현재 확보된 실측 경로만으로는 재고 API를 직접 식별할 수 없음
- 다음 단계는 `msg-api` 자체 암복호 함수 식별(클래스/메서드 레벨 정밀 후킹) 또는
  WebView/네이티브 네트워크 계층(Cronet/BoringSSL) 후킹 확장이 필요

## 12) 2026-03-09 app+webview 후킹 실측 결과 (r4)

실측 산출물:
- `captures/gs25-android-20260309-r4/raw.mitm`
- `captures/gs25-android-20260309-r4/requests.jsonl` (103건)
- `captures/gs25-android-20260309-r4/connects.jsonl` (99건)
- `captures/gs25-android-20260309-r4/errors.jsonl` (0건)
- `captures/gs25-android-20260309-r4/summary.json`

후킹 변경점:
- `scripts/frida/gs25-msgapi-target-hook.js`에 `WebViewClient.onReceivedSslError` /
  `SslErrorHandler.proceed()` 강제 허용 로직 추가

핵심 관측:
- 기존과 동일하게 `tms31.gsshop.com/msg-api/{deviceCert,setConfig,login}` 반복
- `m.woodongs.com` 요청이 증가(12건):
  - `/app_error/login`
  - `/static/js/main.774a174e.js`
  - `/static/js/8537.837fe746.chunk.js`
  - `/images/kakao_map_v2/*` 등 정적 리소스
- Kakao 지도 타일 요청 다수(`mts.daumcdn.net`), 광고/분석 호출 다수

후보 도메인 판정:
- `b2c-apigw.woodongs.com`: `requests/connects` 모두 미관측
- `b2c-bff.woodongs.com`: `requests/connects` 모두 미관측

해석:
- WebView SSL 에러 우회로 `m.woodongs.com` 정적 자원까지는 수집 가능해졌음
- 그러나 재고 API 본호출로 이어지는 동적 엔드포인트(`b2c-*`)는 여전히 나타나지 않음
- 현재 실행 경로는 사실상 `app_error/login` 및 초기화/정적 리소스 단계에 머무는 것으로 판단됨

## 13) 2026-03-09 app+webview+storage 확장 후킹 실측 결과 (r5)

실측 산출물:
- `captures/gs25-android-20260309-r5/raw.mitm`
- `captures/gs25-android-20260309-r5/requests.jsonl` (8건)
- `captures/gs25-android-20260309-r5/connects.jsonl` (12건)
- `captures/gs25-android-20260309-r5/errors.jsonl` (1건)

후킹/실행 조건:
- 루팅 기기 + `frida-server 17.5.2`
- `scripts/frida/gs25-msgapi-target-hook.js` 적용
  - SSL 우회 + WebView SSL `proceed()` 허용
  - WebView URL 로드/스토리지 덤프 보조 후킹 포함
- Android 프록시: `172.30.1.27:8080`

요청 관측 요약 (`requests.jsonl`):
- `POST https://tms31.gsshop.com/msg-api/deviceCert.m`
- `POST https://tms31.gsshop.com/msg-api/setConfig.m`
- `POST https://tms31.gsshop.com/msg-api/login.m`
- 기타: `browser-intake-datadoghq.com`, `googleads.g.doubleclick.net`

CONNECT 관측 요약 (`connects.jsonl`):
- `tms31.gsshop.com` 2건
- `googleads.g.doubleclick.net` 2건
- `browser-intake-datadoghq.com` 2건
- 그 외 광고/로깅/시스템 호스트 소수

오류 요약:
- `POST https://browser-intake-datadoghq.com/api/v2/logs?ddsource=flutter`
  - `Client disconnected.`

후보 도메인 판정:
- `b2c-apigw.woodongs.com`: `requests/connects` 모두 미관측
- `b2c-bff.woodongs.com`: `requests/connects` 모두 미관측

종합 판정(2026-03-09 기준):
- 루팅 + Frida + WebView SSL 우회 확장 후에도 실측 네트워크는 `msg-api` 초기화 경로 중심
- 현재 재현 시나리오에서는 `b2c-apigw`/`b2c-bff` 실호출 증거가 없음
- 따라서 재고 API 후보는 "번들 문자열 존재(정적) / 실측 호출 미확인(동적)" 상태로 유지

## 14) 2026-03-09 사용자 재현 포함 실측 결과 (r6)

실측 산출물:
- `captures/gs25-android-20260309-r6/raw.mitm`
- `captures/gs25-android-20260309-r6/requests.jsonl` (117건)
- `captures/gs25-android-20260309-r6/connects.jsonl` (34건)
- `captures/gs25-android-20260309-r6/errors.jsonl` (0건)
- `captures/gs25-android-20260309-r6/summary.json`

실행 조건:
- Android 프록시: `172.30.1.27:8082`
- Frida 후킹: `scripts/frida/gs25-msgapi-target-hook.js`
- 사용자 재현: 재고조회 시나리오 직접 수행 후 종료

요청 관측 요약:
- `tms31.gsshop.com`:
  - `POST /msg-api/deviceCert.m`
  - `POST /msg-api/setConfig.m`
  - `POST /msg-api/login.m`
- `m.woodongs.com`:
  - `GET /app_error/login`
  - `GET /native_util.js`
  - `GET /js/libs/netfunnel.js`
  - `GET /static/js/main.774a174e.js`
  - `GET /static/js/8537.837fe746.chunk.js`
  - 지도/아이콘 정적 리소스
- 기타 다수:
  - `googleads.g.doubleclick.net`, `pagead2.googlesyndication.com`
  - `mts.daumcdn.net`(지도 타일), `dapi.kakao.com`
  - `browser-intake-datadoghq.com`, `api2.amplitude.com`

CONNECT 관측 요약:
- `googleads.g.doubleclick.net` 5건
- `pagead2.googlesyndication.com` 4건
- `cdn.jsdelivr.net` 4건
- `tms31.gsshop.com` 2건
- `m.woodongs.com` 2건

후보 도메인 판정:
- `b2c-apigw.woodongs.com`: `requests/connects` 모두 미관측
- `b2c-bff.woodongs.com`: `requests/connects` 모두 미관측

판정:
- 사용자 재현을 포함해도 네트워크는 `msg-api` 초기화 + `app_error/login`/정적 로드 패턴 유지
- 재고 API 직접 호출(`b2c-apigw`/`b2c-bff`)은 여전히 실측 근거 없음

## 15) 2026-03-09 tcpdump 병행 실측 결과 (r7)

실측 산출물:
- `captures/gs25-android-20260309-r7/raw.mitm`
- `captures/gs25-android-20260309-r7/requests.jsonl` (149건)
- `captures/gs25-android-20260309-r7/connects.jsonl` (58건)
- `captures/gs25-android-20260309-r7/errors.jsonl` (1건)
- `captures/gs25-android-20260309-r7/summary.json`
- `captures/gs25-android-20260309-r7/gs25-r7.pcap` (tcpdump 원본)

실행 조건:
- Android 프록시: `172.30.1.27:8082`
- `mitmdump + Frida + tcpdump` 동시 수집
- tcpdump: 기기 `any` 인터페이스에서 전체 패킷 캡처

MITM 계층 관측:
- 기존과 동일하게 `tms31.gsshop.com/msg-api/*` + `m.woodongs.com/app_error/login`/정적 리소스 중심
- `requests.jsonl` 내에서는 여전히 `b2c-apigw`/`b2c-bff` HTTP 요청이 직접 보이지 않음

PCAP 계층 핵심 관측 (TLS SNI):
- 프록시(172.30.1.27:8082) 경유가 아닌 직접 `tcp/443` 세션에서 아래 SNI 확인
  - `b2c-apigw.woodongs.com` (3회)
  - `b2c-bff.woodongs.com` (9회)
  - `waiting.woodongs.com` (3회)
  - `image.woodongs.com` (11회)
- 예시 시각(KST):
  - `2026-03-09 01:34:17` `b2c-apigw.woodongs.com`
  - `2026-03-09 01:34:14` `b2c-bff.woodongs.com`

프로토콜 판정 (r7 범위):
- WebSocket/SSE/gRPC: MITM 요청 기준 미관측
- QUIC(UDP/443): pcap 기준 미관측
- UDP 트래픽은 DNS(53) 및 mDNS(5353) 위주

최종 판정 업데이트:
- `b2c-apigw/b2c-bff`는 "앱 런타임에서 실제 접속됨"으로 판정 가능
  - 근거: `pcap`의 TLS ClientHello SNI
- 다만 해당 세션은 프록시 복호화 계층에서 평문 요청/응답이 확보되지 않아
  재고 필드(상품/매장/수량) 식별은 아직 미완료

## 16) 2026-03-09 Java/Cronet 계층 후킹 실측 결과 (r9)

실측 산출물:
- `captures/gs25-android-20260309-r9/raw.mitm`
- `captures/gs25-android-20260309-r9/requests.jsonl` (136건)
- `captures/gs25-android-20260309-r9/connects.jsonl` (64건)
- `captures/gs25-android-20260309-r9/errors.jsonl` (1건)
- `captures/gs25-android-20260309-r9/summary.json`
- `captures/gs25-android-20260309-r9/gs25-r9.pcap`

추가 후킹:
- `scripts/frida/gs25-b2c-java-net-hook.js`
  - `java.net.Socket.connect`
  - `HttpsURLConnection.connect`
  - `org.chromium.net.UrlRequest$Builder`(Cronet)

Java 계층 관측:
- `Socket.connect` 로그는 주로 광고/외부 호스트 위주(`googleads`, `lh6.googleusercontent.com`)로 출력
- `b2c-apigw`/`b2c-bff`의 Java 레벨 URL/헤더 평문은 미확보
- MITM 요청 관측은 기존과 동일:
  - `tms31.gsshop.com/msg-api/*`
  - `m.woodongs.com/app_error/login` + 정적 리소스

PCAP 계층 관측(TLS SNI, KST):
- `b2c-apigw.woodongs.com` 4회
  - 예: `2026-03-09 01:44:03`, `01:44:04`, `01:44:22`
- `b2c-bff.woodongs.com` 10회
  - 예: `2026-03-09 01:44:03`, `01:44:19`, `01:44:25`, `01:44:33`
- 추가 woodongs 계열:
  - `notice.woodongs.com` 1회
  - `waiting.woodongs.com` 3회
  - `image.woodongs.com` 12회

판정 업데이트:
- `b2c-apigw/b2c-bff` 실접속은 `r7`에 이어 `r9`에서도 재현 확인됨
- 다만 평문 HTTP 계층으로는 아직 해독되지 않아, API 경로/파라미터/응답 스키마는 미식별

다음 권장:
- 3단계로 앱 내부 난독화 클래스(`S5/E5/L5/K5`)의 요청 직렬화 직전/응답 파싱 직후를 직접 덤프해
  네트워크 계층 우회 여부와 무관하게 재고 JSON을 확보하는 접근이 유효

## 17) 2026-03-09 객체 필드 덤프 강화 실측 결과 (r10)

실측 산출물:
- `captures/gs25-android-20260309-r10/raw.mitm`
- `captures/gs25-android-20260309-r10/requests.jsonl` (87건)
- `captures/gs25-android-20260309-r10/connects.jsonl` (52건)
- `captures/gs25-android-20260309-r10/errors.jsonl` (1건)
- `captures/gs25-android-20260309-r10/summary.json`
- `captures/gs25-android-20260309-r10/gs25-r10.pcap`

후킹 변경점:
- `scripts/frida/gs25-msgapi-target-hook.js` 확장
  - 난독화 객체(`S5/K5/L5/E5/G5/F5`)의 필드 리플렉션 덤프(`fields{...}`) 추가
  - `Map/List/JSONObject` 계열 문자열화 강화

Frida 관측 요약:
- `TARGET_HOOK` 이벤트는 대량 발생했으나, 주로 암복호/키관리 성격의 객체가 출력됨
  - 예: `S5.d`, `K5.c$a`, `F5.d$b`, `E5.n` 내부 상태
- 재고 도메인(`b2c-apigw`/`b2c-bff`)의 요청 경로/JSON payload 직접 식별에는 실패

MITM 관측 요약:
- 기존 패턴 유지:
  - `POST tms31.gsshop.com/msg-api/{deviceCert,setConfig,login}`
  - `GET m.woodongs.com/app_error/login` + 정적 리소스
- `requests.jsonl` 평문에는 여전히 `b2c-*` 요청 없음

PCAP 관측(TLS SNI, KST):
- `b2c-apigw.woodongs.com` 4회
- `b2c-bff.woodongs.com` 10회
- `waiting.woodongs.com` 2회
- `image.woodongs.com` 12회
- 예시 시각:
  - `2026-03-09 01:47:47` `b2c-apigw.woodongs.com`
  - `2026-03-09 01:47:47` `b2c-bff.woodongs.com`

판정:
- 3단계(객체 덤프 강화)에서도 `b2c-*` 평문 API 스키마는 확보되지 않음
- 다만 `b2c-apigw/b2c-bff` 실제 접속은 `r7/r9/r10`에서 일관되게 재현됨

## 18) 2026-03-09 포커스 덤프(문자열/JSON 경계) 실측 결과 (r11)

실측 산출물:
- `captures/gs25-android-20260309-r11/raw.mitm`
- `captures/gs25-android-20260309-r11/requests.jsonl` (111건)
- `captures/gs25-android-20260309-r11/connects.jsonl` (44건)
- `captures/gs25-android-20260309-r11/errors.jsonl` (1건)
- `captures/gs25-android-20260309-r11/summary.json`
- `captures/gs25-android-20260309-r11/gs25-r11.pcap`

추가 후킹:
- `scripts/frida/gs25-b2c-focused-dump.js`
  - 난독 클래스 메서드 중 문자열/JSON/바이트 타입 경계만 선별 후킹
  - Flutter MethodChannel(`invokeMethod`) 인자 덤프
  - WebView `addJavascriptInterface` 관찰

Frida 관측 요약:
- `FOCUSED_HOOK` 이벤트는 다수 관측되었으나, 핵심은 여전히 암복호/알고리즘 객체 중심
  - 예: `E5.n`, `G5.b`에서 암호 관련 파라미터/상태
- Flutter 채널은 `onLoadStart`, `onLoadStop`, `onProgressChanged` 등 WebView 이벤트 위주
- `b2c-apigw/b2c-bff` 요청 URL/헤더/바디 평문은 미포착

MITM 관측 요약:
- 패턴 동일:
  - `POST tms31.gsshop.com/msg-api/{deviceCert,setConfig,login}`
  - `GET m.woodongs.com/app_error/login` + 정적 리소스
- `requests.jsonl`에는 여전히 `b2c-*` 엔드포인트 직접 미관측

PCAP 관측(TLS SNI, KST):
- `b2c-apigw.woodongs.com` 5회
- `b2c-bff.woodongs.com` 12회
- 예시:
  - `2026-03-09 01:51:18` `b2c-apigw.woodongs.com`
  - `2026-03-09 01:51:18` `b2c-bff.woodongs.com`
  - `2026-03-09 01:52:02` `b2c-apigw.woodongs.com`

판정:
- 포커스 덤프 전략에서도 평문 API 스키마는 확보 실패
- 다만 `b2c-apigw/b2c-bff` 실접속 재현은 더 강화됨(`r7/r9/r10/r11`)
- 다음 실효 전략은 앱 내부 직렬화 함수의 "최종 문자열 생성 지점"을 역추적해
  해당 리턴값을 강제 덤프하는 방식(콜스택 기반 타깃 축소)이 필요

## 19) 2026-03-09 콜스택 기반 평문 추적 실측 결과 (r12)

실측 산출물:
- `captures/gs25-android-20260309-r12/raw.mitm`
- `captures/gs25-android-20260309-r12/requests.jsonl` (104건)
- `captures/gs25-android-20260309-r12/connects.jsonl` (46건)
- `captures/gs25-android-20260309-r12/errors.jsonl` (0건)
- `captures/gs25-android-20260309-r12/summary.json`
- `captures/gs25-android-20260309-r12/gs25-r12.pcap`

추가 후킹:
- `scripts/frida/gs25-b2c-stacktrace-dump.js`
  - `String(byte[])` 생성 지점
  - `JSONObject(String)` 생성 지점
  - `Cipher.doFinal([B)` 출력 바이트
  - `URL(String)` 생성 지점
  - 모두 콜스택 필터(`S5/E5/K5/L5/F5/G5/com.gsr.gs25`)와 함께 기록

Frida 관측 요약:
- `Cipher.doFinal([B)` 및 문자열 생성 이벤트는 포착됨
- 다만 주요 스택은 `androidx.security.crypto`/내부 암복호 경로 중심으로 관측
  - 앱 설정/보안 저장소 계열 가능성이 높음
- `b2c-apigw/b2c-bff`의 URL/헤더/JSON 평문은 여전히 미포착

MITM 관측 요약:
- 기존 패턴 유지:
  - `POST tms31.gsshop.com/msg-api/{deviceCert,setConfig,login}`
  - `GET m.woodongs.com/app_error/login` + 정적 리소스
- 평문 `requests.jsonl`에는 `b2c-*` 직접 엔드포인트 미관측

PCAP 관측(TLS SNI):
- `b2c-apigw.woodongs.com` 6회
- `b2c-bff.woodongs.com` 13회
- `image.woodongs.com` 15회
- 예시(KST):
  - `2026-03-09 01:55:19` `b2c-apigw.woodongs.com`
  - `2026-03-09 01:55:19` `b2c-bff.woodongs.com`
  - `2026-03-09 01:55:49` `b2c-apigw.woodongs.com`

판정:
- 콜스택 기반 추적에서도 `b2c` 평문 스키마 확보에는 실패
- 그러나 `b2c-apigw/b2c-bff` 실접속 재현 근거는 누적 강화(`r7/r9/r10/r11/r12`)

## 20) 2026-03-09 Cronet 정밀 프로브 실측 결과 (r13)

실측 산출물:
- `captures/gs25-android-20260309-r13/raw.mitm`
- `captures/gs25-android-20260309-r13/requests.jsonl` (83건)
- `captures/gs25-android-20260309-r13/connects.jsonl` (43건)
- `captures/gs25-android-20260309-r13/errors.jsonl` (1건)
- `captures/gs25-android-20260309-r13/summary.json`
- `captures/gs25-android-20260309-r13/gs25-r13.pcap`

추가 후킹:
- `scripts/frida/gs25-b2c-cronet-probe.js`
  - `org.chromium.net.UrlRequest$Builder.setHttpMethod/addHeader/build`
  - `java.net.URL` 생성자 보조 추적

Frida 관측 요약:
- Cronet 후킹 자체는 성공적으로 로드됨
- 그러나 재현 구간에서 `Cronet.method/header/build` 로그가 의미 있게 출력되지 않음
  - 관측 URL은 여전히 광고/분석/`msg-api` 중심
- 해석:
  - 실제 `b2c-*` 호출이 Cronet 빌더 경로를 우회하거나,
  - 다른 네이티브 네트워크 스택에서 수행될 가능성 높음

MITM 관측 요약:
- 기존과 동일:
  - `POST tms31.gsshop.com/msg-api/{deviceCert,setConfig,login}`
  - `GET m.woodongs.com/app_error/login` + 정적 리소스
- 평문 `requests.jsonl`에는 `b2c-*` 직접 엔드포인트 미관측

PCAP 관측(TLS SNI):
- `b2c-apigw.woodongs.com` 4회
- `b2c-bff.woodongs.com` 10회
- 예시(KST):
  - `2026-03-09 01:58:44` `b2c-apigw.woodongs.com`
  - `2026-03-09 01:58:44` `b2c-bff.woodongs.com`
  - `2026-03-09 01:59:00` `b2c-apigw.woodongs.com`

판정:
- Cronet 정밀 프로브에서도 `b2c` 평문 URL/헤더/바디는 확보 실패
- 다만 `b2c-apigw/b2c-bff` 실접속 재현은 유지됨

## 21) 2026-03-09 세션 인계 요약 (컨텍스트 초기화용)

현재 최종 판정:
- `b2c-apigw.woodongs.com`, `b2c-bff.woodongs.com`는 앱 런타임에서 실제 접속됨
  - 근거: `r7/r9/r10/r11/r12/r13`의 `pcap TLS SNI`에서 반복 확인
- MITM 평문 계층(`requests.jsonl`)에서는 `b2c-*` 요청/응답 스키마가 끝내 확인되지 않음
- 평문으로 반복 확인되는 엔드포인트는 주로 아래 2계열:
  - `POST tms31.gsshop.com/msg-api/{deviceCert,setConfig,login}`
  - `GET m.woodongs.com/app_error/login` 및 정적 리소스

누적 실험 요약:
- `r1~r6`: Android+Frida 우회/후킹 기반 실측. 평문 `b2c-*` 미확보
- `r7`: `mitmdump + frida + tcpdump` 병행에서 최초 `b2c-*` SNI 확인
- `r8`: TLS keylog 시도(`SSL_CTX_set_keylog_callback`)는 export 부재로 실패
- `r9~r13`: Java/Cronet/객체덤프/콜스택/Cronet-probe 확장. 실접속은 재현되나 평문 스키마 미확보

산출물 위치:
- 캡처: `captures/gs25-android-20260309-r7` ~ `captures/gs25-android-20260309-r13`
- 주요 스크립트:
  - `scripts/mitmproxy/gs25_capture_addons.py`
  - `scripts/frida/gs25-msgapi-target-hook.js`
  - `scripts/frida/gs25-b2c-java-net-hook.js`
  - `scripts/frida/gs25-b2c-focused-dump.js`
  - `scripts/frida/gs25-b2c-stacktrace-dump.js`
  - `scripts/frida/gs25-b2c-cronet-probe.js`

다음 세션 우선순위:
1. `r14`로 짧은 재현(사용자 1회 시나리오) + 3중 캡처(`mitmdump/frida/tcpdump`) 동시 실행
2. `b2c-*` 연결 직전/직후 시점의 Java 문자열 생성 지점 필터를 더 좁혀 평문 후보 확보
3. 필요 시 네이티브 계층은 크래시 없는 범위의 비침습 후킹만 추가

다음 세션 입력용 프롬프트:
```text
프로젝트: /Users/hm/Documents/GitHub/daiso-mcp

먼저 아래 문서들을 읽고 현재 상태를 이어서 진행해줘:
- docs/gs25-network-analysis-result.md
- docs/gs25-session-handoff-20260309.md
- docs/gs25-app-capture-attempt-log-20260308.md
- docs/gs25-android-bypass-capture-guide.md
- docs/gs25-app-scraping-preparation-guide.md

현재 상태 요약:
- b2c-apigw.woodongs.com / b2c-bff.woodongs.com 실접속은 pcap TLS SNI로 반복 확인됨(r7,r9~r13)
- 하지만 MITM 평문 requests.jsonl에서는 b2c 요청/응답(JSON 스키마) 미확보
- 평문으로는 tms31.gsshop.com/msg-api/* + m.woodongs.com/app_error/login 위주

이번 세션 목표:
1) r14 캡처 세션 시작 (mitmdump + frida + tcpdump 동시)
2) 내가 GS25 앱에서 재고 시나리오 1회 재현하면 즉시 분석
3) b2c-apigw/b2c-bff의 평문 API 후보(경로/메서드/파라미터) 확보 시도
4) 확보 실패 시에도 "왜 실패했는지"를 계층별(MITM/Java/Native/TLS)로 명확히 기록
5) 결과를 docs/gs25-network-analysis-result.md에 22) 섹션으로 업데이트

진행 방식:
- 내가 "재현 완료"라고 말하면 바로 해당 라운드 산출물 기준으로 요약/판정 업데이트
- 명령 실행 전에 현재 실행할 캡처 스택을 한 줄로 공지
- 최종 답변에는 다음 액션 3가지를 우선순위로 제시
```

## 22) 2026-03-09 r14 재현 1회 즉시 분석 결과 (mitmdump+frida+tcpdump)

실측 산출물:
- `captures/gs25-android-20260309-r14/raw.mitm`
- `captures/gs25-android-20260309-r14/requests.jsonl` (3건)
- `captures/gs25-android-20260309-r14/connects.jsonl` (37건)
- `captures/gs25-android-20260309-r14/errors.jsonl` (0건)
- `captures/gs25-android-20260309-r14/summary.json`
- `captures/gs25-android-20260309-r14/gs25-r14.pcap`

실행 조건:
- 캡처 스택: `mitmdump(:8082) + frida(java-net-hook + cronet-probe) + tcpdump(any)`
- 사용자 재현 입력: `재현 완료`

MITM 평문 관측:
- `requests.jsonl`은 3건만 기록
  - `POST /msg-api/deviceCert.m`
  - `POST /msg-api/setConfig.m`
  - `POST /msg-api/login.m`
  - host: `tms31.gsshop.com` 고정
- `connects.jsonl`에는 `m.woodongs.com` CONNECT 1건 확인
- `b2c-apigw.woodongs.com` / `b2c-bff.woodongs.com`의 평문 HTTP 요청/응답은 미확보

Frida 관측 요약:
- Java/Cronet 후킹 로딩 성공
  - `java.net.Socket.connect`, `HttpsURLConnection`, `UrlRequest$Builder` hook active
- 관측 URL은 `tms31.gsshop.com/msg-api/*` 및 광고/분석 계열 중심
- 이번 라운드에서도 `b2c-apigw`/`b2c-bff` URL/메서드/헤더/바디 평문 로그 미확보

PCAP 관측(TLS SNI):
- `b2c-apigw.woodongs.com` 2회
- `b2c-bff.woodongs.com` 4회
- `waiting.woodongs.com` 1회
- `m.woodongs.com` 2회
- `image.woodongs.com` 11회
- 예시(KST):
  - `2026-03-09 02:09:44` `b2c-bff.woodongs.com`
  - `2026-03-09 02:09:44` `b2c-apigw.woodongs.com`
  - `2026-03-09 02:09:48` `b2c-apigw.woodongs.com`

계층별 실패 원인 정리 (왜 평문 API가 안 잡혔는지):
- MITM 계층:
  - 다수 도메인에서 `client does not trust the proxy's certificate`가 반복 발생
  - 결과적으로 평문 가시성은 `tms31.gsshop.com/msg-api/*`로 수렴되고, `b2c-*`는 HTTP 레벨로 승격되지 않음
- Java 계층:
  - Java/Cronet 후킹은 동작하나, `b2c-*` 요청 생성 직전 객체/문자열이 관측되지 않음
  - 해석: Java 표준 경로 바깥(우회 경로) 또는 더 하위 계층에서 전송 구성 가능성
- Native 계층:
  - r14는 안정성 우선으로 네이티브 비침습 후킹을 확장하지 않음
  - 따라서 네이티브 TLS/소켓 라이브러리 경로에서의 평문 직전 데이터는 여전히 블라인드
- TLS 계층:
  - pcap SNI로 `b2c-apigw/b2c-bff` 실접속은 재확인됨
  - 그러나 SNI는 호스트 식별만 가능하며, 경로/메서드/파라미터/응답 JSON 스키마를 제공하지 않음

최종 판정(r14):
- 목표 1,2 수행 완료: 3중 캡처 시작 후 재현 1회 즉시 분석 완료
- 목표 3 미달성: `b2c-apigw/b2c-bff` 평문 API 후보(경로/메서드/파라미터) 확보 실패
- 목표 4 수행 완료: 실패 원인을 MITM/Java/Native/TLS 4계층으로 명시

## 23) 2026-03-09 r15 재현 1회 즉시 분석 결과 (GS host focus)

실측 산출물:
- `captures/gs25-android-20260309-r15/raw.mitm`
- `captures/gs25-android-20260309-r15/requests.jsonl` (6건)
- `captures/gs25-android-20260309-r15/connects.jsonl` (5건)
- `captures/gs25-android-20260309-r15/errors.jsonl` (0건)
- `captures/gs25-android-20260309-r15/summary.json`

실행 조건:
- 캡처 스택: `mitmdump(:8082, GS host focus) + frida(java-net-hook + cronet-probe)`
- 대상 호스트 필터: `woodongs.com,gsshop.com,gsretail.com,gs25.com`
- 사용자 재현 입력: `재현 완료`

MITM 평문 관측:
- `requests.jsonl` 6건 모두 `tms31.gsshop.com/msg-api/*`
  - `POST /msg-api/deviceCert.m` 2회
  - `POST /msg-api/setConfig.m` 2회
  - `POST /msg-api/login.m` 2회
- `connects.jsonl`:
  - `tms31.gsshop.com` CONNECT 4건
  - `m.woodongs.com` CONNECT 1건
- `b2c-apigw.woodongs.com` / `b2c-bff.woodongs.com` 평문 HTTP 요청/응답은 미확보

Frida 관측 요약:
- Java/Cronet 후킹은 정상 로드/동작
- URL 로그는 `tms31.gsshop.com/msg-api/*` + 광고/분석 도메인 중심
- `b2c-*`의 URL/헤더/바디 평문은 이번 라운드에서도 미포착

추가 제약/실패 기록:
- `tcpdump` 계층:
  - 기기에서 `/system/bin/tcpdump` 실행 시 `inaccessible or not found` 상태로 복구 실패
  - 따라서 r15에서는 TLS SNI(PCAP) 증거를 수집하지 못함
- `Native` 계층:
  - `gs25-b2c-native-net-hook.js` PID attach 시 앱 프로세스 즉시 종료(크래시) 재현
  - 안정성 문제로 r15 본 수집에서는 Native 후킹 제외

계층별 판정(r15):
- MITM: GS host focus 필터에도 평문은 `msg-api` 초기화 트래픽으로 수렴
- Java: 후킹은 정상이나 `b2c-*` 요청 생성 지점 평문 단서 없음
- Native: 현재 스크립트/주입 방식은 크래시 유발로 실사용 불가
- TLS: 이번 라운드는 tcpdump 실행 불가로 판정 보강 데이터 미수집

최종 판정(r15):
- 재현 1회 즉시 분석은 완료
- `b2c-apigw/b2c-bff` 평문 API 후보(경로/메서드/파라미터) 확보 실패
- 실패 사유는 `MITM 가시성 한계 + Native 크래시 + TLS 보조캡처 불능`의 복합 요인으로 정리

## 24) 2026-03-09 r16 재현 1회 즉시 분석 결과 (3중 캡처 복구)

실측 산출물:
- `captures/gs25-android-20260309-r16/raw.mitm`
- `captures/gs25-android-20260309-r16/requests.jsonl` (3건)
- `captures/gs25-android-20260309-r16/connects.jsonl` (3건)
- `captures/gs25-android-20260309-r16/errors.jsonl` (0건)
- `captures/gs25-android-20260309-r16/summary.json`
- `captures/gs25-android-20260309-r16/gs25-r16.pcap`

실행 조건:
- 최종 캡처 스택: `mitmdump(:8082, GS host focus) + frida(java-net-hook + cronet-probe) + tcpdump(any)`
- 사전 시도:
  - `native-sni-only` 스크립트 포함 spawn 시 앱 크래시 재현(Frida agent SIGSEGV)
  - 안정성 확보를 위해 본 수집에서는 Native 후킹 제외
- 사용자 재현 입력: `재현 완료`

MITM 평문 관측:
- `requests.jsonl` 3건 모두 `tms31.gsshop.com/msg-api/*`
  - `POST /msg-api/deviceCert.m`
  - `POST /msg-api/setConfig.m`
  - `POST /msg-api/login.m`
- `connects.jsonl`:
  - `tms31.gsshop.com` CONNECT 2건
  - `m.woodongs.com` CONNECT 1건
- `b2c-apigw.woodongs.com` / `b2c-bff.woodongs.com` 평문 HTTP 요청/응답은 미확보

Frida 관측 요약(Java/Cronet):
- 후킹 로딩 및 이벤트 출력은 정상
- `msg-api` URL 생성은 재확인
- `b2c-*` URL/헤더/바디 평문은 미포착

PCAP 관측(TLS SNI):
- `b2c-bff.woodongs.com` 10회
- `b2c-apigw.woodongs.com` 4회
- `waiting.woodongs.com` 2회
- `m.woodongs.com` 2회
- `image.woodongs.com` 11회
- 예시(KST):
  - `2026-03-09 02:20:48` `b2c-apigw.woodongs.com`
  - `2026-03-09 02:20:48` `b2c-bff.woodongs.com`
  - `2026-03-09 02:21:52` `b2c-apigw.woodongs.com`

계층별 판정(r16):
- MITM: GS focus + 재현 1회에서도 평문은 `msg-api` 초기화 경로로 수렴
- Java: 후킹은 정상이나 `b2c-*` 요청 생성 지점 평문 단서 미확보
- Native: 최소 후킹(`SSL_set_tlsext_host_name` only)도 앱 크래시 유발로 현 단계 비적합
- TLS: tcpdump 복구로 `b2c-apigw/b2c-bff` 실접속은 다시 강하게 재확인

최종 판정(r16):
- 3중 캡처 복구 및 재현 1회 즉시 분석은 완료
- `b2c-apigw/b2c-bff` 평문 API 후보(경로/메서드/파라미터)는 여전히 확보 실패
- 현재 병목은 `MITM/Java 평문 미노출 + Native 후킹 안정성`으로 수렴

## 25) 2026-03-09 r17 재현 1회 즉시 분석 결과 (msg-api d 파라미터 추적)

실측 산출물:
- `captures/gs25-android-20260309-r17/raw.mitm`
- `captures/gs25-android-20260309-r17/requests.jsonl` (3건)
- `captures/gs25-android-20260309-r17/connects.jsonl` (3건)
- `captures/gs25-android-20260309-r17/errors.jsonl` (0건)
- `captures/gs25-android-20260309-r17/summary.json`
- `captures/gs25-android-20260309-r17/gs25-r17.pcap`

실행 조건:
- 캡처 스택: `mitmdump(:8082, GS host focus) + frida(java-net-hook + msgapi-dparam-hook) + tcpdump(any)`
- Frida 추가 스크립트:
  - `scripts/frida/gs25-msgapi-dparam-hook.js`
  - 목적: `URLConnection.getOutputStream`/`OutputStream.write`에서 `d=` 전송 바디 직접 관찰
- 사용자 재현 입력: `재현 완료`

MITM 평문 관측:
- `requests.jsonl` 3건 모두 `tms31.gsshop.com/msg-api/*`
  - `POST /msg-api/deviceCert.m`
  - `POST /msg-api/setConfig.m`
  - `POST /msg-api/login.m`
- `connects.jsonl`:
  - `tms31.gsshop.com` CONNECT 2건
  - `m.woodongs.com` CONNECT 1건
- `b2c-apigw.woodongs.com` / `b2c-bff.woodongs.com` 평문 HTTP 요청/응답은 미확보

Frida 관측 요약:
- `gs25-msgapi-dparam-hook.js` 로딩 자체는 성공
  - `URLConnection.getOutputStream hook active`
  - `OutputStream.write hook active`
- 그러나 재현 구간에서 `MSGAPI_STREAM`/`MSGAPI_BODY` 로그는 미포착
- 해석:
  - `msg-api` 전송이 해당 Java I/O 경로를 직접 사용하지 않거나
  - 바디 생성/전송이 다른 계층(네이티브/내부 라이브러리)에서 처리될 가능성 높음

PCAP 관측(TLS SNI):
- `b2c-bff.woodongs.com` 11회
- `b2c-apigw.woodongs.com` 4회
- `waiting.woodongs.com` 3회
- `m.woodongs.com` 2회
- `image.woodongs.com` 9회

계층별 판정(r17):
- MITM: 여전히 `msg-api` 3종만 평문으로 노출
- Java: d-파라미터 전용 훅에서도 요청 바디 생성/전송 지점 미관측
- Native: 안정성 이슈로 본 라운드에 미적용(기존 attach/spawn 크래시 이력 유지)
- TLS: `b2c-apigw/b2c-bff` 실접속은 pcap SNI에서 재확인

최종 판정(r17):
- `msg-api d=` 직접 후킹 시도는 성공적으로 배치됐으나, 유의미한 d 바디 평문 로그는 확보 실패
- `b2c-apigw/b2c-bff` 평문 API 스키마(경로/메서드/파라미터) 확보는 여전히 실패

## 26) 2026-03-09 r18 재현 1회 즉시 분석 결과 (okio 경로 확장)

실측 산출물:
- `captures/gs25-android-20260309-r18/raw.mitm`
- `captures/gs25-android-20260309-r18/requests.jsonl` (3건)
- `captures/gs25-android-20260309-r18/connects.jsonl` (3건)
- `captures/gs25-android-20260309-r18/errors.jsonl` (0건)
- `captures/gs25-android-20260309-r18/summary.json`
- `captures/gs25-android-20260309-r18/gs25-r18.pcap`

실행 조건:
- 캡처 스택: `mitmdump(:8082, GS host focus) + frida(java-net + dparam + okio) + tcpdump(any)`
- Frida 추가 스크립트:
  - `scripts/frida/gs25-msgapi-okio-hook.js`
  - 목적: `okio.Buffer`/`okio.RealBufferedSink`/`okio.ByteString`에서 `d=` 페이로드 관찰
- 사용자 재현 입력: `재현 완료`

MITM 평문 관측:
- `requests.jsonl` 3건 모두 `tms31.gsshop.com/msg-api/*`
  - `POST /msg-api/deviceCert.m`
  - `POST /msg-api/setConfig.m`
  - `POST /msg-api/login.m`
- `connects.jsonl`:
  - `tms31.gsshop.com` CONNECT 2건
  - `m.woodongs.com` CONNECT 1건
- `b2c-apigw/b2c-bff` 평문 HTTP 요청/응답은 미확보

Frida 관측 요약:
- `gs25-msgapi-okio-hook` 로딩은 성공
- 그러나 재현 구간에서 `OKIO.writeUtf8`/`OKIO.writeBytes`/`RBS.*` 관련 유의미 로그 미포착
- `gs25-msgapi-dparam-hook`에서도 `MSGAPI_BODY` 미포착
- 해석:
  - msg-api 전송이 Java/okio 경로 바깥에서 처리되거나
  - 요청 바디가 후킹 시점 이전/이후 다른 포맷으로 변환될 가능성 높음

PCAP 관측(TLS SNI):
- `b2c-bff.woodongs.com` 10회
- `b2c-apigw.woodongs.com` 4회
- `waiting.woodongs.com` 2회
- `m.woodongs.com` 2회
- `image.woodongs.com` 11회
- 예시(KST):
  - `2026-03-09 02:27:45` `b2c-apigw.woodongs.com`
  - `2026-03-09 02:27:46` `b2c-bff.woodongs.com`
  - `2026-03-09 02:28:22` `b2c-apigw.woodongs.com`

계층별 판정(r18):
- MITM: 평문은 여전히 `msg-api` 3종으로 제한
- Java/okio: d-파라미터/전송 바디 관찰 실패(후킹 확장에도 미포착)
- Native: 안정성 이슈로 본 라운드 미적용
- TLS: `b2c-*` 실접속은 반복 재확인

최종 판정(r18):
- okio 경로 확장 후킹까지 적용했지만 `b2c-*` 평문 API 스키마 확보 실패
- 병목은 사실상 "전송 평문이 Java/okio 계층에서 노출되지 않음"으로 수렴

## 27) 2026-03-09 r19 재현 1회 즉시 분석 결과 (crypto window 5초)

실측 산출물:
- `captures/gs25-android-20260309-r19/raw.mitm`
- `captures/gs25-android-20260309-r19/requests.jsonl` (3건)
- `captures/gs25-android-20260309-r19/connects.jsonl` (3건)
- `captures/gs25-android-20260309-r19/errors.jsonl` (0건)
- `captures/gs25-android-20260309-r19/summary.json`
- `captures/gs25-android-20260309-r19/gs25-r19.pcap`

실행 조건:
- 캡처 스택: `mitmdump(:8082, GS host focus) + frida(java-net + crypto-window) + tcpdump(any)`
- Frida 추가 스크립트:
  - `scripts/frida/gs25-msgapi-crypto-window-hook.js`
  - 목적: `msg-api URL` 발생 후 5초 동안만 `Base64/Cipher/String` 이벤트 집중 수집
- 사용자 재현 입력: `재현 완료`

MITM 평문 관측:
- `requests.jsonl` 3건 모두 `tms31.gsshop.com/msg-api/*`
  - `POST /msg-api/deviceCert.m`
  - `POST /msg-api/setConfig.m`
  - `POST /msg-api/login.m`
- `connects.jsonl`:
  - `tms31.gsshop.com` CONNECT 2건
  - `m.woodongs.com` CONNECT 1건
- `b2c-apigw/b2c-bff` 평문 HTTP 요청/응답은 미확보

Frida 관측 요약:
- `WINDOW_MARK`는 정상 포착
  - `URL https://tms31.gsshop.com/msg-api/deviceCert.m`
  - `URL https://tms31.gsshop.com/msg-api/setConfig.m`
  - `URL https://tms31.gsshop.com/msg-api/login.m`
- 그러나 윈도우 내부 `WIN_BASE64_*`, `WIN_CIPHER_DOFINAL`, `WIN_STRING_BYTES` 이벤트는 미포착
- 해석:
  - msg-api 암복호 핵심이 Java 표준 `Base64/Cipher/String` 호출 경로 밖에 있거나
  - 호출되더라도 현재 후킹 타입/오버로드와 불일치 가능성 존재

PCAP 관측(TLS SNI):
- `b2c-bff.woodongs.com` 11회
- `b2c-apigw.woodongs.com` 5회
- `waiting.woodongs.com` 3회
- `m.woodongs.com` 2회
- 예시(KST):
  - `2026-03-09 02:31:10` `b2c-apigw.woodongs.com`
  - `2026-03-09 02:31:10` `b2c-bff.woodongs.com`
  - `2026-03-09 02:31:29` `b2c-apigw.woodongs.com`

계층별 판정(r19):
- MITM: 평문은 지속적으로 `msg-api` 3종에 한정
- Java: 시간창 기반 암복호 후킹에도 유효 페이로드 미포착
- Native: 안정성 이슈로 본 라운드 미적용
- TLS: `b2c-*` 실접속은 계속 재현

최종 판정(r19):
- crypto-window 전략으로도 `d=` 평문 생성/해석 체인 식별 실패
- `b2c-apigw/b2c-bff` 평문 API 스키마 확보는 여전히 실패

## 28) 2026-03-09 Frida-only pinning 감사 결과 (r20)

실측 산출물:
- `captures/gs25-android-20260309-r20-frida-only/frida.log`
- `captures/gs25-android-20260309-r20-frida-only/runbook.txt`
- `captures/gs25-android-20260309-r20-frida-only/start_time.txt`

실행 조건:
- 캡처 스택: `frida-only`
  - 프록시 미사용
  - tcpdump 미사용
- 스크립트:
  - `scripts/frida/gs25-frida-only-pinning-audit.js`
- 사용자 재현 입력: `재현 완료`

Pinning 관련 관측:
- 성공:
  - `SSLContext.init` 후킹 및 다회 intercept 확인
  - `SSLPeerUnverifiedException` / `WebView.onReceivedSslError` 훅 로드 성공
- 실패/제약:
  - `TrustManagerImpl.verifyChain` 오버로드 미스매치로 후킹 실패
  - `okhttp3.CertificatePinner` 클래스 미발견
- 런타임 징후:
  - 이번 라운드에서 `SSLPeerUnverifiedException` 실발생 로그는 미관측
  - `onReceivedSslError` 실발생 로그도 미관측

네트워크 단서 관측(Frida 내부):
- `NET_AUDIT URL`:
  - `https://tms31.gsshop.com/msg-api/deviceCert.m`
  - `https://tms31.gsshop.com/msg-api/setConfig.m`
  - `https://tms31.gsshop.com/msg-api/login.m`
- `Socket.connect`는 다수 외부 호스트 + `tms31.gsshop.com` 확인
- `b2c-apigw/b2c-bff` URL 문자열 또는 Socket host는 이번 Frida-only 로그에서 미포착

판정(r20):
- Frida-only 접근 자체는 가능하며 앱 안정성도 유지됨
- 다만 현재 훅 조합만으로는 `b2c-*` 평문 API 스키마 확보 불가
- pinning은 "존재 가능성 높음"으로 유지하되, 이번 라운드 단독으로 확정 판정은 불가
  - 이유: 핵심 pinning 훅(TrustManagerImpl/CertificatePinner)에서 부분 미적용 상태

## 29) 2026-03-09 Frida-only pinning deep-audit 결과 (r21)

실측 산출물:
- `captures/gs25-android-20260309-r21-frida-deep/frida.log`
- `captures/gs25-android-20260309-r21-frida-deep/runbook.txt`
- `captures/gs25-android-20260309-r21-frida-deep/start_time.txt`

실행 조건:
- 캡처 스택: `frida-only (deep-audit)`
  - 프록시 미사용
  - tcpdump 미사용
- 스크립트:
  - `scripts/frida/gs25-frida-only-pinning-deep-audit.js`
- 사용자 재현 입력: `재현 완료`

핵심 관측:
- `TrustManagerImpl.verifyChain` 실제 오버로드 동적 열거/후킹 성공
  - 시그니처:
    - `(java.util.List, java.util.List, java.lang.String, boolean, [B, [B)`
- Conscrypt/OpenSSL 계열 핸드셰이크 호출 다수 관측
  - `ConscryptEngineSocket.startHandshake`
  - `ActiveSession.onPeerCertificateAvailable`
- `SSLContext.init intercepted` 반복 관측
- `SSLPeerUnverifiedException` 실발생 로그는 미관측

네트워크 단서(Frida 내부):
- `NET_DEEP URL`로 `tms31.gsshop.com/msg-api/{deviceCert,setConfig,login}` 관측
- `Socket.connect`/`verifyChain host`는 다수 외부 호스트 + `tms31.gsshop.com` 관측
- 이번 라운드에서도 `b2c-apigw/b2c-bff` host 문자열은 Frida-only 로그에서 미포착

pinning 판정(r21):
- Java TLS 검증 경로(Conscrypt `verifyChain`)는 확실히 관측됨
- 그러나 pinning 실패를 직접 시사하는 예외(`SSLPeerUnverifiedException`)는 관측되지 않음
- 결론:
  - Java 레이어에서 "즉시 차단되는 pinning 실패" 증거는 없음
  - `b2c-*`는 여전히 Java 감시 범위 밖(네이티브/별도 채널) 가능성이 높음

## 30) 2026-03-09 Frida-only native connect/getaddrinfo 확장 결과 (r22)

실측 산출물:
- `captures/gs25-android-20260309-r22-frida-native/frida.log`
- `captures/gs25-android-20260309-r22-frida-native/runbook.txt`
- `captures/gs25-android-20260309-r22-frida-native/start_time.txt`

실행 조건:
- 캡처 스택: `frida-only (pinning-deep-audit + native-connect-audit)`
  - 프록시 미사용
  - tcpdump 미사용
- 스크립트:
  - `scripts/frida/gs25-frida-only-pinning-deep-audit.js`
  - `scripts/frida/gs25-frida-only-native-connect-audit.js`
- 사용자 재현 입력: `재현 완료`

핵심 관측:
- Java deep-audit 계층은 r21과 동일하게 정상 동작
  - `TrustManagerImpl.verifyChain` 반복 관측
  - `ConscryptEngineSocket.startHandshake` 반복 관측
  - `tms31.gsshop.com/msg-api/{deviceCert,setConfig,login}` URL 관측
- Native 계층:
  - `getaddrinfo`, `connect` 훅은 로드 성공
  - 그러나 `NATIVE_AUDIT getaddrinfo node=...` 로그에서 `woodongs/b2c/gsshop` 매칭 결과는 미관측
  - 해석:
    - 해당 경로가 `getaddrinfo` 대신 다른 resolver API를 사용할 가능성
    - 또는 native connect 대상이 IP 형태로만 전달되어 hostname이 보존되지 않을 가능성

판정(r22):
- Frida-only + native 확장에서도 `b2c-apigw/b2c-bff` host 단서는 미포착
- pinning/검증 경로는 Java Conscrypt에서 계속 관측되지만,
  `b2c` 채널 식별에는 아직 직접 연결되지 않음

## 31) 2026-03-09 Frida/Pinning 성공 사례 리서치 및 GS25 적용 전략

목적:
- "mitmproxy가 안 찍히는 문제"가 도구 한계인지, 앱의 pinning/우회탐지/네이티브 경로 이슈인지 분리 판단
- Frida-only로 실무에서 실제 성공하는 패턴을 확인하고 GS25에 바로 적용 가능한 절차로 정리

확인한 1차 근거:
- OWASP MASTG `MASTG-TECH-0012`:
  - 대부분 앱은 도구가 커버하는 API 범위에서는 pinning 우회가 빠르게 가능
  - 다만 커스텀 프레임워크/라이브러리 pinning은 수동 패치(리버싱)가 필요할 수 있음
  - Frida / Objection / Xposed 계열 방법을 명시
- OWASP MASTG `MASTG-TOOL-0140`:
  - `frida-multiple-unpinning`이 광범위 pinning 우회 스크립트로 소개됨
  - `SSLPeerUnverifiedException` 동적 탐지/패치 전략을 강점으로 명시
- HTTP Toolkit `frida-interception-and-unpinning`:
  - Android에서 `native-connect-hook`, `native-tls-hook`, `android-certificate-unpinning`, `...-fallback` 조합 제공
  - 난독화 케이스는 1회 실패 후 fallback 자동 패치로 다음 요청부터 성공하는 흐름을 공식적으로 안내
  - `android-disable-root-detection` 등 우회탐지 대응 스크립트 포함
- HTTP Toolkit `android-ssl-pinning-demo`:
  - "표준 Frida unpinning으로 대부분 버튼 성공, custom-pinned/Flutter는 별도 리버싱 필요"를 공개 데모로 명시
- `mitmproxy/android-unpinner`:
  - 비루팅 환경에서도 APK 최소 수정 + Frida gadget/JDWP 주입으로 pinning 해제 시나리오 제공
- `r0ysue/r0capture`, `fkie-cad/friTap`:
  - MITM 프록시 없이 Frida로 TLS 내부 평문/키 추출 계열 접근 사례 공개
  - 공통점: Java 레이어가 아닌 native TLS 함수/라이브러리 관측을 적극 활용

GS25 현 상태에 대한 해석(추론 포함):
- 관측 사실:
  - Java/Conscrypt `verifyChain`은 반복 관측(r21~r22)
  - `tms31.gsshop.com/msg-api/*`는 Frida Java 레이어에서 지속 관측
  - `b2c-apigw/b2c-bff`는 pcap TLS SNI로는 반복 확인되나, Java/MITM 평문에서 미확보
- 추론:
  - 단순 "mitmproxy 방식 문제" 단독보다는,
    `b2c` 요청이 Java 표준 HTTP 스택 밖(네이티브 TLS/별도 라이브러리/난독화된 커스텀 경로)일 가능성이 더 높음
  - pinning 존재 가능성은 여전히 있으나, 현재는 "pinning 실패 예외"보다 "관측 레이어 미스" 신호가 강함

다음 라운드 적용 전략(Frida 100% 기준):
1. unpinning 범위를 표준 + fallback + root-detection 우회까지 확장
   - 목적: 난독화 pinning/탐지로 인한 조기 차단 가능성 제거
2. Java URL/Body 훅과 분리하여 native TLS 평문 추출 축을 독립 운용
   - 목적: MITM/Java에서 안 보이는 `b2c` 채널을 TLS 내부에서 직접 포착
3. fd/타임라인 상관분석
   - 목적: tcpdump의 `b2c-*` 연결 시점과 Frida(native TLS 이벤트)를 1:1 매핑해
     최소한 "어느 계층까지 보이고 어디서 끊기는지"를 계층별로 확정

계층별 판정 업데이트(리서치 반영):
- MITM:
  - 일반론상 99% 앱은 시스템 CA/프록시로 커버 가능하나, pinning 앱은 예외(HTTP Toolkit/OWASP 근거)
  - GS25는 예외군에 속할 가능성이 높음
- Java:
  - Conscrypt 검증 경로는 이미 관측됨(후킹 유효)
  - 그러나 `b2c`는 Java 훅 범위 밖 경로 가능성 높음
- Native:
  - 실제 성공 사례 다수가 native TLS 훅/키 추출을 사용
  - GS25 핵심 과제도 native 평문 포착으로 이동하는 것이 타당
- TLS/pinning:
  - pinning 자체는 "있을 수 있음" 상태 유지
  - 다만 현재 실패 원인의 1순위는 pinning 단독보다 관측 계층 불일치

참고 링크:
- https://mas.owasp.org/MASTG/techniques/android/MASTG-TECH-0012/
- https://mas.owasp.org/MASTG/tools/android/MASTG-TOOL-0140/
- https://github.com/httptoolkit/frida-interception-and-unpinning
- https://github.com/httptoolkit/android-ssl-pinning-demo
- https://github.com/mitmproxy/android-unpinner
- https://github.com/r0ysue/r0capture
- https://github.com/fkie-cad/friTap

## 32) 2026-03-09 r23 Frida fullstack + tcpdump 결과

실측 산출물:
- `captures/gs25-android-20260309-r23-frida-fullstack/frida.log`
- `captures/gs25-android-20260309-r23-frida-fullstack/gs25-r23.pcap`
- `captures/gs25-android-20260309-r23-frida-fullstack/runbook.txt`
- `captures/gs25-android-20260309-r23-frida-fullstack/start_time.txt`

실행 조건:
- 시작 시각: `2026-03-09 02:58:30 KST`
- 캡처 스택: `frida(deep-pinning+native-connect+tls-keylog+root-bypass) + tcpdump`
- 스크립트:
  - `/tmp/frida/gs25-root-detection-bypass.js` (HTTP Toolkit root-detection bypass 기반)
  - `scripts/frida/gs25-frida-only-pinning-deep-audit.js`
  - `scripts/frida/gs25-frida-only-native-connect-audit.js`
  - `scripts/frida/gs25-b2c-tls-keylog.js`
- 사용자 재현 입력: `재현 완료`

핵심 관측:
- Frida deep-pinning 계층:
  - `TrustManagerImpl.verifyChain`/`Conscrypt*startHandshake` 다수 관측
  - `URL`은 `https://tms31.gsshop.com/msg-api/{deviceCert,setConfig,login}.m`만 관측
- Frida native-connect 계층:
  - `Socket.connect` 443 다수 관측
  - `tms31.gsshop.com`은 관측되나 `b2c-apigw/b2c-bff` host 문자열은 미관측
- Frida tls-keylog 계층:
  - `SSL_set_tlsext_host_name export not found`
  - `keylog exports not found: set=none, ctx_new=none`
  - 즉, 본 라운드의 keylog/SNI 네이티브 훅은 미적용 상태
- tcpdump(SNI) 계층:
  - `b2c-apigw.woodongs.com` / `b2c-bff.woodongs.com` 반복 재확인
  - 예시 시각(절대시각): `2026-03-09 02:59:34~02:59:35 KST`, `03:00:11~03:00:12 KST`

b2c 평문 API 확보 결과:
- 경로(path): 미확보
- 메서드(method): 미확보
- 파라미터(payload/query): 미확보

계층별 실패 원인 판정(r23):
- MITM:
  - 이번 라운드는 MITM 미사용(Frida-only 정책), 따라서 MITM 평문 관측값 없음
- Java:
  - Java/Conscrypt 훅은 정상 동작했으나 `b2c-*` URL/host를 직접 노출하지 않음
  - 평문 단서는 `tms31.gsshop.com/msg-api/*`로 한정
- Native:
  - `connect/getaddrinfo` 훅은 동작했지만 `b2c-*` hostname을 남기지 못함
  - 가능성:
    - 다른 resolver API 사용
    - connect 입력이 IP 위주여서 hostname 소실
- TLS:
  - 핵심 네이티브 TLS keylog/SNI 훅이 export 미스매치로 실제 적용 실패
  - 결과적으로 TLS 내부 평문/세션키 수집 경로 미확보

최종 판정(r23):
- 실접속(SNI) 재현은 성공했지만, Frida fullstack 조합에서도 `b2c-*` 평문 API 스키마 확보 실패
- 실패의 1차 원인은 pinning 단독보다
  `네이티브 TLS 훅 지점 불일치(라이브러리/export 차이)` + `hostname 전달 손실` 가능성이 큼

## 33) 2026-03-09 r24 Native TLS/Resolver 확장 재시도 결과

실측 산출물:
- `captures/gs25-android-20260309-r24-frida-nativeplus/gs25-r24.pcap`
- `captures/gs25-android-20260309-r24-frida-nativeplus/runbook.txt`
- `captures/gs25-android-20260309-r24-frida-nativeplus/start_time.txt`

실행 조건:
- 캡처 스택: `frida(modified-tls-keylog+native-resolver+pinning-deep+root-bypass) + tcpdump`
- 사용자 재현 입력: `재현 완료`
- 스크립트 변경:
  - `scripts/frida/gs25-b2c-tls-keylog.js`
    - TLS export 전역/모듈 스캔 추가
    - `SSL_write`/`SSL_read`에서 `SSL_get_servername` readback 훅 추가
  - `scripts/frida/gs25-frida-only-native-connect-audit.js`
    - `android_getaddrinfofornetcontext`, `gethostbyname` 훅 추가

핵심 관측:
- Native TLS 훅은 r23 대비 실제로 개선:
  - `SNI(libssl.so/SSL_set_tlsext_host_name) hook active`
  - `IO(libssl.so/SSL_write) hook active`
  - `IO(libssl.so/SSL_read) hook active`
  - `keylog hook active (ctx_new=libssl.so/SSL_CTX_new, set_cb=libssl.so/SSL_CTX_set_keylog_callback)`
  - `keylog callback installed on ctx=...` 다수 관측
- Resolver 확장:
  - `android_getaddrinfofornetcontext` 훅 성공
  - `res_nquery`는 export 미존재
- tcpdump(SNI):
  - `b2c-bff.woodongs.com` 다회
  - `b2c-apigw.woodongs.com` 다회
  - 예시 시각: `2026-03-09 03:17:19~03:17:21 KST`, `03:19:12~03:19:15 KST`

b2c 평문 API 확보 결과(r24):
- 경로(path): 미확보
- 메서드(method): 미확보
- 파라미터(payload/query): 미확보

계층별 실패 원인 판정(r24):
- MITM:
  - 본 라운드는 Frida + tcpdump만 사용 (MITM 평문 경로 없음)
- Java:
  - Conscrypt/verifyChain 감시는 정상이나 `b2c-*` URL/host 직접 노출 없음
  - 여전히 `tms31.gsshop.com/msg-api/*` 중심
- Native:
  - resolver/TLS 훅은 확장됐지만 `b2c-*` host를 Frida 로그로 직접 연결하지 못함
  - 가능성:
    - `SSL_get_servername` 단계에서 host 비노출(시점/구현 차이)
    - app 경로가 다른 TLS 라이브러리 또는 커스텀 네트워크 경유
- TLS:
  - `SSL_CTX_set_keylog_callback` 설치까지는 성공했지만 `[KEYLOG]` 라인 미포착
  - 즉 "콜백 설치 성공"과 "실제 keylog 라인 수신" 사이에서 단절

최종 판정(r24):
- r23 대비 진전:
  - "네이티브 TLS export 불일치" 문제는 해소(`libssl.so` 훅 성공)
- 그러나 목적 달성 실패:
  - `b2c-apigw/b2c-bff` 평문 API 스키마(경로/메서드/파라미터) 미확보
- 현재 병목:
  - keylog callback은 설치되지만 line 전달이 관측되지 않는 지점
  - `b2c` 트래픽의 TLS 내부 가시화가 아직 완성되지 않음

## 34) 2026-03-09 r25 TLS fd-mapping 강화 결과

실측 산출물:
- `captures/gs25-android-20260309-r25-fdmap/gs25-r25.pcap`
- `captures/gs25-android-20260309-r25-fdmap/runbook.txt`
- `captures/gs25-android-20260309-r25-fdmap/start_time.txt`

실행 조건:
- 캡처 스택: `frida(tls-fdmap+resolver+pinning-deep+root-bypass) + tcpdump`
- 사용자 재현 입력: `재현 완료`
- 스크립트 변경:
  - `scripts/frida/gs25-b2c-tls-keylog.js`
    - `SSL_set_fd` / `SSL_do_handshake` 훅 추가
    - `ssl↔fd↔host` 매핑 테이블 추가

핵심 관측:
- Frida 로드 단계:
  - `FD_BIND(libssl.so/SSL_set_fd) hook active`
  - `HANDSHAKE(libssl.so/SSL_do_handshake) hook active`
  - `keylog hook active (...SSL_CTX_set_keylog_callback)` + `keylog callback installed on ctx=...` 반복
- 그러나 런타임 로그에서
  - `[FD_BIND]`, `[HS]`, `[SNI]`, `[SNI_READBACK]`, `[KEYLOG]` 유의미 출력은 미확인
  - Java deep 계층은 기존과 동일하게 `tms31.gsshop.com/msg-api/*` 중심
- tcpdump(SNI):
  - `b2c-apigw.woodongs.com` / `b2c-bff.woodongs.com` 반복 재확인
  - 예시 시각: `2026-03-09 03:24:53~03:24:55 KST`, `03:25:18~03:25:20 KST`

b2c 평문 API 확보 결과(r25):
- 경로(path): 미확보
- 메서드(method): 미확보
- 파라미터(payload/query): 미확보

계층별 실패 원인 판정(r25):
- MITM:
  - 이번 라운드는 Frida + tcpdump만 운용 (MITM 평문 없음)
- Java:
  - pinning/handshake 감시는 안정적이나 `b2c` 직접 URL 노출 없음
- Native:
  - `SSL_set_fd`/`SSL_do_handshake` 훅 로드 성공에도 실매핑 이벤트 로그 미약
  - 실제 `b2c` 경로가 다른 SSL 심볼/다른 라이브러리 경유 가능성 잔존
- TLS:
  - keylog callback 설치는 성공하지만 keylog line 미수신 상태 지속
  - 결과적으로 TLS 복호화 체인 완성 실패

최종 판정(r25):
- r24 대비 훅 범위(`fd/handshake`)는 확대됐으나, `b2c` 평문 API 스키마 확보에는 실패
- 병목은 여전히 "`b2c` 세션이 현재 훅 포인트에서 실제 페이로드/키로그를 내주지 않는 지점"으로 수렴
