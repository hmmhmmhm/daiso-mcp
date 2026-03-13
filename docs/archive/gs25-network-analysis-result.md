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

## 35) 2026-03-10 r26 원격 adb 재현 결과

실측 산출물:

- `captures/gs25-android-20260310-r26/raw.mitm`
- `captures/gs25-android-20260310-r26/requests.jsonl`
- `captures/gs25-android-20260310-r26/connects.jsonl`
- `captures/gs25-android-20260310-r26/summary.json`
- `captures/gs25-android-20260310-r26/gs25-r26.pcap`
- `captures/gs25-android-20260310-r26/frida-attach.log`

실행 조건:

- 기기: Android 15 `SM-F926N` (`adb` 원격 제어 가능)
- 프록시: `172.30.1.27:8082`
- 재현 방식:
  - 홈 팝업 닫기
  - `재고찾기` -> `오감자` 최근 검색어 -> 첫 상품 상세 진입
  - 상품 상세의 `매장 또는 지역을 검색해 보세요` 검색 화면까지 진입
  - 홈 복귀 후 `주변매장` 진입 시도

핵심 관측:

- 원격 `adb`만으로 GS25 홈/검색/재고 상세까지 재현 가능함
- `mitmdump` 평문 요청은 이번에도 `tms31.gsshop.com/msg-api/*`만 확보
  - `POST /msg-api/deviceCert.m`
  - `POST /msg-api/setConfig.m`
  - `POST /msg-api/login.m`
- 위 3개 요청은 모두 `application/x-www-form-urlencoded`이지만 실제 페이로드는
  `d=` 단일 필드 기반의 base64/난독화 문자열 형태
- `connects.jsonl`에는 `m.woodongs.com` WebView CONNECT가 재확인됨
- `gs25-r26.pcap`의 `strings` 기준으로 아래 문자열이 재확인됨:
  - `b2c-apigw.woodongs.com`
  - `b2c-bff.woodongs.com`
  - `external.wdg.data.woodongs.com`
  - `waiting.woodongs.com`
  - `notice.woodongs.com`
  - `image.woodongs.com`

Frida 관측:

- attach 시도:
  - `android-ssl-bypass.js`
  - `gs25-b2c-java-net-hook.js`
  - `gs25-b2c-cronet-probe.js`
  - `gs25-b2c-native-sni-only.js`
- 결과:
  - 스크립트 로드는 일부 성공했으나 앱이 약 10초 내 `SIGSEGV (SEGV_ACCERR)`로 크래시
  - 즉, 현재 기기/앱 조합에서는 "네이티브 훅이 아니라 attach 자체"도 anti-Frida에 걸릴 가능성이 높음

추가 단서:

- logcat에 `Datadog` 계열 `Trust anchor for certification path not found` 오류가 반복됨
- 해석:
  - 앱 전체가 프록시 인증서를 전면 신뢰하는 상태는 아니며,
    분석/광고 SDK 일부는 여전히 MITM 인증서를 거부
  - 다만 `tms31.gsshop.com/msg-api/*`는 평문 요청/응답 확보 가능

계층별 판정(r26):

- MITM:
  - `msg-api` 3종은 평문 확보 성공
  - 그러나 `b2c-apigw/b2c-bff` 요청 자체는 여전히 평문 `requests.jsonl` 미포착
- Java:
  - 원격 UI 재현은 가능
  - Frida Java/Cronet attach는 앱 크래시로 안정 운용 실패
- Native:
  - `pcap strings`에서 `b2c-*` / `external.wdg.data.woodongs.com` 문자열 재확인
  - 다만 메서드/경로/파라미터 수준 식별에는 미도달
- TLS:
  - 프록시 경유 CONNECT/SNI 수준 증거는 강화
  - 평문 복호화 계층은 여전히 미완성

최종 판정(r26):

- 새로 확보된 사실:
  - 원격 `adb` 재현만으로도 실제 재고찾기 UI 플로우를 반복 실행할 수 있음
  - `external.wdg.data.woodongs.com` 문자열이 pcap에서 새로 확인됨
- 여전히 미확보:
  - `b2c-apigw/b2c-bff`의 실제 HTTP 메서드/경로/payload
- 현재 병목:
  - anti-Frida로 인한 attach 안정성 부족
  - `b2c` 트래픽이 MITM 평문 계층으로 올라오지 않음

Datadog/정적 분석 추가 단서:

- 앱 내부 Datadog 로그에서 `GoodsStockStoreSearchController.fetchCurrentPosition`
  호출 직후 실제 API 호출이 확인됨
  - `package:gstown/src/controller/store/goods_stock_store_search_controller.dart:248`
  - `package:gstown/src/controller/store/goods_stock_store_search_controller.dart:255`
  - `package:gstown/src/controller/store/goods_stock_store_search_controller.dart:147`
- 같은 세션 로그에 아래 호출이 남음
  - `GET https://b2c-bff.woodongs.com/api/bff/v2/store/stock`
  - 상태코드 `200`
- Datadog `application_log`에는 이 호출의 `request_e`, `response_e`가 함께 기록됨
  - 둘 다 base64 문자열
  - 샘플 `request_e` 디코드 길이는 `976 bytes`로 `16`바이트 정렬
  - 즉, 앱 또는 백엔드 응답 계층에 AES-CBC 계열 래핑이 있을 가능성이 높음
- APK 문자열에서도 동일 축의 암호화 유틸리티가 확인됨
  - `package:gstown/src/network/api_response_encryption_utility.dart`
  - `ApiResponseEncrypter`
  - `createEncrypter`
  - `AES_CBC_PKCS7Padding`
  - `request_e`
  - `response_e`
- 해석:
  - `재고찾기 -> 현재 위치 매장 조회`의 첫 본 호출은 `GET /api/bff/v2/store/stock`로 보는 것이 타당
  - 다만 HTTP 레벨의 query/body가 그대로 나가는 구조가 아니라,
    앱 내부 또는 응답 파싱 계층에서 별도 암복호화 유틸리티를 거칠 가능성이 높음
  - 따라서 이전의 `POST`/임의 payload 재현이 맞지 않았던 이유를 설명할 수 있음

추가 리플레이 결과 (2026-03-10):

- 앱 캡처에서 복원한 헤더(`Authorization`, `appinfo_*`, `user-agent: Dart/3.5`)로
  BFF를 직접 재현함
- `GET https://b2c-bff.woodongs.com/api/bff/v2/store/stock`
  - 무파라미터:
    - `500`
    - 내부 백엔드 URI 노출: `/thepop/v1/store/search/results/enhanced`
  - `latitude`, `longitude`, `keyword`만 넣으면:
    - 여전히 `500`
  - `latitude`, `longitude`, `keyword`, `realTimeStockYn=Y`를 함께 넣으면:
    - `200`
    - 응답 예시: `{"stores":[],"isRetry":false,"storeCount":0}`
  - `realTimeStockYn=N`이면 다시 `500`
  - `latitudeString`, `longitudeString` 조합도 `realTimeStockYn=Y`일 때 동일하게 `200`
- 현재까지 확인된 최소 정상 호출 조건:
  - `GET /api/bff/v2/store/stock`
  - 필수 후보:
    - `keyword`
    - `realTimeStockYn=Y`
    - 위치값 (`latitude`/`longitude` 또는 `latitudeString`/`longitudeString`)
- 단, 단순 상품명(`오감자`, `코카콜라`, `삼각김밥`, `신라면`, `바나나우유` 등)만으로는
  모두 `storeCount=0`
  - 즉 실제 앱 플로우는 `keyword` 외에 더 정밀한 상품 식별자
    (`GsSearchKeywordInfo`, `item_dcls_cd` 계열 추정) 또는 전처리 단계를 함께 사용할
    가능성이 높음

- `GET https://b2c-bff.woodongs.com/api/bff/v2/store/region/names`
  - 파라미터 없이 호출 시 `500`
  - `keyword=강남` -> `200`
    - 예시 응답에 `서울 강남구 (REGION)`, `강남역 2호선 (SUBWAY)` 포함
    - 좌표 필드명:
      - `XCoordination` = 경도
      - `YCoordination` = 위도
  - `keyword=역삼` -> `200`
  - `regionName=강남`, `query=강남`은 `500`
- 따라서 `근처매장`/`지역검색` 자동완성 단계는
  `GET /api/bff/v2/store/region/names?keyword=<검색어>`로 보는 것이 타당

- 보조 확인:
  - `GET /api/bff/v1/store/name?keyword=강남` -> `200 {"stores":[]}`
  - `GET /api/bff/v1/store` -> `500`
    - 내부 URI: `/thepop/v1/store/search/results`
  - 즉 일반 매장검색의 실제 유효 파라미터는 아직 미확보
  - 추가 리플레이에서 `GET /api/bff/v1/store?serviceCode=<값>&XCoordination=<경도>&YCoordination=<위도>`
    는 `200 {"stores":[]}`까지는 진입함
    - `serviceCode=1,2,3,4,5,10,20,25` 모두 동일
    - `latitude/longitude` 조합도 동일
    - `keyword=강남`을 추가해도 여전히 빈 배열
  - 반대로 `serviceCode` 없이 좌표/키워드만 넣으면
    - `/thepop/v1/store/search/results` 또는 `/thepop/v1/store/customer/wishes`
      내부 오류로 `500`
  - 해석:
    - `근처매장` 일반 매장목록 BFF는 `serviceCode`를 기본 전제로 두는 구조일 가능성이 높음
    - 다만 실제 매장목록이 채워지려면 추가 파라미터 또는 앱 내부 상태가 더 필요함

추가 adb/Datadog 캡처 (2026-03-10, adb 복구 후):

- 실제 앱 UI를 원격으로 재현해 다음 순서까지 확인함
  - `재고찾기`
  - 최근 검색어 `오감자`
  - 검색 결과 `총 3개의 상품`
  - `오리온)오감자50G`
  - 지도 화면 `목록보기`
- 검색 결과 진입 직전 Datadog 로그에서 상품 검색 본 호출이 추가로 확인됨
  - `POST https://b2c-apigw.woodongs.com/search/v3/totalSearch`
  - 상태코드 `200`
  - 동일하게 `request_e`, `response_e`가 함께 기록됨
  - 같은 `view.id`에서 바로 뒤이어
    `POST http://external.wdg.data.woodongs.com/api/addition/autocomplete/offline`
    `statusCode: 200`도 기록됨
  - 암호문 길이 비교:
    - `totalSearch`: `request_e 1920`, `response_e 4312`
    - `autocomplete/offline`: `request_e 1004`, `response_e 2072`
  - 해석:
    - `external.wdg.data.woodongs.com` 계열 자동완성만이 아니라,
      실제 상품 객체를 만드는 본 검색 API가 `search/v3/totalSearch`일 가능성이 높음
    - `store/stock`에 필요한 상품 식별자도 이 응답에서 유래할 가능성이 큼

- `오리온)오감자50G` 지도 화면에서 `목록보기`를 누르면
  텍스트 검색 없이도 위치 기반 매장목록이 즉시 렌더링됨
  - UI에서 실제 매장/수량 확인:
    - `GS25 안산중앙점` `391m` `6개`
    - `GS25 상록주공점` `401m` `12개`
    - `GS25 안산로데오점` `255m` `5개`
    - `GS25 안산주은점` `53m` `0개`
  - 해석:
    - `재고찾기`의 위치 기반 매장목록은 별도 `v1/store` 호출이 아니라
      `GET /api/bff/v2/store/stock` 응답만으로 구성될 가능성이 높음

- 리스트에서 `안산중앙점`을 선택하면 새 Datadog 로그 파일이 생성되며,
  별도 엔드포인트 대신 같은 호출이 다시 기록됨
  - `GET https://b2c-bff.woodongs.com/api/bff/v2/store/stock`
  - 상태코드 `200`
  - 이전 호출과 비교:
    - `request_e` 길이: 동일 (`1304`)
    - `response_e` 길이: 증가 (`19820 -> 30400`)
    - `request_e`, `response_e` 문자열 자체는 서로 다름
  - UI에서는 지도 하단 시트가 열리며
    - 선택 매장 `GS25 안산중앙점`
    - 인접 매장 `GS25 안산타워점`
    - `픽업주문` / `배달주문` 버튼
      가 노출됨
  - 해석:
    - 매장 선택 후 상세 표시도 전용 상세 API보다는
      `store/stock` 재호출 결과를 바탕으로 갱신되는 구조일 가능성이 높음

암호문 prefix 비교 (2026-03-10):

- `request_e`/`response_e`를 base64 디코드한 뒤 공통 prefix 길이를 비교함
- 검색 단계:
  - `totalSearch` 요청(1440 bytes)과 `autocomplete/offline` 요청(752 bytes)은
    앞 `384 bytes`가 완전히 동일
  - 두 요청의 암호문 헤더 48 bytes도 동일
  - 반면 두 응답의 공통 prefix는 `16 bytes`만 동일
- 재고 단계:
  - 첫 `store/stock` 요청과 매장 선택 후 `store/stock` 재요청은
    요청 앞 `352 bytes`가 동일
  - 두 요청의 암호문 헤더 48 bytes도 동일
  - 두 응답은 앞 `8320 bytes`가 동일하고,
    뒤쪽에서 선택 매장/하단 시트 관련 정보가 추가되는 형태로 보임
- 교차 비교:
  - `search` 계열 요청과 `stock` 계열 요청은 공통 prefix가 `0 bytes`
  - 즉 두 API군은 같은 암복호화 유틸리티를 쓰더라도
    실제 평문 스키마 또는 래핑 구조는 서로 다른 축으로 보는 것이 타당

`libapp.so` 정적 문자열 단서 (2026-03-10):

- 네이티브 split APK의 `lib/arm64-v8a/libapp.so` 문자열에서
  재고찾기/검색 관련 심볼과 필드명이 직접 확인됨
- 검색/상품 식별자 축:
  - `GsSearchKeywordInfo`
  - `GsSearchKeywordInfo.fromJson`
  - `_$GsSearchKeywordInfoFromJson`
  - `_$GsSearchKeywordInfoToJson`
  - `keywordInfo`
  - `documentId`
  - `productCode`
  - `itemCd`
  - `itemCode`
  - `itemCodeList`
  - `item_dcls_cd`
  - `keyword_result`
  - `org_keyword`
  - `keyword`
  - `/search/v3/totalSearch`
  - `/api/addition/autocomplete/offline`
- 재고/매장 축:
  - `/api/bff/v2/store/stock`
  - `realTimeStockYn`
  - `recommendedStore`
  - `selectedStore`
  - `recommendedStoreAndSelectedStore`
  - `selectedStoreWidget`
  - `GoodsStockSearchController`
  - `GoodsStockStoreSearchController`
  - `GoodsStockStoreSearchView`
- 지역검색 축:
  - `/api/bff/v2/store/region/names`
  - `StoreLocationSearchController`
  - `StoreRecommendationSearchController`
  - `StoreSearchMainController`
- 암복호화 축도 동일하게 재확인됨
  - `package:gstown/src/network/api_response_encryption_utility.dart`
  - `ApiResponseEncrypter`
  - `createEncrypter`
  - `AES_CBC_PKCS7Padding`
- 해석:
  - `store/stock` 리플레이에 필요한 후보 필드는
    단순 `keyword`만이 아니라
    `GsSearchKeywordInfo` 계열의 `documentId`, `productCode`,
    `itemCd`/`itemCode`, `itemCodeList`, `item_dcls_cd`,
    `keyword_result`, `org_keyword` 조합 중 일부일 가능성이 높음
  - 특히 `recommendedStoreAndSelectedStore` 문자열은
    매장 선택 후 동일 `store/stock` 재호출 가설과 잘 맞음

Amplitude 이벤트 캐시 분석 (2026-03-10):

- 루팅된 실기기에서 `/data/data/com.gsr.gs25/databases/com.amplitude.api`를 추출해
  `events` 테이블을 확인함
- `오감자` 재고찾기 플로우에서 다음 이벤트 페이로드가 남아 있었음
  - `[V] 재고찾기_검색결과`
    - `action`: `최근검색어`
    - `org_keyword`: `""`
    - `keyword`: `오감자`
    - `keyword_result`: `오감자`
  - `[V] 재고찾기_재고찾기지도`
    - `product_code`: `8801117752804`
    - `product_name`: `오리온)오감자50G`
    - `item_1st_category_code`: `13`
    - `item_2nd_category_code`: `53`
    - `item_3rd_category_code`: `01`
    - `item_4th_category_code`: `2118`
    - `store_keyword`: `""`
- 같은 패턴이 `추천검색어` 플로우 과거 이벤트에도 반복되어
  검색결과 화면과 지도 화면 사이에서
  `keyword` 계열 필드와 `product_code`/카테고리 필드가 결합된다는 점이 더 강해짐

`store/stock` 재리플레이 추가 결과 (2026-03-10):

- 위 Amplitude 캐시에서 확보한 `product_code=8801117752804`와 카테고리 코드를
  `GET /api/bff/v2/store/stock`에 다시 주입해 시험함
- 결과:
  - `product_code`, `productCode`, `itemCd`, `itemCodeList` 단독/조합:
    모두 `200`이지만 `storeCount=0`
  - `itemCode=8801117752804`:
    내부 URI `/thepop/v1/store/search/results/enhanced`에서
    `internal_server_error`
  - `keywordInfo` 또는 `searchKeywordInfo`에
    JSON 객체를 통째로 넣는 방식도 `storeCount=0`
- 해석:
  - `product_code`는 지도 진입 후 analytics용 공개 상품 식별자일 뿐,
    실제 재고조회 핵심 키는 여전히 별도 `itemCode` 계열일 가능성이 높음
  - 다만 `itemCode` 파라미터가 내부 enhanced 분기를 직접 타는 점은 확인되어,
    재고 API의 실질 키 이름이 `itemCode` 축이라는 단서는 더 강해짐

추가 배제 결과 (2026-03-11):

- 앱 내부 저장소 추가 확인:
  - `tms_1.0.db`
    - `TBL_LOGS`, `TBL_DATA`에는 재고찾기 payload나 `itemCode` 흔적 없음
  - `airbridge.db`
    - 홈 뷰/세션 수준 이벤트만 존재했고
      `오감자`, `product_code`, `itemCode`, `documentId` 관련 항목 없음
  - `shared_prefs`, `volley`, `WebView` 캐시, 일반 cache 문자열 검색에서도
    `오리온)오감자50G`, `8801117752804`, `itemCode`, `documentId` 흔적 미확인
- 암복호화 키 검증:
  - `request_e`를 `FlutterSharedPreferences`의
    `GsSecureSharedPreferencesAesKey/AesIV`로 복호화 시도했지만
    정상 평문이 나오지 않음
  - 즉 secure prefs AES 키와 API `request_e` 암복호화 키는 다른 축으로 보는 편이 맞음
- 웹 프런트 비교:
  - `https://m.woodongs.com/static/js/main.55ea391a.js.map` sourcemap은 확보했지만,
    그 번들에는 `totalSearch`, `itemCode`, `keywordInfo`, `documentId` 문자열이 보이지 않았음
  - 해석:
    - 모바일 웹 번들은 현재 앱 재고찾기 Flutter 로직의 직접 소스가 아니거나,
      검색/재고찾기 구현이 별도 번들 또는 네이티브/Flutter 쪽에 있음

추가 배제 결과 2 (2026-03-11):

- 런타임 설정 파일 추가 확인:
  - `/data/data/com.gsr.gs25/shared_prefs/ss_config.xml`
    - 서명/설치 정보와 디바이스 메타만 존재
  - `/data/data/com.gsr.gs25/shared_prefs/pref_tms.xml`
    - `pref_deviceid`, `devicecert_complete` 등만 존재
  - `/data/data/com.gsr.gs25/files/sp_global_file`
    - 광고 SDK용 `domain_index`, `mediation_info` 수준
  - Firebase Remote Config 활성값
    - `configs_key`가 빈 객체였고 env/API 관련 값 없음
- `apminsight` 런타임 파일 확인:
  - `/data/data/com.gsr.gs25/files/apminsight/RuntimeContext/*` 최신 파일을 추출해 확인
  - 포맷은 JSON이었지만 ByteDance/Pangle 계열 APM 메타데이터만 있었고
    `itemCode`, `documentId`, `오감자`, `store/stock`, `totalSearch`,
    `request_e`, `response_e` 관련 정보는 없었음
- 공개 웹 chunk 전수 확인:
  - `https://m.woodongs.com/asset-manifest.json` 기준 JS chunk 전체를 대상으로
    다음 exact string을 재검색함
    - `/api/bff/v2/store/stock`
    - `/api/bff/v2/store/region/names`
    - `/search/v3/totalSearch`
    - `/api/addition/autocomplete/offline`
    - `realTimeStockYn`
    - `keyword_result`
    - `documentId`
  - 결과:
    - 전부 `(none)`
  - 해석:
    - 공개 `m.woodongs.com` React 번들은
      현재 GS25 앱 재고찾기/근처매장 Flutter 구현과 직접 연결되지 않음
    - 웹 chunk 탐색은 우선순위를 낮춰도 됨
- 현재 남은 최우선 축:
  - `libapp.so`에서 재확인된
    `package:gstown/src/constants/gs_env.dart`,
    `flutter_dotenv`,
    `decryptBytesWithEnv`,
    `_environmentStringValue`,
    `_environmentKeyObjectValue`
  - 즉 `request_e/response_e` 암복호화는 secure prefs가 아니라
    env 또는 env 기반 key-object 축일 가능성이 가장 높음

내부 `thepop` 리플레이 및 모델명 추가 확인 (2026-03-11):

- 루팅된 실기기 런타임 값으로 앱 헤더 축을 복원해
  내부 `thepop` 후보 엔드포인트를 직접 재호출함
- 확인된 엔드포인트:
  - `GET /thepop/v1/store/customer/representations?latitude=37.3214823&longitude=126.8309767`
    - `200`
    - `data` 하위에 서비스별 representation 정보 반환
  - `GET /thepop/v1/stock/wdlvy/realTimeStock?...`
    - 단순 query 조합(`keyword`, `itemCode`, `productCode`, `itemCd`,
      `itemCodeList`, `documentId`)은 모두 `500 internal_server_error`
- `store/customer/representations` 응답에서 확인된 서비스 코드:
  - `gs25ReservationPickup.serviceCode = "10"`
  - `wdlvyGs25Delivery.serviceCode = "30"`
  - `wdlvyGs25Pickup.serviceCode = "31"`
  - `wine25Plus.serviceCode = "40"`
- 해석:
  - 기존 `/api/bff/v1/store`에서 `serviceCode` 유무에 따라 경로가 갈리던 현상과 맞물려,
    GS25 앱은 representation store/service-code 상태를 전제로
    재고/근처매장 플로우를 구성하는 것으로 보임
  - 반면 `thepop/v1/stock/wdlvy/realTimeStock`는
    단순 GET query만으로는 재현되지 않아,
    실제 앱은 별도 구조화된 요청 모델을 직렬화해 보내는 쪽일 가능성이 높음

재고 모델명 정적 확인 (2026-03-11):

- `libapp.so` 문자열에서 재고 전용 request/response 모델명이 직접 확인됨
  - `package:gstown/src/models/request/retrieve_gs25_reservation_real_stock_request.dart`
  - `package:gstown/src/models/request/retrieve_gs25_reservation_real_stock_request.g.dart`
  - `package:gstown/src/models/response/gs25_reservation_real_stock_response.dart`
  - `package:gstown/src/models/response/gs25_reservation_real_stock_response.g.dart`
  - `package:gstown/src/models/response/gs_wdlvy_real_time_stock_response.dart`
  - `package:gstown/src/models/response/gs_wdlvy_real_time_stock_response.g.dart`
- 관련 심볼:
  - `RetrieveGs25ReservationRealStockRequest`
  - `_$RetrieveGs25ReservationRealStockRequestToJson`
  - `Gs25ReservationRealStockData`
  - `Gs25ReservationRealStockResponse`
  - `GsWdlvyRealTimeStockResponse`
  - `retrieveGs25ReservationRealStock`
- 함께 보이는 주변 필드:
  - `searchKeywordInfo`
  - `keywordInfo`
  - `itemCodeList`
  - `item_dcls_cd`
  - `bffServiceCode`
  - `representationStoreYn`
  - `recommendedStoreAndSelectedStore`
  - `stockCount`
- 해석:
  - 재고 플로우는 이미 앱 내부에서
    `RetrieveGs25ReservationRealStockRequest -> toJson -> API 호출`
    구조로 구현돼 있을 가능성이 높음
  - 따라서 현재 병목은 "쿼리 파라미터 추정"이 아니라
    `RetrieveGs25ReservationRealStockRequest` 실제 필드 구성을 복원하는 일로 좁혀짐
  - 다음 우선순위는 `GsSearchKeywordInfo`와 이 request model 사이의 연결 필드를 더 찾아
    `POST body` 또는 암호화 전 request object를 근사하는 것

프록시 해제 후 Android raw capture 재점검 (2026-03-11):

- 실기기 글로벌 프록시 설정이 여전히 남아 있었음
  - `http_proxy = 172.30.1.27:8082`
  - 이 상태에서는 raw tcpdump도 실제 원격지가 아니라
    전부 로컬 프록시 `172.30.1.27:8082`로만 보였음
- 프록시를 `:0`으로 해제한 뒤 같은 플로우를 다시 캡처함
- 결과:
  - 시스템 전체 pcap에서는 `QUIC/HTTP3` 트래픽이 다수 관측됨
  - 다만 잡음이 매우 커서 전체 pcap만으로 GS25 본 세션을 즉시 분리하긴 어려웠음
- 대신 앱 UID(`10330`) 기준 소켓 스냅샷을 확인한 결과,
  GS25 앱은 캡처 시점 내내 다음 두 `443/TCP` 세션을 유지함
  - `35.82.104.186:443`
  - `216.239.36.223:443`
- 해석:
  - `216.239.36.223`는 구글 계열 대역으로 보이며,
    공통 플랫폼/부가 통신일 가능성이 높음
  - `35.82.104.186`은 AWS 계열 대역으로,
    GS25/woodongs 축 후보 세션으로 우선 추적 가치가 있음
  - 다만 이번 짧은 UI 전환 동안 `35.82.104.186` 단독 필터 pcap에는
    실제 패킷이 잡히지 않아, 상시 유지 세션 또는 다른 시점의 통신일 가능성도 남음
- 정리:
  - "프록시가 남아 있어서 raw capture가 왜곡됐다"는 병목은 제거됨
  - 다음부터는 프록시 없는 상태를 기준으로
    UID/iptables/owner 기반으로 GS25 프로세스 트래픽만 더 강하게 분리해야 함

클린 재실행 원격지 후보 추가 (2026-03-11):

- 앱을 `force-stop` 후 재실행한 직후 `uid=10330` 소켓을 다시 확인함
- 이 시점에서는 기존 `35.82.104.186`, `216.239.36.223` 외에도
  다음 원격지들이 함께 관측됨
  - `3.233.158.114:443` (AWS)
  - `35.155.53.189:443` (AWS)
  - `13.225.134.90:443` (AWS/CloudFront 계열)
  - `151.101.65.229:443` (Fastly 계열)
  - `23.209.95.10:443` (Akamai 계열)
  - 다수 `172.217.*`, `142.251.*`, `216.239.*` (Google 계열)
- 짧은 cold-start raw pcap(`13.7s`, `2507 packets`)에서
  AWS 후보만 오프라인 필터링해 본 결과:
  - `3.233.158.114:443`로 향하는 `RST/ACK` 1건만 확인
  - `35.155.53.189:443`는 해당 시간창에서 미관측
- 해석:
  - `3.233.158.114`는 앱 재시작 직후 정리되는 기존 세션 흔적일 수 있음
  - 즉 "AWS 대역이 GS25 후보"라는 가설은 유지되지만,
    cold start만으로는 활성 재고 플로우 세션을 특정하기 어려움
  - 다음 유효한 수집은
    cold start보다 `재고찾기 -> 상품 선택 -> 지도/매장상세` 시점에 맞춘
    짧은 window capture와 uid 소켓 스냅샷 결합

암복호화/내부 레이어 정적 해석 추가 (2026-03-11):

- `assets/flutter_assets/.env` 재확인 결과,
  현재 포함된 값은 모두 endpoint/environment 설정이었음
  - `API_URL=https://b2c-bff.woodongs.com`
  - `B2C_API_URL=https://b2c-apigw.woodongs.com`
  - `SEARCH_API_URL=http://external.wdg.data.woodongs.com`
  - `IMAGE_SEARCH_API_URL=http://external.wdg.image.search.woodongs.com`
  - 그 외 `M_WOODONGS_WEB_URL`, `CDN_URL`, `POSTBOX_*`, `SENDY_API_URL`
- 즉 `.env`에는 API secret 자체보다
  앱이 어떤 backend 군을 쓰는지에 대한 라우팅 정보가 담겨 있음

- `libapp.so` 문자열 기준 BFF/암호화 레이어는 다음 순서로 보임
  - `init:_encryptionKey`
  - `init:b2cApiDio`
  - `init:_bffApiInterceptor`
  - `init:appKeyInterceptor`
  - `AccessTokenInterceptor`
  - `requestInterceptorWrapper`
  - `responseInterceptorWrapper`
  - `ApiResponseEncrypter`
  - `decryptBytesWithEnv`
- 함께 확인되는 필드/헤더 후보:
  - `xTenantId`
  - `Headers`
  - `content-length`
  - `application/x-www-form-urlencoded`
- 해석:
  - 재고/검색 BFF 호출은 Flutter `Dio` 인스턴스(`b2cApiDio`) 위에서
    여러 interceptor가 순차 적용되는 구조일 가능성이 높음
  - `request_e` / `response_e`는 Java/Android 공용 계층보다는
    Flutter `api_response_encryption_utility.dart` 축에서 만들어지는
    request/response 래핑 키일 가능성이 더 높아짐
  - `secure prefs` AES 키와는 별도이며,
    `_encryptionKey + decryptBytesWithEnv + Dio interceptor` 조합이
    현재 가장 유력한 평문 통과 지점

- 현재 우선순위 정리:
  - 네트워크 캡처보다
    `b2cApiDio -> interceptor chain -> ApiResponseEncrypter/decryptBytesWithEnv`
    정적 복원 또는 런타임 후킹 쪽이 복호화 가능성을 더 빠르게 올릴 수 있음

추가 정적 단서: tenant/appKey/no-auth client 축 (2026-03-11):

- `libapp.so`에서 다음 문자열을 추가 확인함
  - `init:appKeyApi`
  - `_appKeyApiInstance`
  - `readXTenantId`
  - `_b2cApiNoAuthorizationDio`
  - `init:_b2cApiNoAuthorizationDio`
- 해석:
  - `b2cApiDio` 외에 `Authorization` 없이도 동작하는 별도 Dio 인스턴스가 존재할 가능성이 높음
  - `appKey`와 `xTenantId`는 access token과 분리된 초기화/주입 축일 수 있음
  - 즉 실제 호출 순서는
    `appKeyApi/readXTenantId -> _encryptionKey 초기화 -> b2cApiDio/_b2cApiNoAuthorizationDio -> interceptor chain`
    에 가까울 가능성이 높아짐

- `appKeyInterceptor`, `xTenantId` 주변에서 다음 고정 hex 문자열도 관측됨
  - `<REDACTED_HASH_SAMPLE_20B_A>` (`20 bytes`)
  - `<REDACTED_HASH_SAMPLE_20B_B>` (`20 bytes`)
  - `<REDACTED_HASH_SAMPLE_48B>` (`48 bytes`)
  - `<REDACTED_HASH_SAMPLE_81B>` (`81 bytes`)
- 메모:
  - 앞의 두 `40-hex` 값은 길이상 AES key보다는
    `tenant/app key/hash id` 성격의 고정 식별자일 가능성이 더 높음
  - 뒤의 두 긴 hex는 정확한 용도 미상이며,
    정적 상수/서명 재료/난독화 blob 후보로만 보류
  - 현재 시점에서는 이들을 복호화 키로 단정하지 않음

- 레포 내 기존 Frida 스크립트 점검 결과:
  - `scripts/frida/gs25-frida-only-pinning-audit.js`
  - `scripts/frida/gs25-b2c-java-net-hook.js`
  - `scripts/frida/gs25-b2c-cronet-probe.js`
  - `scripts/frida/gs25-b2c-native-net-hook.js`
  - `scripts/frida/gs25-b2c-focused-dump.js`
  - `scripts/frida/gs25-b2c-stacktrace-dump.js`
  - 전반적으로 `pinning/network/url/header/string/json` 축 후킹은 준비돼 있음
  - 반면 `appKeyApi`, `readXTenantId`, `_b2cApiNoAuthorizationDio`,
    `ApiResponseEncrypter`, `decryptBytesWithEnv`를 직접 노리는
    전용 후킹은 아직 없음
- 정리:
  - 현재 가장 부족한 지점은 "네트워크 생성 직전"보다
    "BFF client 초기화 직전/직후" 관찰임
  - 다음 실기기 라운드에서는 `tenant/appKey/no-auth Dio` 축을 먼저 확인한 뒤
    `request_e/response_e` 래핑 함수로 내려가는 순서가 합리적임

- 후속 조치:
  - 위 공백을 메우기 위해
    `scripts/frida/gs25-b2c-bootstrap-probe.js`를 추가함
  - 이 스크립트는 다음 경계만 선별 관찰함
    - `io.flutter.plugin.common.MethodChannel.invokeMethod`
    - `io.flutter.plugin.common.MethodCall.argument`
    - `io.flutter.embedding.engine.dart.DartMessenger.send`
    - `android.app.SharedPreferencesImpl.getString`
    - `okhttp3.Request$Builder.addHeader`
    - `org.chromium.net.UrlRequest$Builder.addHeader`
  - 목적:
    - `appKey`, `xTenantId`, `Authorization`, `deviceId`,
      `request_e/response_e` 계열 키가 Java/Flutter 경계 또는 헤더 주입 시점에
      실제로 드러나는지 확인
  - 한계:
    - Dart 내부 `ApiResponseEncrypter`/`decryptBytesWithEnv`를 직접 후킹하는 것은 아니며,
      anti-Frida 환경에서 우선 시도할 수 있는 저부하 보조 관찰 스크립트임

실기기 경량 attach 재검증 (2026-03-11):

- `frida-server`를 다시 기동하고 `adb forward tcp:27042 tcp:27042` 후
  동일 PID(`com.gsr.gs25`)에 다음 스크립트를 동시 attach함
  - `scripts/frida/gs25-b2c-bootstrap-probe.js`
  - `scripts/frida/gs25-b2c-cronet-probe.js`
  - `scripts/frida/gs25-b2c-java-net-hook.js`
- 결과:
  - 이번에는 이전과 달리 attach 직후 즉시 크래시하지 않았음
  - 즉 "모든 Frida attach가 즉시 죽는다"보다는
    "무거운 훅/특정 타이밍 attach에서 크래시 확률이 높다" 쪽으로 해석을 조정하는 편이 맞음

- 런타임에서 확인된 사실:
  - `okhttp3.Request$Builder`는 클래스 자체가 로드되어 있지 않았음
    - `ClassNotFoundException`
  - 반면 `org.chromium.net.UrlRequest$Builder`는 정상 후킹 가능했음
  - 따라서 현재 실행 경로 기준 Java 계층에서는
    OkHttp보다 Cronet 쪽이 더 현실적인 후보로 보임

- `재고찾기 -> 상품 선택` 과정에서
  `com.pichillilorenzo/flutter_inappwebview_2` 채널이 실제로 관측됨
  - `MethodChannel.invokeMethod`
    - `onLoadStart`
    - `onUpdateVisitedHistory`
    - `onPageCommitVisible`
    - `onTitleChanged`
    - `onLoadStop`
  - URL은 모두 `data:text/html;charset=utf-8,...` 형태였음
- UI dump 기준으로도 상품 상세/지도 영역에 `android.webkit.WebView`가 존재했음
- 해석:
  - 재고찾기 상품 상세/지도 화면은 완전한 네이티브 위젯만이 아니라
    Flutter `inappwebview` 위에서 로컬 `data:` HTML을 띄우는 구간이 있음
  - 즉 매장 지도/목록 렌더링 일부는
    "웹뷰 + JS bridge + 앱 런타임 데이터 주입" 구조일 가능성이 높아짐

- 같은 세션에서 실제로 재현한 UI:
  - 홈 `재고찾기`
  - 검색 결과 `불고기 버거`
  - 첫 상품 `리얼)불고기버거(1980원)`
  - 상세 화면의 `목록보기`
  - 매장 리스트 화면 (`안산주은점`, `안산로데오점`, `안산중앙점`, `상록주공점` 등)
- 이번 플로우에서는 매장 리스트가 모두 `0개 / 재고 준비중`으로 렌더링됐음

- 한계:
  - 위 attach 세션 동안에도 `Cronet.header`, `Cronet.method`, `URL`, `Socket.connect`
    수준의 직접적인 `woodongs/b2c` 로그는 잡히지 않았음
  - 가능한 해석:
    - attach 시점 이전에 핵심 요청이 이미 끝났거나
    - 요청이 Dart/native 계층에서 만들어져 Java `UrlRequest$Builder`까지 안 내려오거나
    - 웹뷰는 로컬 `data:` HTML만 받고 실제 데이터는 앱이 별도 채널로 주입하는 구조일 수 있음
- 정리:
  - attach 안정성은 이전보다 나아졌음
  - 그러나 현재 가장 강한 새 단서는
    "`재고찾기 상세/지도`가 `flutter_inappwebview` + `data:` HTML 경로를 실제로 쓴다"는 점
  - 다음 우선순위는 `WebView.loadDataWithBaseURL` / `addJavascriptInterface` /
    JS bridge 메시지 축을 직접 보는 것

WebView bridge 전용 프로브 추가 및 1차 실측 (2026-03-11):

- 위 가설을 검증하기 위해
  `scripts/frida/gs25-webview-bridge-probe.js`를 추가함
- 후킹 대상:
  - `android.webkit.WebView.addJavascriptInterface`
  - `android.webkit.WebView.loadUrl`
  - `android.webkit.WebView.loadData`
  - `android.webkit.WebView.loadDataWithBaseURL`
  - `android.webkit.WebView.evaluateJavascript`
  - `android.webkit.WebView.postWebMessage`
  - `android.webkit.WebMessagePort.postMessage`

- 실기기 attach 결과:
  - 스크립트 자체는 안정적으로 attach됨
  - 홈 화면에서는 광고 WebView가 먼저 강하게 관측됨
    - `googleAdsJsInterface`
    - `https://googleads.g.doubleclick.net/.../native_ads.html`
    - `google.afma.*`
    - `omidBridge.*`
- 해석:
  - GS25 앱은 홈 단계부터 광고 WebView를 적극 사용하므로,
    WebView 전역 후킹은 그대로 두면 `AFMA/OMID` 노이즈가 매우 큼
  - 따라서 다음 라운드에서는
    `googleads.g.doubleclick.net`, `google.afma`, `omidBridge`를 제외하고
    `data:text/html`, `flutter_inappwebview`, `woodongs`, `stock`, `store` 축만 남기는
    필터링이 필요함

- 현재 판정:
  - `WebView` 축은 유효한 관찰 지점이 맞음
  - 다만 "GS25 재고 상세/지도 WebView"와
    "홈 광고 WebView"를 먼저 분리해야 유의미한 payload가 보임

WebView 필터링 후 상세/지도 JS 주입 확인 (2026-03-11):

- `gs25-webview-bridge-probe.js`에 광고 노이즈 필터를 추가함
  - 제외:
    - `googleads.g.doubleclick.net`
    - `google.afma`
    - `omidBridge`
    - `googleAdsJsInterface`
- 필터 적용 후 홈 광고 WebView 로그는 사실상 사라졌고,
  재고찾기 상세/지도 흐름의 JS 주입만 관찰할 수 있게 됨

- 실기기 재현:
  - `재고찾기`
  - 검색 결과 `불고기 버거`
  - 첫 상품 `리얼)불고기버거(1980원)`
  - 상세 지도 화면
  - `목록보기`
  - 첫 매장 선택

- 상품 상세 진입 직후 확인된 `evaluateJavascript` 호출:
  - `setMyLocationMarker(37.3177334, 126.8414634, 0.0)`
  - `setCenter(37.3177334, 126.8414634)`
  - `setAllStoreMarker([...])`
- `setAllStoreMarker([...])` 배열 내부에서 다음 필드가 직접 확인됨
  - `storeCode`
  - `serviceCode`
  - `balloonText`
  - `latitude`
  - `longitude`
  - `enable`
  - `outstandingStoreType`
  - `isFavoriteStore`
- 샘플 값:
  - `{"storeCode":"VN115","serviceCode":"01","balloonText":"0개","latitude":37.313957827838635,"longitude":126.83910631508633,"enable":false,"outstandingStoreType":"none","isFavoriteStore":false}`
  - `{"storeCode":"VKA62","serviceCode":"01","balloonText":"0개","latitude":37.32015040862616,"longitude":126.84486673888017,"enable":false,"outstandingStoreType":"none","isFavoriteStore":false}`
- 같은 플로우에서 전체 5건 배열도 다시 확보함:
  - `VN115` / `01` / `0개` / `(37.313957827838635, 126.83910631508633)`
  - `VKA62` / `01` / `0개` / `(37.32015040862616, 126.84486673888017)`
  - `V8W74` / `01` / `0개` / `(37.318769344413546, 126.83724981724001)`
  - `VI383` / `01` / `0개` / `(37.31798980300143, 126.83861565896433)`
  - `VE463` / `01` / `0개` / `(37.31824253900691, 126.84142101676044)`

- 매장 리스트에서 첫 매장을 선택한 뒤 추가로 확인된 `evaluateJavascript` 호출:
  - `setAllStoreMarker([...])` 재호출
  - `onMarkerClick("01", "VE463", true, false, true)`
  - `setCenter(37.31824253900691, 126.84142101676044)`
  - `setLevel(3, false)`
- 해석:
  - 재고찾기 지도/목록의 실제 매장 데이터는
    WebView 쪽으로 "렌더링 직전" JS 함수 인자로 직접 주입됨
  - 즉 `request_e/response_e`를 아직 복호화하지 못해도,
    적어도 매장 코드/서비스 코드/좌표/재고 텍스트는
    앱 -> WebView 경계에서 평문으로 확보 가능하다는 뜻
  - `onMarkerClick("01", "VE463", ...)`로 보아
    매장 선택 상태도 WebView 내부 상태가 아니라
    앱이 store/service 식별자를 다시 넘겨 제어하는 구조임

- 현재 의미:
  - 완전한 네트워크 payload 복호화는 아직 아니지만,
    `store/stock` 응답에서 소비되는 핵심 프런트엔드 payload 일부를
    WebView JS 인자 수준에서 확보하는 데 성공함
  - 다음 우선순위는
    `setAllStoreMarker` 전체 배열과
    검색 상품 식별자(`itemCode` 계열)가 어떤 JS/bridge 인자로 넘어오는지 더 좁히는 것

WebView JS->앱 브리지 콜백 직접 캡처 (Round 34, 2026-03-11):

- 추가 후킹:
  - `com.pichillilorenzo.flutter_inappwebview_android.webview.JavaScriptBridgeInterface._callHandler`
  - 스크립트: `scripts/frida/gs25-webview-callhandler-probe.js`

- 캡처 성공 이벤트:
  - `onMarkerClick`
    - `arg2=["01","VE463"]`
  - `onDragStart`
    - `arg2=["(37.31823797813371, 126.84141357702242)"]`
  - `onDragEndOrZoomChangedAndAnimated`
    - `arg2=[3,"(37.318237947893095, 126.84139101376316)"]`
  - `callAsyncJavaScript`
    - `arg2` 내부 `resultUuid`가 `evaluateJavascript` 로그와 동일

- 의미:
  - 기존에 확인한 `앱 -> WebView (setAllStoreMarker/onMarkerClick/setCenter/setLevel)`뿐 아니라,
    `WebView -> 앱 (_callHandler)` 경로도 실측으로 닫힘
  - 즉 재고찾기 지도 상호작용은 양방향 브리지 구조이며,
    리플레이 핵심 입력은 최소 `serviceCode/storeCode/zoomLevel/latlng` 조합으로 요약 가능

Round 35 추가 확인 (2026-03-11):

- `오리온)오감자버터갈릭64G` 상세에서 다른 매장 선택 시,
  `evaluateJavascript`로 아래 순서가 재확인됨:
  - `setAllStoreMarker([...])` (7개 매장)
  - `onMarkerClick("01", "VI383", true, false, true)`
  - `setCenter(37.31798980300143, 126.83861565896433)`
  - `setLevel(3, false)`
  - `setTouchable(false, false)` -> `setTouchable(true, true)`

- 이번 `setAllStoreMarker`에서 추가로 관찰된 storeCode:
  - `VKX22`, `V6J73`, `VMM47` (기존 `VE463`, `VI383`, `VN115`, `V8W74`와 함께)
  - 재고 텍스트 예시: `4개`, `1개`, `0개`

- 해석:
  - 매장 전환은 단순 마커 포커스 변경이 아니라,
    앱이 marker set 전체와 선택 상태/화면 제어를 WebView에 재주입하는 구조
  - 따라서 네트워크 복호화 전 단계에서도
    매장 리스트/선택 상태를 상당 부분 재구성 가능

Round 36: 리플레이용 JSON 추출기 검증 (2026-03-11):

- 추가 스크립트:
  - `scripts/frida/gs25-webview-replay-extract.js`
- 출력 포맷:
  - `[GS25_REPLAY] {"t":"<event>","ts":<unix_ms>,"payload":{...}}`
- 파싱 대상:
  - `setAllStoreMarker`, `onMarkerClick`, `setCenter`, `setLevel`, `setTouchable`

- 실측:
  - 상세 지도 진입 직후:
    - `center` + `markers(5건)` 자동 출력
  - 목록보기에서 매장 선택 후:
    - `markers(7건)` 재주입 자동 출력
    - `marker_click(serviceCode=01, storeCode=VI383)` 출력
    - `center`, `level(3,false)`, `touchable(false,false -> true,true)` 출력

- 의미:
  - 이제 WebView 경계 payload를 사람이 문자열로 해석하지 않고
    구조화 JSON으로 수집 가능
  - 다음 단계는 이 JSON을 리플레이 파라미터 파일(`stores`, `selection`, `mapState`)로
    바로 변환하는 스크립트 연결

## 37) 2026-03-12 환경 재검증 + Ghidra 병행 분석 시작

목표:

- WebView 리플레이 자동화 파이프라인이 여전히 즉시 attach 가능한지 재확인
- Ghidra 기반 정적분석으로 `GS25 재고 API/암복호화 경로` 후보 식별 시작

실행 결과:

- 도구/연결 상태
  - `frida-mcp` 설치 확인 완료 (`0.1.1`)
  - `adb devices -l`에서 실기기 1대 확인
  - `adb forward tcp:27042 tcp:27042` 적용
  - `frida-ps -H 127.0.0.1:27042 -ai`에서 `com.gsr.gs25` 식별

- 캡처 러너 실행
  - 앱 PID: `26046`
  - `scripts/gs25-webview-replay-capture.sh --host 127.0.0.1:27042` 실행
  - 산출물:
    - `captures/gs25-replay-20260312-102623/frida-replay-raw.log`
    - `captures/gs25-replay-20260312-102623/gs25-replay-events.jsonl` (0 lines)
  - 판정:
    - attach/주입은 성공
    - UI 재현 단계 미수행으로 `markers/marker_click/center/level/touchable` 이벤트 미수집

Ghidra 병행 분석:

- 분석 대상 추출
  - `tmp/gs25-apk/split_config.arm64_v8a.apk`에서
    - `tmp/gs25-apk/lib/libapp.so`
    - `tmp/gs25-apk/lib/libnms.so`
      를 추출

- `libapp.so` 문자열 기반 단서
  - 모델/요청:
    - `retrieve_gs25_reservation_real_stock_request.dart`
    - `Gs25ReservationRealStockData`
    - `B2cBaseResponse`, `B2cBaseResponseData`
  - 네트워크/인터셉터:
    - `ApiResponseEncryptionConverter`
    - `responseInterceptorWrapper`
    - `B2C_API_URL`
    - `B2C_REFRIGERATOR_API_URL`
    - `buildB2cRefrigeratorApiServerAddressSetting`
  - 경로 문자열:
    - `/catalog/v1/gs25/reservation/items`
    - `/refrigerator/v1/wine25/stock/infm/`
    - `/refrigerator/v1/shopping/lunchbox/reservation/orders`

- `libnms.so` Ghidra 디컴파일 단서
  - `JNI_OnLoad` 디컴파일 성공
    - 초기화 이후 간접 점프 테이블 호출 형태 확인
  - `FUN_00115134`
    - 바이트 단위 XOR 복호화/디코드 성격 함수 확인
  - 현재 `libnms.so` 문자열에서 `frida/root/magisk/xposed` 명시 키워드는 미확인

해석:

- 앱 핵심 비즈니스/요청 모델은 `libapp.so(Flutter AOT)`에 있고,
  네이티브 보안/우회 저항 일부만 `libnms.so`에서 담당하는 구조일 가능성이 높음
- 네트워크 평문 미확보 상태에서도
  `libapp.so` 문자열 단서 + WebView replay 이벤트를 결합하면
  `요청 모델명/응답 모델명/지도 상호작용 파라미터` 축의 역추적이 가능함

다음 액션:

1. UI 재현 1회와 동시에 replay-capture를 다시 수행해
   `gs25-replay-events.jsonl` 이벤트 5종을 채우고 params JSON 생성
2. `libapp.so` 문자열 인덱스 기준으로
   `ApiResponseEncryptionConverter`, `responseInterceptorWrapper` 주변 실행 컨텍스트를
   Frida 로그 포인트에 매핑
3. `libnms.so`에서는 `JNI_OnLoad` 호출 체인 기준으로
   `RegisterNatives`/검증 루틴 후보를 추가 디컴파일해
   anti-hook 우회 포인트를 정리

## 38) 2026-03-12 리플레이 핵심 이벤트 검증 자동화 추가

변경:

- `scripts/gs25-replay-events-to-params.mjs`에 핵심 이벤트 검증 로직 추가
  - 신규 옵션: `--strict-core`
  - 검증 대상 5종:
    - `markers`
    - `marker_click`
    - `center`
    - `level`
    - `touchable`
  - 출력 JSON에 `validation` 필드 추가:
    - `missingCoreEventTypes`
    - `isCoreReplayReady`

실행 확인:

- 대상: `captures/gs25-replay-20260312-102623/gs25-replay-events.jsonl`
  - 결과: 이벤트 자체 0건으로 변환 실패 (`exit=2`)
- 부분 샘플(JSONL 2건) + `--strict-core`:
  - 누락 판정:
    - `marker_click`, `level`, `touchable`
  - 종료코드:
    - `exit=3` (핵심 이벤트 누락)

의미:

- 이제 "완전 리플레이 가능한 입력이 모였는지"를 수동 판단하지 않고
  변환 단계에서 즉시 기계적으로 판정 가능
- 다음 실측에서는 `--strict-core`를 표준 검증 단계로 사용하면 됨

## 39) 2026-03-12 ADB 자동 재현으로 핵심 5종 이벤트 충족

실행:

- 캡처: `scripts/gs25-webview-replay-capture.sh --host 127.0.0.1:27042 --out captures/gs25-replay-20260312-auto-r2`
- 재현(ADB 탭):
  - 홈 `재고찾기`
  - 최근 검색 `오감자`
  - `오리온)오감자50G` 선택
  - `목록보기` 진입
  - 매장 선택 후 `지도보기` 왕복

산출물:

- `captures/gs25-replay-20260312-auto-r2/frida-replay-raw.log`
- `captures/gs25-replay-20260312-auto-r2/gs25-replay-events.jsonl` (7건)
- `captures/gs25-replay-20260312-auto-r2/gs25-replay-events.params.json`

핵심 검증:

- `node scripts/gs25-replay-events-to-params.mjs ... --strict-core` 통과 (`exit=0`)
- 이벤트 5종 모두 존재:
  - `markers`, `marker_click`, `center`, `level`, `touchable`
- params 확인:
  - `latestState.selectedStore.storeCode = "VKX22"`
  - `latestState.level = {"level":3,"animate":false}`
  - `latestState.touchable = {"touchMap":true,"touchMarker":true}`

추가 개선:

- `scripts/gs25-webview-replay-capture.sh` 파서를 보강해
  `[Remote::PID ...] -> [GS25_REPLAY] ...` 형태도 추출되도록 수정
  - `rg '^\\[GS25_REPLAY\\]'` 기반 매칭을
    `awk` 기반 부분매칭으로 교체
  - 종료 시 JSONL 비어 있을 경우 raw 로그 재파싱 fallback 추가

## 40) 2026-03-12 b2c 암복호화 윈도우 후킹 스크립트 추가

목표:

- `request_e/response_e` 평문 직전/직후 단서를
  b2c 네트워크 경계에서 구조화 로그로 수집

추가 파일:

- `scripts/frida/gs25-b2c-crypto-window-hook.js`
  - URL/URI/Cronet 헤더/메서드 후킹
  - `Base64`, `Cipher.doFinal([B)` 후킹
  - 이벤트 포맷:
    - `[GS25_B2C_CRYPTO] {"t":"...", ...}`
- `scripts/gs25-b2c-crypto-capture.sh`
  - Frida attach + 이벤트 JSONL 분리 저장
  - 산출물:
    - `frida-b2c-crypto-raw.log`
    - `gs25-b2c-crypto-events.jsonl`

실행 라운드:

- `captures/gs25-b2c-crypto-20260312-r1`
- `captures/gs25-b2c-crypto-20260312-r2`
- `captures/gs25-b2c-crypto-20260312-r3`
- `captures/gs25-b2c-crypto-20260312-r4`

관측:

- 공통:
  - `okhttp3.*` 클래스는 앱 런타임에서 미로딩(`ClassNotFound`) 확인
  - `org.chromium.net.UrlRequest$Builder`, `android.net.Uri$Builder`,
    `android.util.Base64`, `javax.crypto.Cipher` 후킹은 활성화됨
- `r2`에서 `uri_query_append` 다수 관측되었으나
  광고 SDK 계열 파라미터가 대부분이었음
- `request_e/response_e` 또는 b2c 식별 파라미터의
  평문 직전/직후 이벤트는 이번 라운드에서 미포착

해석:

- 현 앱 트래픽은 `okhttp`보다 Cronet/Flutter 내부 경로 의존도가 높은 것으로 보이며,
  Java 계층 단독 후킹만으로 b2c payload 평문 지점에 도달하지 못한 상태
- 다음 단계는
  - Cronet 네이티브 계층(`libcronet`/`libflutter`) 전송 버퍼 후킹 또는
  - Dart runtime 함수 경계(직렬화/암복호화) 포인트 식별
    로 이동하는 것이 타당

## 41) 2026-03-12 네이티브 SSL 버퍼 후킹(spawn) 적용

목표:

- attach 시점 이전 소켓 누락 문제를 줄이기 위해 spawn 시점부터 후킹
- `SSL_write/SSL_read`에서 HTTP 요청 라인/응답 헤더 평문 단서 확보

추가/변경:

- `scripts/frida/gs25-b2c-native-payload-hook.js`
  - `connect`, `SSL_set_tlsext_host_name`, `SSL_set_fd`, `SSL_get_fd`,
    `SSL_write`, `SSL_read`, `send/recv/write/read` 후킹
  - 이벤트 포맷:
    - `[GS25_B2C_NATIVE_PAYLOAD] {...}`
  - unknown 세션 샘플 로그 상한 확장(`200`)
- `scripts/gs25-b2c-native-payload-capture.sh`
  - `--spawn` 옵션 추가 (`frida -f com.gsr.gs25`)
- `scripts/gs25-b2c-native-events-summary.mjs`
  - JSONL에서 요청 라인/경로 빈도 요약

실행:

- `captures/gs25-b2c-native-20260312-r1`
- `captures/gs25-b2c-native-20260312-r2`
- `captures/gs25-b2c-native-20260312-r3`
- `captures/gs25-b2c-native-20260312-r4-spawn`
- `captures/gs25-b2c-native-20260312-r5-spawn`
- `captures/gs25-b2c-native-20260312-r6-spawn`

핵심 관측(r5/r6 spawn):

- `SSL_write/SSL_read` 이벤트 다수 확보
- 평문 요청 라인 예시:
  - `POST /msg-api/deviceCert.m`
  - `POST /msg-api/setConfig.m`
  - `POST /msg-api/login.m`
  - `POST /api/v4/apps/ourgs/events/mobile-app/9160`
  - `GET /ia-sdk-config/...`
- HTTP/2 프리페이스/프레임 단서도 확인:
  - `PRI * HTTP/2.0`
  - 이후 바이너리 프레임 구간

자동 요약 결과(r6):

- 입력: `captures/gs25-b2c-native-20260312-r6-spawn/gs25-b2c-native-events.jsonl`
- `totalEvents=123`, `totalIoEvents=112`
- `b2cHintCount=0` (문자열 기준)
- 현재 수집 범위는 여전히 `msg-api`/광고/분석 계열이 우세

해석:

- 네이티브 버퍼 후킹 자체는 성공했고 HTTP 계층 평문이 실제로 관찰됨
- 다만 이번 라운드에서는 `b2c-apigw/b2c-bff`, `request_e/response_e` 직접 단서가
  아직 이벤트에 등장하지 않음
- 다음 단계는 HTTP/2 헤더 디코드(HPACK) 또는 host 복원 강화를 통해
  b2c 세션 식별률을 높이는 것

## 42) 2026-03-12 r9 재수집 + host/path 매핑 강화

목표:

- `SSL_write` 평문 HTTP/1 요청에서 `Host`를 안정적으로 복원
- `path` 깨짐(`de.viceCert`, `con.fig`)과 hexdump 64바이트 절단 문제 제거

수정:

- `scripts/frida/gs25-b2c-native-payload-hook.js`
  - hexdump fallback 길이를 `64 -> DUMP_LIMIT(16384)`로 상향
- `scripts/gs25-b2c-native-events-summary.mjs`
  - hex 문자열/표준 hexdump를 모두 처리하는 bytes 파서로 교체
  - 텍스트 추정 기반이 아니라 HTTP/1 헤더(`Host`) 직접 파싱으로 변경
  - `topHosts`, `topHostRequestLines` 출력 추가
- `scripts/gs25-h2-header-decode.py`
  - hex 추출 로직을 동일 방식으로 보강

실행:

- `captures/gs25-b2c-native-20260312-r7-spawn` 재요약
- `captures/gs25-b2c-native-20260312-r9-spawn` 신규 수집/요약

핵심 결과(r9):

- `totalEvents=178`, `totalIoEvents=167`, `b2cHintCount=1`
- 주요 host/path 매핑:
  - `tms31.gsshop.com` -> `/msg-api/deviceCert.m`, `/msg-api/setConfig.m`
  - `core.airbridge.io` -> `/api/v4/apps/ourgs/events/mobile-app/9160`
  - 그 외 Unity/Pangle/Naver/Google Ads 계열 다수
- 여전히 `b2c-apigw/b2c-bff`, `request_e/response_e` 직접 단서는 미포착
- HTTP/2 HPACK 디코드 결과: `h2DecodedConnections=[]`

해석:

- spawn + native SSL 후킹으로 GS 계열(`tms31.gsshop.com`)까지는 안정적으로 식별됨
- 다만 이번 동작 구간에서는 b2c 엔드포인트 호출이 트리거되지 않았거나,
  HTTP/2/앱 내부 경계에서 아직 식별되지 않는 상태

## 43) 2026-03-12 Ghidra+Frida: `com.pgl.ssdk.ces.a.meta` 계측

목표:

- Ghidra에서 확인한 `libnms.so` JNI 경계를 런타임 계측으로 연결
- b2c와 무관한 암복호화 축(광고/디바이스 지문)을 분리

정적(Ghidra):

- `JNI_OnLoad` (`001155d4`) 확인
- `FUN_00115134` (`00115134`) 확인:
  - 바이트 XOR 루프 기반 문자열 디코드
- 문자열 단서:
  - `com.pgl.ssdk.ces.a`

동적(Frida):

- `scripts/frida/gs25-jni-registernatives-hook.js`
  - `RegisterNatives` 심볼 직접 후킹은 기기 빌드에서 실패
  - fallback으로 native 메서드 reflection 스냅샷 수행
- `scripts/frida/gs25-pgl-meta-hook.js`
  - `com.pgl.ssdk.ces.a.meta(int, Context, Object)` 호출/반환 계측

실행:

- `captures/gs25-jni-natives-20260312-r2`
- `captures/gs25-pgl-meta-20260312-r1`
- `node scripts/gs25-pgl-meta-summary.mjs captures/gs25-pgl-meta-20260312-r1/gs25-pgl-meta-events.jsonl`

핵심 관측:

- native 메서드:
  - `public static native Object com.pgl.ssdk.ces.a.meta(int, Context, Object)`
- 코드별 반환 패턴:
  - `227`: `String -> String` (긴 난독/암호문 형태)
  - `301`: `-> [B`, `302`: `[B -> String`
  - `222`: `Object[] -> [B`, `223`: `[B -> Integer`

해석:

- `libnms/com.pgl.ssdk.ces.a.meta`는 광고/디바이스 지문 축으로 보이며,
  현재 추적 대상인 `request_e/response_e` b2c 암복호화와는 별도 경로일 가능성이 큼
- 따라서 b2c 직접 추적은 `libapp.so(Flutter/Dart)` 또는 b2c 호출 직전 HTTP/2 헤더/바디 경계에
  계속 집중하는 것이 타당

## 44) 2026-03-12 `msg-api d=` 추출기 보정 + 리플레이 검증

목표:

- `tms31.gsshop.com /msg-api/*` 요청의 `d=` 파라미터를 정확 추출
- 동일 payload 재전송 시 응답 재현성(완전 리플레이 가능 여부) 확인

수정:

- `scripts/gs25-msg-api-payload-extract.mjs`
  - hexdump 디코드 로직 보정:
    - 주소/ASCII 컬럼 혼입 가능성을 제거하고 바이트 토큰 우선 파싱
  - 결과:
    - 기존 누락되던 `/msg-api/login.m`까지 정상 추출

실행:

- `node scripts/gs25-msg-api-payload-extract.mjs captures/gs25-b2c-native-20260312-r10-spawn/gs25-b2c-native-events.jsonl`
- 전체 라운드 비교:
  - `r9`, `r10`에서 동일한 `d` 프리뷰 패턴 확인
  - `/msg-api/deviceCert.m`, `/msg-api/setConfig.m`, `/msg-api/login.m` 모두 추출
- 재전송 검증(curl):
  - `POST https://tms31.gsshop.com/msg-api/deviceCert.m`
  - `POST https://tms31.gsshop.com/msg-api/setConfig.m`
  - `POST https://tms31.gsshop.com/msg-api/login.m`

핵심 결과:

- 세 엔드포인트 모두 HTTP 200 응답 확인
- 동일 `d`로 2회 연속 전송 시 응답 바디가 바이트 단위로 동일(`cmp` 일치)
  - `deviceCert.m`: 216 bytes
  - `setConfig.m`: 128 bytes
  - `login.m`: 128 bytes
- 즉, `msg-api` 축에서는 "완전 리플레이 가능한 패킷"이 확인됨

해석:

- 이전 답변에서 보류했던 "완전 리플레이 가능성"은 b2c(`request_e/response_e`) 기준이었고,
  이번 라운드로 `msg-api` 구간은 재현 가능성이 아니라 실제 재현 성공으로 상태가 변경됨
- 단, 핵심 목표인 `b2c-apigw/b2c-bff`의 `request_e/response_e`는 여전히 미포착 상태

## 45) 2026-03-12 `msg-api` 요청-응답 매칭/복호화 전 단계 분석

목표:

- `ssl_write` 요청과 `ssl_read` 응답을 같은 TLS 세션 기준으로 매칭
- 응답이 단순 JSON인지, 추가 인코딩/암호화인지 판별

추가:

- `scripts/gs25-msg-api-response-extract.mjs`
  - `ssl` 포인터별 stream 재조립
  - HTTP/1 request/response 파싱
  - chunked body 파싱 + gzip 해제
  - 요청(`d`) 메타와 응답 sha256 요약 산출

실행:

- `node scripts/gs25-msg-api-response-extract.mjs captures/gs25-b2c-native-20260312-r9-spawn/gs25-b2c-native-events.jsonl`
- `node scripts/gs25-msg-api-response-extract.mjs captures/gs25-b2c-native-20260312-r10-spawn/gs25-b2c-native-events.jsonl`

결과:

- r9/r10 모두 `msg-api` 3쌍 매칭 성공:
  - `/msg-api/deviceCert.m`
  - `/msg-api/setConfig.m`
  - `/msg-api/login.m`
- 응답은 gzip 해제 후에도 JSON 객체가 아닌 base64 텍스트(추가 암호문) 형태
- 응답 hash가 r9/r10에서 완전 동일:
  - `deviceCert`: `<REDACTED_DEVICECERT_HASH>`
  - `setConfig`: `<REDACTED_SETCONFIG_HASH>`
  - `login`: `<REDACTED_LOGIN_HASH>`

해석:

- `msg-api` 구간은 요청/응답 모두 결정적(deterministic) 리플레이가 가능
- 다만 앱에서 의미 있는 평문(JSON)까지 가려면 base64 이후 추가 복호화 키/루틴 추적이 필요

## 46) 2026-03-12 r11 spawn+monkey 재수집 (장시간 입력)

목표:

- 랜덤 UI 입력(monkey)으로 네트워크 표면을 넓혀 `woodongs` b2c 호출 노출 시도

실행:

- 캡처: `captures/gs25-b2c-native-20260312-r11-spawn`
- 방법:
  - `scripts/gs25-b2c-native-payload-capture.sh --spawn`
  - `adb shell monkey -p com.gsr.gs25 --throttle 180 -v 500`
- 요약:
  - `node scripts/gs25-b2c-native-events-summary.mjs .../r11.../gs25-b2c-native-events.jsonl`
  - `node scripts/gs25-msg-api-payload-extract.mjs .../r11.../gs25-b2c-native-events.jsonl`
  - `node scripts/gs25-msg-api-response-extract.mjs .../r11.../gs25-b2c-native-events.jsonl`

결과:

- `totalEvents=211`, `totalIoEvents=200`
- host 비중:
  - `tms31.gsshop.com` 4회
  - 광고/분석 SDK host 다수
- `msg-api` 요청 7건 추출:
  - `deviceCert` 1회, `setConfig` 3회, `login` 3회
- `msg-api` 응답 hash 반복 확인:
  - `deviceCert`: `<REDACTED_DEVICECERT_HASH>`
  - `setConfig`: `<REDACTED_SETCONFIG_HASH>`
  - `login`: `<REDACTED_LOGIN_HASH>`
- `woodongs/b2c-apigw/b2c-bff/request_e/response_e` 문자열 직접 히트: 없음

해석:

- 랜덤 입력 기반 수집으로도 `msg-api` 결정적 패턴만 강화됨
- `b2c request_e/response_e` 획득에는 monkey가 아닌 "재고찾기 고정 플로우 스크립트"가 필요

## 47) 2026-03-12 재고찾기 고정 플로우 ADB 스크립트 + r12 검증

목표:

- monkey 대신 재고찾기 시나리오를 고정된 탭 순서로 재현

추가:

- `scripts/gs25-stock-flow-adb.sh`
  - 순서:
    - 앱 실행
    - 재고찾기 메뉴 탭
    - 최근 검색어 탭
    - 첫 상품 탭
    - 목록보기 탭
  - 좌표는 환경변수로 교체 가능:
    - `TAP_STOCK_MENU`
    - `TAP_RECENT_SEARCH`
    - `TAP_FIRST_PRODUCT`
    - `TAP_MAP_LIST_BUTTON`

실행:

- 캡처: `captures/gs25-b2c-native-20260312-r12-stockflow`
- 방법:
  - `scripts/gs25-b2c-native-payload-capture.sh --spawn`
  - `scripts/gs25-stock-flow-adb.sh`

결과:

- `totalEvents=211`, `totalIoEvents=200`, `b2cHintCount=0`
- `msg-api` 요청 5건:
  - `deviceCert` 1회, `setConfig` 2회, `login` 2회
- `woodongs/b2c-apigw/b2c-bff/request_e/response_e` 직접 문자열 히트: 없음

해석:

- 고정 플로우 스크립트 자체는 동작했지만 현재 좌표 세트로는 목표 화면 진입이 충분하지 않음
- 다음 라운드는 좌표 튜닝(또는 요소 기반 UIAutomator) 후 동일 캡처를 재실행해야 함

## 48) 2026-03-12 UIAutomator 플로우 도입(r13/r14/r15)

목표:

- 좌표 고정 의존을 줄이고 text/content-desc 기반 탭 자동화로 b2c 진입률 개선

추가:

- `scripts/gs25-stock-flow-uiautomator.sh`
  - UI dump에서 text/content-desc 매칭 후 중심 좌표 탭
  - 매칭 실패 시 fallback 좌표 사용
  - 팝업 닫기/검색 탭/재고찾기/최근검색어/상품/목록보기 순서
- `scripts/gs25-uiauto-text-scan.sh`
  - 현재 화면의 text/content-desc/bounds를 추출해 캘리브레이션 자료 생성

실행:

- `captures/gs25-b2c-native-20260312-r13-uiauto`
- `captures/gs25-b2c-native-20260312-r14-uiauto2`
- `captures/gs25-b2c-native-20260312-r15-uiauto3`

핵심 관측:

- 세 라운드 모두 이벤트 규모 유사(`totalEvents=211`, `totalIoEvents=200`)
- `msg-api` 반복 패턴 유지(`deviceCert/setConfig/login`)
- `woodongs/b2c-apigw/b2c-bff/request_e/response_e` 직접 히트 없음
- UI 스캔 결과, 현재 진입 화면이 주소 설정 모달로 고정되는 케이스 확인:
  - `현재 주소를 먼저 설정해 주세요`
  - `주소에 따라 배달매장이 변경...`
  - 버튼: `취소`, `확인`

해석:

- 실패 원인은 단순 좌표 오차보다 "주소 모달 상태 머신"에 가까움
- 다음 단계는 플로우 시작 전에 주소 모달 해제(취소) 전용 루틴을 먼저 반복 적용한 뒤
  재고찾기 단계로 진입시켜야 함

## 49) 2026-03-12 모달 해제 루프 적용(r16) + UI 스캔 보강

추가/수정:

- `scripts/gs25-stock-flow-uiautomator.sh`
  - 각 단계 전 `닫기/취소` 반복 시도(`clear_blocking_modals`) 추가
- `scripts/gs25-uiauto-text-scan.sh`
  - 현재 화면의 text/content-desc/bounds를 캡처 파일로 저장하는 스캐너 추가

실행:

- `captures/gs25-b2c-native-20260312-r16-uiauto4`
- 같은 라운드에서 `uiauto-scan.txt` 동시 생성 시도

결과:

- `totalEvents=113`, `totalIoEvents=102`, `b2cHintCount=0`
- 네트워크는 `msg-api` + 광고 SDK로 수렴, `woodongs` 직접 히트 없음
- `uiauto-flow.log`상 모달 해제 패턴(`닫기|취소`) 매칭은 계속 실패
- `uiauto-scan.txt`가 0바이트로 생성됨(해당 시점 접근성 노드 비가시/비어있음)

해석:

- 현재 자동화 병목은 단순 탭 순서가 아니라 "화면 상태 관측 신뢰도" 문제
- 다음 라운드는 UI dump 재시도 루프(짧은 interval 다회) 또는 앱 전면 상태 확인(`dumpsys window`)을
  결합해, 비어있는 dump 시 즉시 재시도하도록 보강해야 함

## 50) 2026-03-12 전면 확인/재시도 보강(r17~r20)

변경:

- `scripts/gs25-stock-flow-uiautomator.sh`
  - `dumpsys window` 기반 전면 앱 확인 추가
  - `uiautomator dump` 재시도(`DUMP_RETRY`) 추가
  - `mCurrentFocus` 파싱을 마지막 라인 기준으로 수정(초기 `null` 오인 제거)
  - 주소 모달 대응 강화:
    - `ADDRESS_MODAL_TEXTS` 패턴
    - fallback 취소 좌표 탭 + `KEYCODE_BACK` 전처리 옵션
- `scripts/gs25-uiauto-text-scan.sh`
  - dump 재시도(`SCAN_RETRY`) 추가

실행 라운드:

- `r17`: `captures/gs25-b2c-native-20260312-r17-uiauto5`
  - 전면 확인 실패 로그
  - `msg-api` + 광고/분석 트래픽
- `r18`: `captures/gs25-b2c-native-20260312-r18-uiauto6`
  - 주소 모달 스캔은 보이나 자동 해제 미성공
  - `msg-api` + 광고/분석 트래픽
- `r19`: `captures/gs25-b2c-native-20260312-r19-uiauto7`
  - 전면 확인 성공 로그로 개선
  - 그러나 텍스트 기반 단계 매칭은 계속 실패
  - `totalEvents=211`, `b2cHintCount=0`
- `r20`: `captures/gs25-b2c-native-20260312-r20-uiauto8`
  - 과도한 전처리 탭/백으로 세션이 짧게 종료되어 이벤트 축소(`16`)
  - 분석 가치 낮아 기준 라운드는 `r19` 유지

결론:

- 전면 확인 로직 오류는 해결됨(`r19` 기준)
- 핵심 병목은 여전히 Flutter 접근성 노드의 가시성/안정성 부족으로 인한 텍스트 매칭 실패
- 따라서 다음 단계는
  - 완전 자동 탭보다 "수동 UI 조작 + spawn 캡처" 조합으로 b2c 구간을 먼저 노출시키고
  - 그 구간을 기준으로 후킹 포인트를 좁히는 전략이 더 효율적

## 51) 2026-03-12 JNI RegisterNatives 실시간 매핑 + Ghidra 연계

핵심 변경:

- `scripts/frida/gs25-jni-registernatives-hook.js`
  - `RegisterNatives`를 JNI 함수 테이블 인덱스(215)에서 직접 후킹하도록 보정
  - 각 등록 메서드에 `moduleName/moduleOffset` 기록 추가
- `scripts/gs25-jni-natives-summary.mjs`
  - 클래스별/모듈별 JNI 등록 요약기 추가

실행:

- `captures/gs25-jni-natives-20260312-r6-module-offset`

결과:

- 총 등록 메서드 `92`건 확인
- `com.pgl.ssdk.ces.a.meta` 매핑 확정:
  - `moduleName=libnms.so`
  - `moduleOffset=0x39894`
  - signature: `(ILandroid/content/Context;Ljava/lang/Object;)Ljava/lang/Object;`
- Ghidra 디컴파일:
  - `FUN_00139894`는 위 offset과 일치
  - 내부에서 난독화된 분기 디스패처 `FUN_00139a5c`로 연결되는 구조 확인

부가 관측:

- `meta` deep 훅(`captures/gs25-pgl-meta-20260312-r5-stockflow-deep2`)에서
  code `224` 입력으로 광고 URL(`api16-access-sg.pangle.io`)이 확인됨
- 동일 라운드에서도 `woodongs/b2c-apigw/b2c-bff/request_e/response_e` 직접 히트는 없음

해석:

- 현재까지 재현 가능한 완전 리플레이는 `msg-api` 축에 한정
- 이번 라운드로 `libnms.so`의 핵심 JNI 엔트리(`meta`)까지 주소 단위로 고정되어
  다음 단계는 `FUN_00139894/FUN_00139a5c` 주변 함수별 동적 계측으로 좁혀짐

## 52) 2026-03-12 `meta` 네이티브 분기(code->helper) 실측 맵 확보

추가:

- `scripts/frida/gs25-pgl-meta-native-trace.js`
  - `libnms.so+0x39894(meta)` 진입 시 code를 태깅
  - `FUN_00139a5c` 및 주요 helper 함수들의 호출을 code별로 기록
- `scripts/gs25-pgl-meta-native-trace-capture.sh`
- `scripts/gs25-pgl-meta-native-trace-summary.mjs`

실행:

- `captures/gs25-pgl-meta-native-trace-20260312-r2`
- `captures/gs25-pgl-meta-native-trace-20260312-r3-long`

결과(핵심 code):

- `code 224` -> `FUN_00135680` 경로 포함
- `code 227` -> `FUN_001177c8` -> `FUN_00119f08` 경로
- `code 301` -> `FUN_00128654` 경로 포함
- `code 302` -> `FUN_00128384` 경로 포함
- `code 303` -> `FUN_001285c4` 경로 포함
- 공통적으로 `meta_dispatch(FUN_00139a5c)`가 선행

의미:

- Java 훅에서 관측된 `224/227/301/302/303`이
  `libnms` 내부에서 서로 다른 helper 루틴으로 분기됨을 동적으로 확인
- 다음 우선순위는 `FUN_00128654/00128384/001285c4/00135680`의
  입력/출력 객체(`jstring`/`jbyteArray`) 계측으로 좁혀짐

현재 상태:

- `msg-api` 구간은 요청/응답 리플레이 가능
- 본 이슈(b2c 핵심 패킷 완전 리플레이)는 아직 미완료

## 53) 2026-03-12 Java+Native 동시 수집으로 `meta` code 입출력 상관관계 고정

추가:

- `scripts/gs25-pgl-meta-dual-capture.sh`
  - `gs25-pgl-meta-hook.js` + `gs25-pgl-meta-native-trace.js` 동시 로드
  - Java/Native 이벤트를 각각 JSONL로 분리 저장
- `scripts/gs25-pgl-meta-dual-summary.mjs`
  - code별 Java 리턴 타입 + native helper 빈도를 통합 요약

실행:

- `captures/gs25-pgl-meta-dual-20260312-r1`

핵심 매핑(목표 code):

- `224`
  - Java return: `java.lang.String`
  - Native: `FUN_00135680` (+ `FUN_001177c8`, `FUN_00119f08`)
- `227`
  - Java return: `java.lang.String`
  - Native: `FUN_001177c8` -> `FUN_00119f08`
- `301`
  - Java return: `[B` (byte[])
  - Native: `FUN_00128654` (+ 다수의 `FUN_001177c8`, `FUN_00119f08`)
- `302`
  - Java return: `java.lang.String`
  - Native: `FUN_00128384`
- `303`
  - Java return: `java.lang.String`
  - Native: `FUN_001285c4`

의미:

- `meta` code별로 "어떤 native helper를 거쳐 어떤 Java 타입으로 반환되는지"가
  반복 관측으로 고정됨
- 다음 우선순위는 `301([B)`를 중심으로 helper 반환값의 실데이터(base64/hex) 복원

## 54) 2026-03-12 `301([B)` base64 복원 경로 확보

변경:

- `scripts/frida/gs25-pgl-meta-hook.js`
  - `byte[]` 직렬화 실패 시 수동 base64 인코더 폴백 추가

실행:

- `captures/gs25-pgl-meta-20260312-r6-b64`

결과:

- `meta_return code=301`에서 `retDeep`가 `base64:...` 형태로 출력됨
- 동일 라운드에서 `code=222`도 `base64:...` 형태 출력 확인

의미:

- `301([B)` 반환의 실데이터 캡처가 가능해져
  `FUN_00128654` 반환과 Java 레벨 값의 대응 검증이 가능해짐

## 55) 2026-03-12 Java/Native 호출 단위 상관 매칭(최근접 timestamp)

추가:

- `scripts/gs25-pgl-meta-call-correlation.mjs`
  - Java `meta_return`과 Native `meta_leave`를 같은 `code`에서 최근접 timestamp로 매칭
  - 매칭 호출에 대해 native helper 체인을 함께 출력

실행:

- `captures/gs25-pgl-meta-dual-20260312-r2-correl`
- `node scripts/gs25-pgl-meta-call-correlation.mjs ... --max-delta-ms 2500`

결과:

- 전체: `matched 18 / 36` (unmatched 18)
- 목표 code는 고정 매칭 확인:
  - `303` -> seq 7, delta 5ms, `meta_dispatch -> FUN_001285c4`
  - `227` -> seq 8, delta 3ms, `meta_dispatch -> FUN_001177c8 -> FUN_00119f08`
  - `224` -> seq 10, delta 1ms, `meta_dispatch -> FUN_00135680 -> ...`
  - `301` -> seq 13, delta 26ms, `meta_dispatch -> FUN_00128654 -> ...`
  - `302` -> seq 15/16, delta 0~1ms, `meta_dispatch -> FUN_00128384`

해석:

- 목표 code(`224/227/301/302/303`)는 호출 단위(Java 리턴 <-> Native helper)가
  실측에서 재현 가능하게 매칭됨
- 미매칭 다수는 비목표 code 또는 훅 범위 밖 helper 호출 영향으로 판단됨

## 56) 2026-03-12 code별 payload 추출 자동화(301/302/303)

추가:

- `scripts/gs25-pgl-meta-extract-code-payloads.mjs`
  - Java `meta_return`에서 code별 payload를 추출/중복제거
  - `base64:` 접두 제거, 길이/빈도 요약 출력

실행:

- 입력: `captures/gs25-pgl-meta-dual-20260312-r2-correl/gs25-pgl-meta-events.jsonl`
- 옵션: `--codes 301,302,303`

결과:

- `301`: unique 1개, 길이 807 (count 2)
- `302`: unique 2개, 길이 25
- `303`: unique 1개, 길이 25

의미:

- `301([B)`는 동일 payload 반복성이 높고,
  `302/303`은 짧은 토큰성 문자열 후보로 분리됨

## 57) 2026-03-12 `301` payload 구조 1차 디코드(헤더/암호문 분리)

추가:

- `scripts/gs25-pgl-meta-decode-301.mjs`
  - code `301`의 base64 payload를 바이너리로 복원
  - protobuf wire-format 휴리스틱 파싱 + 엔트로피 계산

실행:

- 입력: `captures/gs25-pgl-meta-20260312-r6-b64/gs25-pgl-meta-events.jsonl`

결과:

- `301` payload (unique 1개):
  - base64 길이 `807`
  - binary 길이 `601`
  - protobuf 해석:
    - field1(varint)=`538969122`
    - field2(varint)=`1`
    - field3(varint)=`2`
  - 파싱 소비 바이트 `13`, 잔여 `588`
  - 전체 엔트로피 `7.6474 bits/byte` (고엔트로피)

해석:

- 구조는 `짧은 메타 헤더 + 고엔트로피 바디` 형태
- 잔여 588바이트는 평문 protobuf보다는 암호화/압축 페이로드일 가능성이 높음

## 58) 2026-03-12 `302/303` 25자 토큰 디코드 성상 분석

추가:

- `scripts/gs25-pgl-meta-decode-short-tokens.mjs`
  - code `302/303` 반환 문자열의 base64url 디코드 분석

실행:

- 입력: `captures/gs25-pgl-meta-dual-20260312-r2-correl/gs25-pgl-meta-events.jsonl`

결과:

- `302` 2종, `303` 1종 모두:
  - 길이 `25`
  - base64url 문자셋 일치
  - 디코드 길이 `18 bytes`
  - 엔트로피 약 `4.06~4.17 bits/byte`

해석:

- `302/303`은 짧은 binary 토큰(18B) 계열로 보이며
  `301`의 대형 고엔트로피 payload와 역할이 분리된 경로일 가능성이 높음

## 59) 2026-03-12 라운드 간 payload 안정성(301/302/303) 집계

추가:

- `scripts/gs25-pgl-meta-payload-stability.mjs`
  - 다중 캡처 파일을 입력받아 code별 unique payload 수 집계
  - byte-list/base64 표현 차이를 일부 정규화

실행:

- 입력 6개 캡처:
  - `r3/r4/r5/r6`, `dual-r1/r2`
- 결과 파일:
  - `captures/gs25-pgl-meta-payload-stability-20260312.json`

결과:

- 파일별:
  - `301`은 관측된 파일에서 대부분 unique `1`
  - `302`는 파일당 unique `1~2`
  - `303`은 파일당 unique `1`
- 전역(unique):
  - `301`: `1`
  - `302`: `10`
  - `303`: `6`

해석:

- `301`은 상대적으로 안정적인 본문(payload) 성향
- `302/303`은 세션/시점에 따라 자주 바뀌는 토큰 계열 가능성이 높음

## 60) 2026-03-12 `302/303` 18바이트 토큰의 `301` 본문 포함 여부 확인

실행:

- 입력: `captures/gs25-pgl-meta-dual-20260312-r2-correl/gs25-pgl-meta-events.jsonl`
- 방법: code `302/303` 토큰을 base64url 디코드(18B) 후, code `301` 바이너리 본문에서 바이트열 검색

결과:

- `302` 2종, `303` 1종 모두 `301` 본문 내 직접 포함되지 않음(`index=-1`)

해석:

- `302/303` 토큰은 `301` 본문에 단순 포함되는 파생값보다는
  별도 경로에서 생성/참조되는 식별자일 가능성이 높음

## 61) 2026-03-12 helper 반환 포인터와 meta 반환 포인터 동일성 검증

추가:

- `scripts/gs25-pgl-meta-pointer-flow.mjs`
  - code별 타깃 helper `ret` 포인터와 `meta_leave ret` 포인터 동일성 집계

실행:

- `captures/gs25-pgl-meta-dual-20260312-r1/gs25-pgl-meta-native-trace-events.jsonl`
- `captures/gs25-pgl-meta-dual-20260312-r2-correl/gs25-pgl-meta-native-trace-events.jsonl`

결과(두 라운드 공통 경향):

- `224`: `FUN_00135680 ret == meta ret` (1/1)
- `301`: `FUN_00128654 ret == meta ret` (2/2)
- `302`: `FUN_00128384 ret == meta ret` (2/2)
- `303`: `FUN_001285c4 ret == meta ret` (1/1)
- `227`: `FUN_001177c8 ret != meta ret` (0/1~2)

해석:

- `301/302/303/224`는 타깃 helper 반환 객체가 최종 반환 객체와 동일
- `227`은 helper 반환 이후 `meta_dispatch` 내부에서 추가 변환(문자열화/재포장) 경로가 존재할 가능성이 높음

## 62) 2026-03-12 `code=301` full payload 재수집 + protobuf 여부 확인

추가/수정:

- `scripts/frida/gs25-pgl-meta-hook.js`
  - `byte[]`의 `retDeep` base64 출력 상한을 `800 -> 8192`로 상향
  - 목적: `...(truncated)` 없는 원문 payload 확보
- `scripts/gs25-pgl-meta-export-payload-bins.mjs`
  - `meta_return`의 base64/base64url payload를 code별 `.bin`으로 추출
  - `...(truncated)` payload 자동 제외
- `scripts/gs25-pgl-meta-protobuf-likelihood.mjs`
  - protobuf wire-format 휴리스틱(필드/소비율/완전소비) 판정기

실행:

- 캡처:
  - `captures/gs25-pgl-meta-20260312-r7-fullb64`
- payload export:
  - `captures/gs25-pgl-meta-payload-bins-r7/manifest.json`
- protobuf 판정:
  - `captures/gs25-pgl-meta-protobuf-likelihood-r7.json`

결과:

- `code=301`:
  - base64 길이 `1423`, `truncated=false`
  - binary 길이 `1060`
  - wire parse: `field #1(varint), #2(varint), #3(varint), #4(len-delimited), #5(varint)`
  - consumed `1060/1060`, likelihood `true`
- `code=302/303`:
  - 각 `18B` 토큰
  - wire parse 실패, likelihood `false`

해석:

- `GS25 meta code=301` 반환은 평문 protobuf wire-format wrapper로 볼 수 있음
- 단, 핵심 본문은 field #4(bytes)에 실려 있으며 내부는 여전히 고엔트로피(암호화/난독화) 구간일 가능성이 높음

## 63) 2026-03-12 `blackboxprotobuf` 무스키마 디코드 검증 + mitmproxy 프로브 추가

추가:

- `scripts/gs25-pgl-meta-blackboxprotobuf-check.py`
  - `.proto` 없이 `blackboxprotobuf.decode_message` 시도
  - bytes 필드는 base64로 안전 직렬화
- `scripts/mitm/gs25_protobuf_probe.py`
  - mitmproxy response body를 protobuf 휴리스틱으로 탐지
  - 후보에 대해 blackboxprotobuf 디코드 시도/로그 출력

실행:

- `python3 -m pip install --user blackboxprotobuf`
- `python3 scripts/gs25-pgl-meta-blackboxprotobuf-check.py captures/gs25-pgl-meta-payload-bins-r7`
  - 결과 파일: `captures/gs25-pgl-meta-blackboxprotobuf-r7.json`

결과:

- 총 3 payload 중 decode 성공 1건:
  - `code=301`: keys `1,2,3,4,5` 복원 성공
  - `code=302/303`: decode 실패(`Invalid Message Length` 등)
- `code=301`에서 field `4`는 bytes blob로 추출되며, 상위 wrapper만 protobuf로 읽힘

해석:

- 질문했던 "protobuf인가?"에 대해:
  - `code=301` 경로는 protobuf wrapper 사용이 맞음
  - 단, payload 본체는 protobuf 내부 bytes로 포장된 별도 포맷(암호문/압축문/서브프레임)일 가능성이 큼

## 64) 2026-03-12 `code=301 field#4(bytes)` 재귀 분석 + Ghidra 교차확인

추가:

- `scripts/gs25-pgl-meta-301-field4-analysis.py`
  - `code=301` wrapper 바이너리에서 field `4(bytes)` 추출
  - entropy/magic/wire-scan/blackboxprotobuf(원문+skip variant) 재귀 시도

실행:

- 입력:
  - `captures/gs25-pgl-meta-payload-bins-r7/code-301/payload-001.bin`
- 결과:
  - `captures/gs25-pgl-meta-301-field4-analysis-r7.json`

결과 요약:

- outer(wrapper):
  - protobuf decode 성공, keys `1,2,3,4,5`
  - 값:
    - `f1=538969122`
    - `f2=1`
    - `f3=2`
    - `f5=1773288028` (epoch sec)
    - `f4` 길이 `1041` bytes
- field `4` 본문:
  - entropy `~7.844`
  - gzip/zlib/zstd/lz4 magic 없음
  - wire-scan 실패(`0 fields`, consumed `0/1041`)
  - blackboxprotobuf 실패(`Found END_GROUP before START_GROUP`)
  - `skip1/skip2` 변형도 부분 파싱만 되고 완전 파싱 실패

Ghidra 교차확인:

- `FUN_00139a5c`에서 `code=0x12d(301)` 분기가 `FUN_00128654` 호출로 연결됨(디스패치 유지)
- `FUN_00128654`는 내부적으로
  - `FUN_0011c31c(...)` (상수/버퍼 준비)
  - `FUN_00115f54(...)` (숫자 파싱 루틴)
  - `FUN_0013d5b4(indirect jump)` 호출
    로 이어지는 난독화 dispatcher 형태

해석:

- `301`은 protobuf wrapper까지는 평문으로 관측 가능
- 실제 핵심 payload는 field `4` 내부에서 별도 변환(암호화/난독화)된 blob으로 보임
- 다음 우선순위는 `FUN_00128654` 하위 간접 분기 대상(점프 테이블) 런타임 해석과,
  `227` AES 유사 경로와의 키/입력 연계를 맞추는 것

## 65) 2026-03-12 `FUN_00128654` 간접 분기 타깃 런타임 고정

추가:

- `scripts/frida/gs25-pgl-meta-301-indirect-probe.js`
  - `meta(301)` + `FUN_00128654` + `FUN_0013d5b4(indirect)` 동시 후킹
  - `FUN_0013d5b4` 첫 인자(점프 대상 함수 포인터) 로그
- `scripts/gs25-pgl-meta-301-indirect-capture.sh`
- `scripts/gs25-pgl-meta-301-indirect-summary.mjs`

실행:

- 동시 수집(자바 meta + 간접분기):
  - `captures/gs25-pgl-meta-301-indirect-20260312-r2-dual`

결과:

- 같은 seq(`301`)에서 `indirect_call` 2건 관측:
  - targetOffset `0x39a5c` (meta_dispatch)
  - targetOffset `0x287a0` (301 helper 내부 간접 타깃)
- 이벤트 순서:
  - `meta301_enter`
  - `indirect_call -> 0x39a5c`
  - `helper301_enter`
  - `indirect_call -> 0x287a0`
  - `helper301_leave` / `meta301_leave`

Ghidra 교차확인:

- `FUN_001287a0` 디컴파일 결과, 대규모 컨텍스트 수집 + 문자열/수치 조합 + `FUN_0012811c(...)` 패킹 루틴 포함
- 반환 시점에 다수 임시 버퍼를 `free`하며 결과 포인터를 유지하는 형태로,
  `301 protobuf wrapper(field#4 blob)` 생성 경로의 핵심 빌더일 가능성이 높음

해석:

- 기존의 `FUN_00128654`는 "최종 생성자"가 아니라 간접 디스패처 역할이 강함
- 실제 payload 조립 핵심은 `FUN_001287a0` 계열로 좁혀졌고,
  다음 분석 타깃은 `FUN_0012811c`의 입력/출력 버퍼 계측으로 확정 가능

## 66) 2026-03-12 `301` 바이트 경로 완전 연결 + 변동성 분석

핵심 수정:

- `scripts/frida/gs25-pgl-meta-301-pipeline-probe.js`
  - `Memory.readU8/readPointer` 호출을 포인터 메서드(`ptr.readU8/readPointer`)로 교체
  - `fn2ae64_leave`에서 `outPtr/outLen/outB64` 직접 추출 가능하도록 보강

검증 캡처:

- `captures/gs25-pgl-meta-301-pipeline-20260312-r12-readptrfix`
- `captures/gs25-pgl-meta-301-pipeline-20260312-r14-readptrfix3`

확정 결과:

- `fn2ae64_outLen = 1041`
- `fn17b6c_bufLen = 1060`
- 비교 결과:
  - `field4EqualsFn2ae64Out = true`
  - `wrapperEqualsFn17b6cBuf = true`

즉, 런타임 기준으로:

- `FUN_0012ae64` 출력 = protobuf `code=301`의 `field#4`
- `FUN_00117b6c` 입력 = Java `meta_return(301)` 전체 wrapper

추가(런 간 변동성):

- 도구: `scripts/gs25-pgl-meta-301-variability.mjs`
- 리포트:
  - `captures/gs25-pgl-meta-301-variability-r12-vs-r14.json`

요약:

- `fn2ae64 in(977)` 변화:
  - diff `23` bytes, 범위 `851~859`, `861~874`
  - protobuf top-level에서 `field#2`(25B ASCII 토큰)만 변경
- `fn2ae64 out(field#4, 1041)` 변화:
  - diff `144` bytes, 범위 `897~1040`(tail block)
- wrapper(1060) 변화:
  - diff `146` bytes, 범위 `910~1053` + `1055~1056`
  - `field#4` tail 변화 + wrapper 외곽 varint 일부 변화(추정)

해석:

- 동일 런 내 연속 호출(seq 1/2)에서는 `field#4/wrapper`가 동일(캐시 또는 동일 입력)
- 런 간에는 입력 토큰(`in field#2`) 변화에 따라 `field#4` tail이 크게 변함
- 완전 재생성(replay) 가능성은 입력 토큰 생명주기/유효성 검증 규칙 확인이 필요

## 67) 2026-03-12 token(field#2) ↔ out(field#4) 상관 집계

추가:

- `scripts/gs25-pgl-meta-301-token-correlation.mjs`
  - 다수 pipeline 캡처 파일에서 `seq` 단위로
    - `in.field#2`(토큰)
    - `out(field#4)` 해시
    - wrapper 해시 / `f5`(epoch sec)
      를 추출/그룹화

실행:

- 리포트: `captures/gs25-pgl-meta-301-token-correlation-all.json`

요약 결과:

- 유효 row: `4` (`r12` 2건 + `r14` 2건)
- 토큰 그룹: `2`
  - `AQ_Zgece1fVI1cEgxJvYgHs0y` → `outTailSha12=1f74d90270da` (2건 모두 동일)
  - `ACOB0OIM3wVYr8DAFkNai6K3A` → `outTailSha12=91ab8b7df573` (2건 모두 동일)
- 각 토큰 그룹 내부에서:
  - `outSha12` 동일
  - `wrapperSha12` 동일
  - `f5` 동일

해석:

- 현재 관측 범위에서는 `in.field#2` 토큰이 동일하면
  `field#4`와 wrapper 결과가 재현적으로 동일하게 생성됨
- 즉, 301 재현성의 핵심 입력은 `field#2` 토큰이며,
  실제 replay 가능 여부는 이 토큰의 서버 측 유효시간/1회성 정책에 좌우됨

## 68) 2026-03-12 `field#2` 토큰 발급 소스(302 vs 303) 매핑

추가:

- `scripts/gs25-pgl-meta-301-token-issuance-map.mjs`
  - 각 캡처 디렉터리의
    - `gs25-pgl-meta-events.jsonl` (`code=302/303` 반환 토큰)
    - `gs25-pgl-meta-301-pipeline-events.jsonl` (`fn2ae64 in.field#2` 소비 토큰)
      를 매핑

실행:

- `captures/gs25-pgl-meta-301-token-issuance-map-r11-r12-r14.json`

결과 요약:

- `r11`:
  - consumed token `AfuMC...`
  - 최근 발급: `code=303` 토큰 `AfuMC...`
  - lag: 약 `267ms` (seq2 기준)
- `r12`:
  - consumed token `AQ_Zg...`
  - 최근 발급: `code=303` 토큰 `AQ_Zg...`
  - lag: 약 `71ms`, `366ms`
- `r14`:
  - consumed token `ACOB0...`
  - 최근 발급: `code=303` 토큰 `ACOB0...`
  - lag: 약 `37ms`, `338ms`

해석:

- `301 field#2`의 직접 공급원은 현재 관측상 `code=303` 반환 토큰
- `code=302` 토큰은 별도 흐름(다른 요청 경로)으로 보이며, 301 입력 토큰과 분리됨
- 따라서 replay 실험의 1차 제어변수는 `303` 토큰 재사용 정책(유효시간/1회성)임

## 69) 2026-03-12 강제 token override 실험(능동 검증)

목적:

- `field#2 token`이 `field#4` 결과를 직접 결정하는지 능동 검증

방법:

- `scripts/frida/gs25-pgl-meta-301-pipeline-probe.js`에 override 로직 추가
  - `fn2ae64_enter` 시 입력 protobuf `field#2`를 동일 길이 토큰으로 교체 가능
  - 실험 후 기본값은 다시 비활성화(`OVERRIDE_TOKEN=''`)로 복구

실험:

- 캡처:
  - `captures/gs25-pgl-meta-301-pipeline-20260312-r15-override-aq`
- 강제 토큰:
  - `AQ_Zgece1fVI1cEgxJvYgHs0y` (`r12`에서 사용된 토큰)
- 확인:
  - `override.changed=true`
  - `r15 outSha12 = fe906859f0ea`
  - `r12 outSha12 = fe906859f0ea` (동일)
  - 비교 리포트:
    - `captures/gs25-pgl-meta-301-variability-r12-vs-r15-override.json`
    - `out.equal=true`
    - `wrapper`는 2바이트만 차이(`1055~1056`)  
      (`f5` epoch 변경: `1773292014 -> 1773292941`)

해석:

- `field#2` 토큰을 강제로 고정하면 `field#4`가 해당 토큰의 기존 결과로 재현됨
- wrapper의 잔여 차이는 `f5`(시각) 필드로 설명 가능
- 따라서 301 리플레이 성패는 암복호 내부보다는
  `303` 토큰 유효성(시간/회수/세션 결합) 정책이 핵심 변수임

추가 관측:

- `r15`(override)에서는 같은 토큰/같은 field#4라도
  seq 간 wrapper 해시가 달라질 수 있음
  - `seq1 f5=1773292941`, `wrapperSha12=855432c25bee`
  - `seq2 f5=1773292942`, `wrapperSha12=7fa4a9aff9dc`
- 즉, wrapper 재사용 시에는 `f5` 갱신 여부를 함께 고려해야 함

## 70) 2026-03-12 replay tuple exporter 추가

추가:

- `scripts/gs25-pgl-meta-301-export-replay-tuples.mjs`
  - pipeline events에서 seq별로 다음 튜플을 추출:
    - `token(field#2)`
    - `field#4`(base64)
    - `wrapper`(base64)
    - wrapper meta(`f1,f2,f3,f5`)
    - 해시/길이/일치체크(`field4==wrapper.field4`)

생성:

- `captures/gs25-pgl-meta-301-replay-tuples-r12.json`
- `captures/gs25-pgl-meta-301-replay-tuples-r14.json`
- `captures/gs25-pgl-meta-301-replay-tuples-r15-override.json`

용도:

- mitmproxy/재전송 실험에서 바로 사용할 수 있는
  `token + field#4 + wrapper` 정합 데이터셋 제공

## 71) 2026-03-12 mitmproxy replay injector 추가

추가:

- `scripts/mitm/gs25_301_replay_injector.py`

지원 모드:

- `replace_wrapper`
  - tuple의 wrapper 전체를 요청 body로 교체
- `replace_wrapper_f5_now` (기본)
  - tuple의 `field#4` + (`f1,f2,f3`)로 wrapper 재구성
  - `f5`는 현재 epoch sec로 갱신
- `replace_field4_keep_current`
  - 현재 요청의 (`f1,f2,f3,f5`) 유지
  - `field#4`만 tuple 값으로 교체

실행 예:

```bash
mitmdump -s scripts/mitm/gs25_301_replay_injector.py \
  --set gs25_replay_enable=true \
  --set gs25_replay_tuple_file=captures/gs25-pgl-meta-301-replay-tuples-r12.json \
  --set gs25_replay_mode=replace_wrapper_f5_now \
  --set gs25_replay_hosts=api16-access-sg.pangle.io
```

로그:

- 주입 성공 시 `GS25_REPLAY_APPLIED` JSON 로그 출력
  - `before_len`, `after_len`, `mode`, `token` 포함

## 72) 2026-03-12 replay 캠페인 실행/요약 자동화

추가:

- 실행기:
  - `scripts/gs25-301-replay-mitm-run.sh`
- 결과 요약기:
  - `scripts/gs25-301-replay-result-summary.mjs`

실행 예:

```bash
bash scripts/gs25-301-replay-mitm-run.sh \
  --tuple captures/gs25-pgl-meta-301-replay-tuples-r12.json \
  --index 0 \
  --mode replace_wrapper_f5_now \
  --duration 120
```

요약 예:

```bash
node scripts/gs25-301-replay-result-summary.mjs \
  captures/gs25-301-replay-run-YYYYmmdd-HHMMSS/mitmdump-replay-raw.log
```

요약 출력 항목:

- `applied/results` 개수
- HTTP `statusCounts`
- token별 결과 건수
- 첫/마지막 `GS25_REPLAY_RESULT` 샘플

## 73) 2026-03-12 batch campaign 자동화

추가:

- 배치 실행:
  - `scripts/gs25-301-replay-batch-run.sh`
- 배치 집계:
  - `scripts/gs25-301-replay-batch-summary.mjs`

배치 실행 예:

```bash
bash scripts/gs25-301-replay-batch-run.sh \
  --tuples captures/gs25-pgl-meta-301-replay-tuples-r12.json:0,captures/gs25-pgl-meta-301-replay-tuples-r14.json:0 \
  --modes replace_wrapper_f5_now,replace_field4_keep_current \
  --duration 120
```

배치 집계 예:

```bash
node scripts/gs25-301-replay-batch-summary.mjs \
  captures/gs25-301-replay-batch-YYYYmmdd-HHMMSS/manifest.jsonl
```

집계 항목:

- 전체 applied/results
- mode별 합계(`byMode`)
- tuple별 합계(`byTuple`)
- 전체 HTTP status 분포(`statusCounts`)

## 74) 2026-03-12 no-flow 원인 확정 + 러너 자동화 보강

실측:

- 기존 배치(`14:36~14:39`)가 `applied=0`이었던 직접 원인은
  기기 프록시 비활성 상태(`adb shell settings get global http_proxy -> :0`)였음
- `scripts/gs25-301-replay-mitm-run.sh --auto-flow` 실행 시
  프록시 자동 적용 후 `totalFlows`가 0이 아닌 값(2~3)으로 증가해
  "트래픽 미유입" 문제는 해소됨

추가/변경:

- `scripts/gs25-301-replay-mitm-run.sh`
  - `--auto-flow`: UI 재현 스크립트 자동 실행
  - 기기 프록시 자동 적용/종료 시 원복
  - `--frida-ssl-bypass`, `--frida-scripts`, `--package` 옵션 추가
  - Frida PID attach 자동화(우회 스크립트 병행 주입)
- `scripts/gs25-301-replay-batch-run.sh`
  - `--auto-flow`, `--device`, `--proxy-*`, `--flow-script` 옵션 연동

## 75) 2026-03-12 pangle host 갭 확인 + 기본 host 확장

관측:

- Frida 로그에서 `meta_call code=224` URL 호스트가
  `api16-access-wf-sg.pangle.io`로 확인됨
- 기존 replay 기본 호스트셋에는 `wf-sg`가 없어 필터 미스 가능성이 있었음

조치:

- 기본 host를 아래로 확장:
  - `api16-access-sg.pangle.io`
  - `api16-access-wf-sg.pangle.io`
  - `api-access.pangolin-sdk-toutiao.com`
- 반영 파일:
  - `scripts/mitm/gs25_301_replay_injector.py`
  - `scripts/gs25-301-replay-mitm-run.sh`
  - `scripts/gs25-301-replay-batch-run.sh`

현재 판정:

- 프록시 유입은 정상이나, 최근 런(`autoflow-r2/r3/r4`)의 MITM HTTP는
  `tms31.gsshop.com/msg-api/*`만 관측
- 동일 시점 Frida에는 `code=224/301` 이벤트가 관측된 런이 있어
  pangle 경로는 MITM 프록시 경유가 아닌 별도 경로(직접 TLS) 가능성이 높음

## 76) 2026-03-12 Conscrypt direct-write 경로 식별

추가:

- Frida 후커:
  - `scripts/frida/gs25-pangle-conscrypt-replay-hook.js`
    - `NativeCrypto.ENGINE_SSL_write_direct`
    - `NativeCrypto.ENGINE_SSL_write_BIO_direct`
    - host/len 기반 write probe 수집
- 실행기:
  - `scripts/gs25-pangle-conscrypt-capture.sh`
- 요약기:
  - `scripts/gs25-pangle-conscrypt-summary.mjs`

실행:

```bash
scripts/gs25-pangle-conscrypt-capture.sh captures/gs25-pangle-conscrypt-r5.log
node scripts/gs25-pangle-conscrypt-summary.mjs captures/gs25-pangle-conscrypt-r5.log
```

요약 결과(r5):

- `write_probe`: 120건
- `topHosts`에 `api16-access-wf-sg.pangle.io`: 17건 확인
- 태그 분포:
  - `ENGINE_SSL_write_BIO_direct`: 103
  - `ENGINE_SSL_write_direct`: 17
- `pangle_req`: 0
- `write_raw`: 0

판정:

- pangle 전송은 Conscrypt direct-write 경로에서 실제 발생함(호스트/길이 실측)
- 그러나 현재 후커 레벨에서는 HTTP 요청 라인(`GET/POST ...`) 형태로 복원되지 않음
  - 즉, `get_ads` 요청은 기존 HTTP 텍스트 파서 기준으로는 식별 불가
  - 다음 단계는 direct buffer 원문(hex) 추출 안정화 후 프레임 구조 분석 필요

## 77) 2026-03-12 direct buffer 읽기 복구 + 교체 이벤트 검증

핵심 수정:

- `scripts/frida/gs25-pangle-conscrypt-replay-hook.js`
  - direct 메모리 읽기를 `Memory.readByteArray` 대신 `ArrayBuffer.wrap(ptr, len)`로 변경
  - 결과적으로 `api16-access-wf-sg.pangle.io`의 direct write 원문(hex/ascii) 덤프 복구
  - 경로 필터를 다중 경로로 확장:
    - `/api/ad/union/sdk/get_ads/`
    - `/ssdk/v2/r`
    - `/api/ad/union/sdk/stats/batch/`

신규 실행기:

- `scripts/gs25-pangle-conscrypt-replay-probe.sh`
  - `globalThis.__PANGLE_CFG` 주입 방식으로 replay 파라미터 전달
  - 옵션:
    - `--match-len`
    - `--hex`
    - `--duration`
    - `--out`

실측 결과:

- `captures/gs25-pangle-conscrypt-r11.log`
  - `direct_dump`에서 다음 plaintext 요청 라인 확인:
    - `POST /monitor/collect/c/session...`
    - `POST /ssdk/sd/token...`
    - `POST /ssdk/v2/r...`
- `captures/gs25-pangle-conscrypt-r10.log`
  - `pangle_req` 이벤트로 `/ssdk/v2/r` 식별
- `captures/gs25-pangle-conscrypt-r14-replayprobe.log`
  - 설정 주입 후 `direct_replay_applied` 2건 확인
  - 예: `oldLen=1690 -> newLen=1`

판정:

- direct TLS 경로에서 프레임 길이 매칭 기반 교체 훅이 실제 동작함
- 아직 `get_ads` 경로 직접 교체/응답상태 판정까지는 미완료
  - 다음 단계는 `get_ads` 경로가 뜨는 구간에서 동일 방식으로 교체/결과 비교

## 78) 2026-03-12 direct replay 결과 비교(손상 vs 동일 hex)

추가:

- 응답 요약기:
  - `scripts/gs25-pangle-conscrypt-read-summary.mjs`
- 비교 결과:
  - `captures/gs25-pangle-conscrypt-compare-r19-r18-r21.json`

시나리오:

1. baseline

- 로그: `captures/gs25-pangle-conscrypt-r19-baseline.log`
- 결과: HTTP `200`만 관측

2. 손상 교체(replay corrupt)

- 설정: `match_len=1690`, `hex=00`
- 로그: `captures/gs25-pangle-conscrypt-r18-replay.log`
- 결과: `direct_replay_applied` 후 HTTP `400` 포함
  - `HTTP/1.0 400 Bad Request` 관측

3. 동일 full hex 재주입(replay samehex)

- source:
  - `captures/gs25-pangle-conscrypt-r20-full1690.log`의 `len=1690` `hexFull`
- 로그: `captures/gs25-pangle-conscrypt-r21-replay-samehex.log`
- 결과:
  - `direct_replay_applied` 2건
  - HTTP `200`만 관측(400 미관측)

핵심 해석:

- direct write payload를 임의 손상하면 서버가 즉시 이상 응답(400)으로 반응
- 같은 길이/같은 payload 재주입은 정상 응답(200) 유지
- 즉, 현재 단계에서 `ssdk/sd/token` direct 프레임은
  길이 매칭 기반 재주입 실험에 대해 **부분 재현성**을 보임
- 다만 `get_ads` 경로의 동일한 수준 재현성은 아직 별도 검증이 필요함

## 79) 2026-03-12 protobuf 여부 점검(로그 휴리스틱 + Ghidra 교차확인)

추가:

- protobuf 가능성 요약기:
  - `scripts/gs25-pangle-conscrypt-protobuf-likelihood.mjs`
- 결과 파일:
  - `captures/gs25-pangle-conscrypt-protobuf-likelihood-r20.json`
  - `captures/gs25-pangle-conscrypt-protobuf-likelihood-r10.json`

실행:

```bash
node scripts/gs25-pangle-conscrypt-protobuf-likelihood.mjs \
  captures/gs25-pangle-conscrypt-r20-full1690.log
```

요약 결과(r20):

- 대상 path:
  - `/ssdk/v2/r?...`
- binary chunk: 4
- `likelyChunks`(전체 240B 완전파싱형): 0
- `prefixLikelyChunks`(protobuf 키 시퀀스 시작형): 1
  - 대표 헤드:
    - `08 a2 88 80 81 02 10 01 22 a1 ca 01 ...`
  - 파싱된 초기 필드:
    - field 1 (varint), field 2 (varint), field 4 (len-delimited)

해석:

- `/ssdk/v2/r` 바디의 적어도 일부 프레임은 protobuf wire-key 패턴(특히 `0x08`, `0x10`, `0x22`)으로 시작함
- 다만 이후 청크는 암호화/압축/프레이밍된 데이터로 보이며, 현재 `hexHead(240B)` 기준으로는 전체 메시지 완전 복원은 불가
- 따라서 결론은 **“protobuf 가능성 높음(특히 헤더/초기 프레임)”**이며, **“평문 전체 protobuf 단일 메시지 확정”은 아직 아님**

Ghidra 교차확인:

- `libnms.so` 문자열에서 다음 클래스명이 확인됨:
  - `com.pgl.ssdk.ces.a`
- `JNI_OnLoad` 및 인접 등록 루틴은 난독화/점프테이블 중심으로 즉시 의미있는 메서드명 복원이 어려움
- 정적 단서 + 동적 wire 패턴을 합치면, pangle `ssdk` 경로는 protobuf(또는 protobuf 유사 TLV) 컨테이너를 사용할 가능성이 높음

## 80) 2026-03-12 UI 자동 플로우 재실행(r22) + get_ads 재확인

실행:

```bash
DURATION_SEC=90 scripts/gs25-pangle-conscrypt-capture.sh \
  captures/gs25-pangle-conscrypt-r22-uiauto.log
scripts/gs25-stock-flow-uiautomator.sh
```

요약:

- `captures/gs25-pangle-conscrypt-summary-r22.json`
  - `pangleReq`: 2
  - path:
    - `/ssdk/v2/r?...`
    - `/api/ad/union/sdk/stats/batch/`
- `captures/gs25-pangle-conscrypt-read-summary-r22.json`
  - HTTP `200`: 7
  - replay 적용 없음(`replayApplied=0`)

`get_ads` 여부:

- 이번 r22에서도 `/api/ad/union/sdk/get_ads/`는 미관측
- 즉, 현재 자동화 플로우(검색/재고찾기/목록보기)에서는 광고 fetch 타이밍이 안정적으로 재현되지 않음

protobuf 점검(r22):

- `captures/gs25-pangle-conscrypt-protobuf-likelihood-r22.json`
  - `/ssdk/v2/r`에서 `prefixLikelyChunks=1/4`
  - 대표 시작 시퀀스:
    - `08 a2 88 80 81 02 10 01 22 a1 ca 01 ...`
- 결론은 79와 동일:
  - `ssdk` 초기 프레임 protobuf 가능성 높음
  - 전체 본문은 암호화/압축 등으로 단일 평문 protobuf로 즉시 확정 불가

## 81) 2026-03-12 `/ssdk/v2/r` 직후 선택 변조 실험(after-path arm)

목적:

- 길이기반 무차별 교체가 아닌, `/ssdk/v2/r` 요청 관측 직후 첫 binary chunk만 교체해 영향 범위를 축소

코드 변경:

- `scripts/frida/gs25-pangle-conscrypt-replay-hook.js`
  - `PANGLE_REPLAY_AFTER_PATH` 추가
  - `pangle_req`에서 path 매칭 시 host별 arm
  - 다음 direct write에서 `direct_replay_after_path_applied` 이벤트로 1회 교체 가능
- `scripts/gs25-pangle-conscrypt-replay-probe.sh`
  - `--after-path` 옵션 추가
- `scripts/gs25-pangle-conscrypt-read-summary.mjs`
  - `direct_replay_after_path_applied` 카운트 반영

실험 A (r24, 길이기반 8192 교체):

```bash
scripts/gs25-pangle-conscrypt-replay-probe.sh \
  --after-path "/ssdk/v2/r" \
  --match-len 8192 \
  --hex 00 \
  --duration 90 \
  --out captures/gs25-pangle-conscrypt-r24-replay-v2r-8192.log
```

- 결과:
  - `direct_replay_applied`: 3
  - `statusCounts`: `200`만 관측

실험 B (r25, after-path only 1회 교체):

```bash
scripts/gs25-pangle-conscrypt-replay-probe.sh \
  --after-path "/ssdk/v2/r" \
  --hex 00 \
  --duration 90 \
  --out captures/gs25-pangle-conscrypt-r25-replay-v2r-afterpath-only.log
```

- 이벤트:
  - `direct_replay_armed` 확인
  - `direct_replay_after_path_applied`: 1
    - `oldLen=8192 -> newLen=1`
- 요약:
  - `captures/gs25-pangle-conscrypt-read-summary-r25.json`
  - `statusCounts`: `200`만 관측

해석:

- `/ssdk/v2/r` 직후의 첫 8192 청크 단일 변조는 즉시 HTTP 4xx를 유발하지 않았음
- 앞서 `ssdk/sd/token` 1690 프레임은 손상 시 400이 발생했으므로,
  프레임별로 서버 검증 민감도가 다르거나 재시도/복구 경로가 있는 것으로 보임
- `get_ads` 미관측 문제는 여전히 남아 있으며, 광고 노출 타이밍 전용 UI 시나리오가 다음 우선순위

## 82) 2026-03-12 tiktokpangle 경로 추가 식별 + path 필터 확장 검증

재탐색 결과:

- 기존 `get_ads` 문자열 탐색은 계속 미관측
- 대신 아래 경로가 실측됨(호스트: `api16-access-ttp.tiktokpangle.us`)
  - `/api/ad/union/sdk/strategies/adn`
  - `/api/ad/union/sdk/settings/`

조치:

- `scripts/frida/gs25-pangle-conscrypt-replay-hook.js` 기본 `PANGLE_PATH_FILTER`에
  위 2개 경로를 추가

검증(r26):

- 로그: `captures/gs25-pangle-conscrypt-r26-uiauto-expanded-path.log`
- `pangle_req`로 정상 분류된 경로:
  - `/api/ad/union/sdk/strategies/adn`
  - `/api/ad/union/sdk/settings/`
  - `/ssdk/v2/r?...`
- 요약:
  - `captures/gs25-pangle-conscrypt-summary-r26.json`
  - `captures/gs25-pangle-conscrypt-read-summary-r26.json`

의미:

- 기존 분석 축(`wf-sg`) 외에 `tiktokpangle.us` 경로가 실제 광고 설정/전략 fetch에 관여함이 확인됨
- `get_ads` 재현 전에 선행 설정 경로를 안정적으로 캡처/리플레이할 기반이 생김

## 83) 2026-03-12 settings/strategies body-replace 시도(r27/r28) 결과

목적:

- `PANGLE_REPLAY_BODY_HEX='00'`으로 settings/strategies 요청 body 직접 교체 시도

실행:

- r27: path filter = `/api/ad/union/sdk/settings/`
  - 로그: `captures/gs25-pangle-conscrypt-r27-settings-body-00.log`
- r28: path filter = `/api/ad/union/sdk/strategies/adn,/api/ad/union/sdk/settings/`
  - 로그: `captures/gs25-pangle-conscrypt-r28-strategies-settings-body-00.log`

결과:

- 두 런 모두 해당 path의 `pangle_req` 자체가 미발생하여 `pangle_req_replaced` 없음
- 상태코드는 200만 관측

해석:

- settings/strategies 요청이 UI 재현 플로우에서 비결정적으로 발생함
- 변조 검증을 위해서는 “요청 발생이 보일 때만 arm/replay 적용”하는 트리거형 러너(이벤트 기반)가 필요

## 84) 2026-03-12 get_ads 헌트 자동화 스크립트 추가 + 오탐 수정

추가:

- `scripts/gs25-pangle-path-hunt.sh`
  - 목표 path가 나올 때까지 반복 캡처
  - 기본 타깃: `/api/ad/union/sdk/get_ads/`

초기 이슈:

- 첫 버전은 `ready.pathFilter` 문자열까지 탐지해 `get_ads 발견`으로 오탐지 가능했음

수정:

- 탐지 조건을 `t == pangle_req`의 `path` 필드 매칭으로 변경
  - 즉, 실제 요청 이벤트만 발견으로 인정

검증:

```bash
scripts/gs25-pangle-path-hunt.sh \
  --target "/api/ad/union/sdk/get_ads/" \
  --attempts 1 \
  --duration 50
```

- 결과: `miss` (오탐 없이 정상)

현시점:

- `get_ads` 실요청은 아직 미관측
- 반면 `settings/strategies/stats/v2r` 경로는 반복 관측 가능

## 85) 2026-03-12 idle-flow get_ads 헌트(3회) 결과

추가:

- `scripts/gs25-idle-flow.sh`
  - 앱 실행 후 입력 없이 대기하여 초기 광고 요청 자연 발생 유도

실행:

```bash
scripts/gs25-pangle-path-hunt.sh \
  --target "/api/ad/union/sdk/get_ads/" \
  --attempts 3 \
  --duration 100 \
  --flow-script scripts/gs25-idle-flow.sh
```

결과:

- 3회 모두 `get_ads` 미관측
- 관측된 주요 요청은 `/ssdk/v2/r` 중심

해석:

- `get_ads`는 단순 앱 실행/대기만으로는 재현되지 않음
- 특정 광고 슬롯 노출 또는 WebView/화면 조건이 있어야 호출될 가능성이 큼

## 86) 2026-03-12 settings 헌트(3회) 비재현 구간 확인

실행:

```bash
scripts/gs25-pangle-path-hunt.sh \
  --target "/api/ad/union/sdk/settings/" \
  --attempts 3 \
  --duration 90 \
  --flow-script scripts/gs25-stock-flow-uiautomator.sh
```

결과:

- 3회 모두 `settings` 미관측
- `pangle_req`는 `/ssdk/v2/r`가 공통 관측
- 일부 런에서 `/api/ad/union/sdk/stats/batch/`만 추가 관측

해석:

- `settings/strategies`도 세션/타이밍에 따라 비결정적으로 발생
- 현재 가장 안정적인 리플레이 실험 타깃은 여전히 `/ssdk/v2/r` 및 `ssdk/sd/token`

## 87) 2026-03-12 get_ads 하이브리드 헌트(6회) 결과

추가:

- 하이브리드 플로우:
  - `scripts/gs25-hybrid-flow.sh`
    - `idle(20s)` + `stock-flow` 조합
- 헌트 로그 집계:
  - `scripts/gs25-pangle-hunt-summary.mjs`

실행:

```bash
scripts/gs25-pangle-path-hunt.sh \
  --target "/api/ad/union/sdk/get_ads/" \
  --attempts 6 \
  --duration 110 \
  --flow-script scripts/gs25-hybrid-flow.sh
```

집계:

- `captures/gs25-pangle-getads-hybrid-hunt-summary-20260312.json`
- 총 6개 로그, `pangle_req` 총 8건
  - `/ssdk/v2/r?...`: 6
  - `/api/ad/union/sdk/stats/batch/`: 2
  - `/api/ad/union/sdk/get_ads/`: 0

해석:

- 하이브리드 플로우에서도 `get_ads`는 재현되지 않음
- 현재 단기 실험에서 안정적으로 잡히는 pangle 경로는 `v2r`/`stats`로 수렴
- 따라서 당장 리플레이 검증은 `ssdk` 경로 중심으로 진행하고, `get_ads`는 장시간/이벤트기반 헌트가 필요

## 88) 2026-03-12 path-len 집계 + `/ssdk/v2/r` 611 프레임 변조 검증

추가:

- path/길이 집계 스크립트:
  - `scripts/gs25-pangle-path-len-summary.mjs`

집계(하이브리드 6로그):

- 결과 파일:
  - `captures/gs25-pangle-path-len-summary-hybrid6.json`
- 핵심:
  - `/ssdk/v2/r` 요청 프레임 길이 `611`이 6/6로 고정
  - `/ssdk/v2/r#chunk`: `8192` + `1331`
  - `/stats/batch`: `1203`, `1377` (가변)

실험:

1. baseline

- 로그: `captures/gs25-pangle-conscrypt-r31-baseline-hybrid.log`
- 상태: `200`만 관측

2. replay (`match_len=611`, `hex=00`)

- 로그: `captures/gs25-pangle-conscrypt-r32-replay-v2r-611to00.log`
- 이벤트:
  - `direct_replay_applied` 1건 (`oldLen=611 -> newLen=1`)
  - 직후 `HTTP/1.0 400 Bad Request` 관측
- 요약:
  - `captures/gs25-pangle-conscrypt-read-summary-r32.json`
  - `statusCounts`: `{200: 2, 400: 1}`

해석:

- `/ssdk/v2/r` 요청 프레임(611)은 서버 검증 민감 구간으로 확인됨
- 이전 `ssdk/sd/token(1690)` 손상 시 400 관측 결과와 일관됨
- 즉, `ssdk` 경로는 현재 재현 가능한 “손상 시 실패” 증거가 충분함

## 89) 2026-03-13 `/ssdk/v2/r` 611 프레임 동일재주입(samehex) 검증

목적:

- `611 -> 00` 손상 시 400이 나온 조건에서,
  동일 611바이트 원본을 재주입하면 정상(200)으로 돌아오는지 검증

절차:

1. baseline에서 `len=611` full hex 확보

- 로그: `captures/gs25-pangle-conscrypt-r33-baseline-full611.log`
- `PANGLE_FULL_DUMP_LEN=611` 설정으로 `hexFull` 추출
- 저장: `captures/gs25-pangle-611-fullhex.txt`

2. samehex replay 실행

- 로그: `captures/gs25-pangle-conscrypt-r34-replay-v2r-611-samehex.log`
- 이벤트:
  - `direct_replay_applied` 1건
  - `oldLen=611 -> newLen=611`

3. 3-way 비교 산출

- 파일: `captures/gs25-pangle-conscrypt-compare-r31-r32-r34.json`
  - baseline(r31): `200`만
  - corrupt611(r32): `400` 포함
  - samehex611(r34): `200`만

해석:

- `/ssdk/v2/r`의 611 프레임은
  - 임의 손상 시 서버가 400으로 거부
  - 동일 원본 재주입 시 정상(200) 유지
- 따라서 해당 프레임은 “변조 민감 + 동일재주입 재현 가능” 구간으로 확정

## 90) 2026-03-13 최종 마무리(전체 시도 요약)

이번 세션 범위에서 수행한 핵심 시도군:

1. direct 경로 식별/기반 구축

- Conscrypt direct write/read 후킹
- MITM 비가시 트래픽의 direct 경로 관측 가능화

2. 재현 가능한 replay 검증

- `ssdk/sd/token` 1690:
  - 손상 `-> 400`
  - samehex `-> 200`
- `ssdk/v2/r` 611:
  - 손상 `-> 400`
  - samehex `-> 200`

3. protobuf 가능성 점검

- `/ssdk/v2/r` 초기 청크에서 protobuf wire-key 패턴 반복 관측
- 전체 평문 protobuf 단일 메시지 확정은 보류(암호화/압축 구간 혼재)

4. get_ads / settings / strategies 재현 헌트

- `get_ads`:
  - idle 3회 + hybrid 6회 모두 미관측
- `settings/strategies`:
  - 일부 런에서 관측(r26), 다수 런에서 비재현(r27/r28 및 settings 헌트 3회)
- 최신 stats 헌트:
  - `captures/gs25-pangle-stats-hunt-20260313-090054-r3.log`에서
    `/api/ad/union/sdk/stats/batch/` 재관측(후속 samehex/corrupt 비교는 미실행)

최종 판정:

- **확정**: `ssdk` 경로는 “변조 민감 + 동일재주입 재현 가능”이 실험적으로 확인됨
- **미확정**: `get_ads` 실요청 재현(안정적 트리거) 및 해당 경로 replay 영향
- **운영상 결론**: 단기 반복 실험은 `ssdk` 중심이 효율적이며,
  `get_ads`는 장시간/슬롯조건 기반 헌트가 필요

주요 집계/비교 산출물(핵심):

- `captures/gs25-pangle-conscrypt-compare-r19-r18-r21.json`
- `captures/gs25-pangle-conscrypt-compare-r31-r32-r34.json`
- `captures/gs25-pangle-getads-hybrid-hunt-summary-20260312.json`
- `captures/gs25-pangle-path-len-summary-hybrid6.json`
