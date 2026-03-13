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

## 6. 2026-03-10 Android 원격 재현 라운드 (r26)

대상 기기:

- Samsung `SM-F926N`
- Android 15
- `adb` 원격 제어 가능

실행 스택:

- `mitmdump:8082`
- 기기 `tcpdump -i any`
- Frida attach 시도 후 크래시 확인

산출물:

- `captures/gs25-android-20260310-r26/raw.mitm`
- `captures/gs25-android-20260310-r26/requests.jsonl`
- `captures/gs25-android-20260310-r26/connects.jsonl`
- `captures/gs25-android-20260310-r26/summary.json`
- `captures/gs25-android-20260310-r26/gs25-r26.pcap`
- `captures/gs25-android-20260310-r26/frida-attach.log`

원격 재현 성공 범위:

- 홈 팝업 닫기
- `재고찾기` 진입
- 최근 검색어 `오감자` 선택
- 상품 목록 -> 첫 상품 상세 진입
- `매장 또는 지역을 검색해 보세요` 검색 화면 진입

주요 결과:

- `requests.jsonl` 평문 요청은 총 6건
  - 모두 `tms31.gsshop.com/msg-api/{deviceCert,setConfig,login}.m`
- 요청 바디는 전부 `d=` 단일 파라미터 기반 난독화 문자열
- `connects.jsonl`에는 `m.woodongs.com` CONNECT가 2건 확인됨
- `gs25-r26.pcap` `strings`에서 다음 문자열 재확인:
  - `b2c-apigw.woodongs.com`
  - `b2c-bff.woodongs.com`
  - `external.wdg.data.woodongs.com`

Frida 결과:

- attach 스크립트:
  - `android-ssl-bypass.js`
  - `gs25-b2c-java-net-hook.js`
  - `gs25-b2c-cronet-probe.js`
  - `gs25-b2c-native-sni-only.js`
- 결과:
  - attach 후 약 10초 내 `SIGSEGV (SEGV_ACCERR)`로 앱 크래시
  - 현재 앱은 anti-Frida 또는 유사 보호로 인해 attach 안정성이 매우 낮음

메모:

- `주변매장` 진입은 하단 QR 영역 오탭으로 완주하지 못했음
- 그럼에도 이번 라운드로
  - 원격 adb 재현 가능성
  - `msg-api` 평문 반복성
  - `b2c-*` / `external.wdg.data.woodongs.com` pcap 문자열 증거
    를 재확인함

Datadog/정적 분석 후속:

- Datadog 로그에서 `GoodsStockStoreSearchController` 스택이 확인됨
  - `fetchCurrentPosition` line `248`, `255`
  - `onInit` line `147`
- 같은 로그 세션에서 실제 재고조회 호출이 기록됨
  - `GET https://b2c-bff.woodongs.com/api/bff/v2/store/stock`
  - `statusCode: 200`
- 해당 로그에는 `request_e`, `response_e`가 같이 남아 있음
  - base64 암호문 형태
  - 샘플 `request_e` 디코드 길이 `976 bytes`
- APK 문자열에서 암호화 유틸리티 단서 확인:
  - `package:gstown/src/network/api_response_encryption_utility.dart`
  - `ApiResponseEncrypter`
  - `createEncrypter`
  - `AES_CBC_PKCS7Padding`
- 현재 해석:
  - `재고찾기` 본 API는 `GET /api/bff/v2/store/stock`
  - 하지만 요청/응답은 앱 내부 암복호화 계층을 거칠 가능성이 높아
    단순 query/body 추정만으로는 리플레이가 어려움

추가 리플레이 (2026-03-10):

- 앱 헤더를 복원해 BFF를 직접 호출
- `GET /api/bff/v2/store/stock`
  - 무파라미터: `500`, 내부 URI `/thepop/v1/store/search/results/enhanced`
  - `latitude` + `longitude` + `keyword`: `500`
  - `latitude` + `longitude` + `keyword` + `realTimeStockYn=Y`: `200`
    - 응답: `{"stores":[],"isRetry":false,"storeCount":0}`
  - `realTimeStockYn=N`: 다시 `500`
  - `latitudeString` + `longitudeString` + `keyword` + `realTimeStockYn=Y`도 `200`
- 결론:
  - `realTimeStockYn=Y`는 사실상 필수 플래그
  - 위치 + 키워드만으로는 정상 경로에 진입하지 못함
  - 다만 단순 문자열 상품명만으로는 모두 `0건`이어서,
    실제 앱은 추가 상품 식별자(`GsSearchKeywordInfo`, `item_dcls_cd` 추정)를
    함께 쓸 가능성이 큼

- `GET /api/bff/v2/store/region/names`
  - `keyword=강남`, `keyword=역삼`은 `200`
  - 응답에 `REGION`/`SUBWAY` 타입과 `XCoordination`/`YCoordination` 좌표 포함
  - `keyword` 외 파라미터명(`regionName`, `query`)은 실패

- 추가 보조 확인:
  - `GET /api/bff/v1/store/name?keyword=강남` -> `200 {"stores":[]}`
  - `GET /api/bff/v1/store` -> `500`
    - 내부 URI: `/thepop/v1/store/search/results`
  - `GET /api/bff/v1/store?serviceCode=<값>&XCoordination=<경도>&YCoordination=<위도>`
    는 `200 {"stores":[]}`까지는 진입
    - `serviceCode=1,2,3,4,5,10,20,25` 모두 동일
    - `keyword=강남` 추가 여부와 무관하게 빈 배열
  - `serviceCode`가 없으면 다시 `500`

- 현재 남은 병목:
  - 단순 `keyword`만으로는 non-empty `stores`를 확보하지 못함
  - 상품 검색 단계의 본 호출 `POST https://b2c-apigw.woodongs.com/search/v3/totalSearch`
    의 평문 payload는 아직 미확보
  - 다음 단계는 `GsSearchKeywordInfo` 내부 필드(`item_dcls_cd` 포함) 역추정 또는
    `totalSearch` 쪽 평문 복원

adb 복구 후 추가 실기기 캡처 (2026-03-10):

- 사용자 승인 후 `adb`가 다시 `device` 상태로 복구됨
- 원격 UI 재현:
  - 홈 `재고찾기`
  - 최근 검색어 `오감자`
  - 검색 결과 `총 3개의 상품`
  - `오리온)오감자50G`
  - 지도 화면 `목록보기`
- 새 단서:
  - Datadog 로그에서 검색 결과 생성 직전
    `POST https://b2c-apigw.woodongs.com/search/v3/totalSearch`
    `statusCode: 200` 확인
  - 같은 방식으로 `request_e`, `response_e`가 남음
  - 같은 `view.id`에서 뒤이어
    `POST http://external.wdg.data.woodongs.com/api/addition/autocomplete/offline`
    `statusCode: 200`도 확인
  - 암호문 길이 비교:
    - `totalSearch`: `request_e 1920`, `response_e 4312`
    - `autocomplete/offline`: `request_e 1004`, `response_e 2072`
- `목록보기` 화면에서 실제 위치 기반 재고 목록 확인
  - `GS25 안산중앙점` `6개`
  - `GS25 상록주공점` `12개`
  - `GS25 안산로데오점` `5개`
  - `GS25 안산주은점` `0개`
- 해석:
  - `재고찾기`의 매장 리스트는 `v1/store`가 아니라
    `GET /api/bff/v2/store/stock` 응답만으로 렌더링되는 쪽에 가까움
- 리스트에서 `안산중앙점` 선택 시:
  - 새 Datadog 파일 생성
  - 별도 상세 API 없이 다시
    `GET https://b2c-bff.woodongs.com/api/bff/v2/store/stock`
    `statusCode: 200`
  - 지도 하단 시트에
    - 선택 매장 `안산중앙점`
    - 추천/인접 매장 `안산타워점`
    - `픽업주문` / `배달주문`
      이 표시됨
  - 이번 재호출은 이전 호출과 `request_e` 길이는 같고,
    `response_e` 길이만 더 큼 (`19820 -> 30400`)

- 추가 비교:
  - `totalSearch` 요청(1440 bytes)과 `autocomplete/offline` 요청(752 bytes)은
    디코드 기준 앞 `384 bytes`가 동일
  - 첫 `store/stock` 요청과 선택 후 `store/stock` 재요청은
    디코드 기준 앞 `352 bytes`가 동일
  - 두 `store/stock` 응답은 앞 `8320 bytes`가 동일
  - `search` 계열 요청과 `store/stock` 계열 요청은 공통 prefix가 없음
- 해석:
  - 검색 단계는 공통 검색 컨텍스트 뒤에 API별 필드가 덧붙는 구조일 가능성이 높음
  - 재고 단계는 동일 기본 목록 응답 뒤에 선택 매장 관련 정보가 추가되는 구조로 보임

- `libapp.so` 정적 문자열 추가 확인:
  - 검색/식별자 관련:
    - `GsSearchKeywordInfo`
    - `keywordInfo`
    - `documentId`
    - `productCode`
    - `itemCd`
    - `itemCode`
    - `itemCodeList`
    - `item_dcls_cd`
    - `keyword_result`
    - `org_keyword`
    - `/search/v3/totalSearch`
    - `/api/addition/autocomplete/offline`
  - 재고/매장 관련:
    - `/api/bff/v2/store/stock`
    - `realTimeStockYn`
    - `recommendedStore`
    - `selectedStore`
    - `recommendedStoreAndSelectedStore`
  - 해석:
    - `store/stock`에 필요한 실제 상품 식별자는
      `GsSearchKeywordInfo` 직렬화 결과 일부일 가능성이 매우 높음

Amplitude 캐시 추가 분석 (2026-03-10):

- 루팅된 기기에서 `/data/data/com.gsr.gs25/databases/com.amplitude.api`를 추출해
  `events` 테이블 조회
- `오감자` 선택 플로우에서 확인된 이벤트:
  - `[V] 재고찾기_검색결과`
    - `action=최근검색어`
    - `org_keyword=""`
    - `keyword=오감자`
    - `keyword_result=오감자`
  - `[V] 재고찾기_재고찾기지도`
    - `product_code=8801117752804`
    - `product_name=오리온)오감자50G`
    - `item_1st_category_code=13`
    - `item_2nd_category_code=53`
    - `item_3rd_category_code=01`
    - `item_4th_category_code=2118`
    - `store_keyword=""`
- 해석:
  - 검색결과 단계와 지도 단계 사이에
    `keyword/org_keyword/keyword_result`와
    `product_code/product_name/category code`가 결합되는 구조로 보임

`store/stock` 리플레이 추가 시도 (2026-03-10):

- 위 Amplitude 값으로 `GET /api/bff/v2/store/stock` 재시도
- 결과:
  - `product_code`, `productCode`, `itemCd`, `itemCodeList` 조합은 모두 `storeCount=0`
  - `itemCode=8801117752804`는 내부 `/thepop/v1/store/search/results/enhanced`
    `internal_server_error`
  - `keywordInfo`, `searchKeywordInfo`에 JSON 직렬화 객체를 넣는 시도도 `storeCount=0`
- 현재 결론:
  - `product_code`는 앱 분석 이벤트에는 남지만
    실제 재고조회 핵심 식별자는 아닌 것으로 보임
  - 대신 `itemCode` 파라미터 축이 내부 enhanced 분기를 직접 타므로,
    남은 핵심 병목은 “실제 itemCode 값 확보”로 더 좁혀짐

추가 배제 결과 (2026-03-11):

- 저장소 추가 확인:
  - `tms_1.0.db`: 메시지/알림 중심 DB, 재고찾기 payload 없음
  - `airbridge.db`: 홈/세션 이벤트 위주, `오감자`/`itemCode` 흔적 없음
  - `shared_prefs`, `volley`, `WebView` cache, 일반 cache grep에서도
    `itemCode`, `documentId`, `오리온)오감자50G` 관련 평문 미확인
- 암복호화 키 확인:
  - `request_e`를 secure prefs AES 키로 복호화해도 정상 평문이 안 나옴
  - secure prefs 키와 API 암복호화 키는 별도일 가능성이 높음
- 웹 비교:
  - `m.woodongs.com` 메인 번들의 sourcemap은 확보했지만
    `totalSearch`, `itemCode`, `keywordInfo`, `documentId` 관련 문자열은 없음
  - 현재 앱 재고찾기 로직의 직접 소스는
    Flutter 앱 쪽에 남아 있을 가능성이 더 높음

- 런타임 설정/기타 캐시 추가 점검:
  - `ss_config.xml`, `pref_tms.xml`, `sp_global_file`,
    Firebase Remote Config 활성 JSON까지 확인했지만
    env/API/itemCode 관련 값은 없었음
  - `apminsight/RuntimeContext` 최신 파일을 추출해 확인했지만
    ByteDance/Pangle APM 메타데이터만 있었고
    재고찾기 payload나 `itemCode` 단서는 없었음

- 공개 웹 chunk 재확인:
  - `m.woodongs.com/asset-manifest.json` 기준 모든 JS chunk에 대해
    `/api/bff/v2/store/stock`,
    `/api/bff/v2/store/region/names`,
    `/search/v3/totalSearch`,
    `/api/addition/autocomplete/offline`,
    `realTimeStockYn`,
    `keyword_result`,
    `documentId` exact string을 검색
  - 결과는 전부 `(none)`
  - 따라서 공개 React 웹은 현재 앱 재고찾기/근처매장 구현 경로가 아닌 것으로 정리

- 현재 남은 우선순위:
  - `libapp.so`의 `gs_env.dart` / `flutter_dotenv` /
    `decryptBytesWithEnv` / `_environmentKeyObjectValue` 축을 더 파기

내부 `thepop` 리플레이 추가 (2026-03-11):

- 앱 런타임 헤더 축을 복원해 내부 `thepop` 후보 엔드포인트를 직접 재호출함
- 결과:
  - `GET /thepop/v1/store/customer/representations?latitude=37.3214823&longitude=126.8309767`
    - `200`
    - 서비스별 representation store 정보 반환
    - 확인된 `serviceCode`
      - `gs25ReservationPickup=10`
      - `wdlvyGs25Delivery=30`
      - `wdlvyGs25Pickup=31`
      - `wine25Plus=40`
  - `GET /thepop/v1/stock/wdlvy/realTimeStock`
    - `keyword`, `itemCode`, `productCode`, `itemCd`, `itemCodeList`,
      `documentId` 등 naive query 조합은 전부 `500 internal_server_error`
- 메모:
  - `/api/bff/v1/store` 실험에서 보였던 `serviceCode` 의존성과 연결되는 단서
  - 재고 엔드포인트는 단순 query 방식이 아니라
    앱 내부 request model 직렬화 결과를 받는 쪽일 가능성이 높아짐

재고 request/response 모델명 확인 (2026-03-11):

- `libapp.so` 문자열에서 다음 모델이 직접 확인됨
  - `RetrieveGs25ReservationRealStockRequest`
  - `Gs25ReservationRealStockData`
  - `Gs25ReservationRealStockResponse`
  - `GsWdlvyRealTimeStockResponse`
  - `retrieveGs25ReservationRealStock`
  - `_$RetrieveGs25ReservationRealStockRequestToJson`
- 주변 필드:
  - `searchKeywordInfo`
  - `keywordInfo`
  - `itemCodeList`
  - `item_dcls_cd`
  - `bffServiceCode`
  - `representationStoreYn`
  - `recommendedStoreAndSelectedStore`
  - `stockCount`
- 현재 해석:
  - GS25 재고조회는 `RetrieveGs25ReservationRealStockRequest` 직렬화 기반의
    구조화된 요청일 가능성이 높음
  - 다음 단계는 `GsSearchKeywordInfo`와 위 request model의 연결 필드를 더 찾아
    `store/stock` 또는 내부 `thepop` 재현용 request body를 근사하는 것

Round 27-28: Android raw capture 재정비 (2026-03-11):

- 원인 확인:
  - 기기 글로벌 프록시가 여전히 `172.30.1.27:8082`로 남아 있었음
  - 이 때문에 초기 raw pcap에서는 실제 GS25 목적지 대신
    전부 로컬 프록시 연결만 관측됨
- 조치:
  - `adb shell settings put global http_proxy :0`
  - 프록시 해제 후 동일 UI 플로우를 재수집
- proxy-free 전체 pcap 결과:
  - 약 `28.46s`, `82k` 패킷, `96MB`
  - 시스템 전체 기준 `QUIC/HTTP3` 트래픽이 다수 관측됨
  - 잡음이 매우 커서 단독 pcap만으로 GS25 본 세션을 바로 분리하진 못함
- 보조 추적:
  - 앱 UID `10330` 기준 소켓 스냅샷을 1초 간격으로 수집
  - 관측된 원격지:
    - `35.82.104.186:443`
    - `216.239.36.223:443`
- 메모:
  - `216.239.36.223`는 구글 계열 후보
  - `35.82.104.186`은 AWS 계열 후보로, GS25/woodongs 본 세션일 가능성이 있어
    다음 우선 추적 대상
  - 다만 `host 35.82.104.186 and port 443` 필터 pcap에는
    이번 짧은 UI 전환에서 패킷이 0건이었음
- 현재 결론:
  - proxy-free raw capture 자체는 정상화됨
  - 다음 라운드는 전체 pcap보다
    `uid=10330` 기준 owner 분리 또는 더 긴 시간창에서
    후보 원격지 세션 변화를 추적하는 쪽이 효율적

Round 29: cold start + uid 소켓 재확인 (2026-03-11):

- 앱을 `force-stop` 후 재실행하고 `uid=10330` 소켓을 다시 덤프
- 관측된 원격지:
  - `3.233.158.114:443`
  - `35.155.53.189:443`
  - `13.225.134.90:443`
  - `151.101.65.229:443`
  - `23.209.95.10:443`
  - `142.251.223.33:443`
  - `216.239.32.223:443`
  - 다수 `172.217.*:443`
- 추가로 `13.7s` 길이의 짧은 cold-start 전체 pcap을 수집하고
  AWS 후보(`3.233.158.114`, `35.155.53.189`)만 오프라인 필터링
- 결과:
  - `3.233.158.114:443`로 나가는 `RST/ACK` 1건만 확인
  - `35.155.53.189:443`는 해당 시간창에서 패킷 미관측
- 메모:
  - cold start만 보면 AWS 후보는 "있긴 하지만 활성 데이터 전송 주체"로 확정되진 않음
  - 다음 라운드는 재고찾기/지도 진입 시점에 맞춘 짧은 window와
    같은 순간의 `uid=10330` 소켓 스냅샷을 다시 결합하는 쪽이 맞음

정적 해석 보강 (2026-03-11):

- `assets/flutter_assets/.env` 재확인:
  - backend endpoint 설정만 포함
  - secret/key material은 직접 확인되지 않음
- `libapp.so`에서 BFF 계층 관련 주요 문자열 재확인:
  - `init:_encryptionKey`
  - `init:b2cApiDio`
  - `init:_bffApiInterceptor`
  - `init:appKeyInterceptor`
  - `AccessTokenInterceptor`
  - `requestInterceptorWrapper`
  - `responseInterceptorWrapper`
  - `ApiResponseEncrypter`
  - `decryptBytesWithEnv`
  - `xTenantId`
- 현재 해석:
  - GS25 재고/검색 API는 Flutter `Dio` 기반 BFF client 위에서
    interceptor 체인으로 헤더 주입, app key 주입, access token 주입,
    request/response 암복호화를 처리하는 구조로 보임
  - 따라서 평문 복원 목표 지점은 네트워크 하단보다
    `ApiResponseEncrypter` 또는 `request/responseInterceptorWrapper`가 더 유력

Round 30: tenant/appKey/no-auth client 정적 축 정리 (2026-03-11):

- `libapp.so`에서 추가 문자열 확인:
  - `init:appKeyApi`
  - `_appKeyApiInstance`
  - `readXTenantId`
  - `_b2cApiNoAuthorizationDio`
  - `init:_b2cApiNoAuthorizationDio`
- 현재 해석:
  - `Authorization` 의존 BFF client(`b2cApiDio`)와 별도로
    초기 설정/헤더 부트스트랩용 no-auth Dio가 존재할 가능성이 높음
  - `appKey`와 `xTenantId`는 access token 이전 단계에서 준비되는 값일 수 있음
  - 따라서 `ApiResponseEncrypter`만 바로 파는 것보다
    `appKeyApi/readXTenantId -> no-auth Dio -> b2cApiDio` 순서를 보는 편이 좋음

- 주변 고정 hex 문자열 관찰:
  - `<REDACTED_HASH_SAMPLE_20B_A>` (`20 bytes`)
  - `<REDACTED_HASH_SAMPLE_20B_B>` (`20 bytes`)
  - `<REDACTED_HASH_SAMPLE_48B>` (`48 bytes`)
  - `<REDACTED_HASH_SAMPLE_81B>` (`81 bytes`)
- 메모:
  - `40-hex` 두 값은 길이상 AES key보다는 hash/id 계열 상수 후보로 보임
  - 긴 hex 두 값은 역할 불명이며, 서명 재료 또는 난독화 blob 후보로만 보류

- 기존 Frida 스크립트 점검:
  - `pinning/network/curl/url/header/string/json` 계열 스크립트는 이미 다수 존재
  - 하지만 `appKeyApi`, `readXTenantId`, `_b2cApiNoAuthorizationDio`,
    `ApiResponseEncrypter`, `decryptBytesWithEnv` 직접 타깃 스크립트는 아직 없음
- 다음 우선순위:
  - 실기기 후킹 재시도 시 `pinning bypass`보다
    `tenant/appKey/no-auth Dio` 초기화 흐름을 먼저 확인
  - 그 다음 `requestInterceptorWrapper` / `responseInterceptorWrapper` /
    `ApiResponseEncrypter`로 내려가는 순서가 가장 합리적

Round 31: 경량 attach 재검증 + WebView 경로 확인 (2026-03-11):

- 기기 상태:
  - `adb devices` 기준 `SM-F926N` 정상 연결
  - `/data/local/tmp/frida-server` 재기동 후
    `adb forward tcp:27042 tcp:27042` 설정
- attach 스크립트:
  - `gs25-b2c-bootstrap-probe.js`
  - `gs25-b2c-cronet-probe.js`
  - `gs25-b2c-java-net-hook.js`
- 결과:
  - 이번에는 attach 직후 앱이 즉시 죽지 않았음
  - 즉 anti-Frida는 여전히 의심되지만,
    "가벼운 attach 자체는 항상 실패"하는 상태는 아님

- 관측:
  - `okhttp3.Request$Builder`는 `ClassNotFoundException`
  - `org.chromium.net.UrlRequest$Builder`는 정상 후킹됨
  - 따라서 현재 실행 경로 기준 Java 네트워크 계층은
    OkHttp보다 Cronet 쪽 가능성이 높음

- 실제 UI 재현:
  - 홈 -> `재고찾기`
  - 검색 결과 `불고기 버거`
  - 첫 상품 `리얼)불고기버거(1980원)`
  - 상세 화면 `목록보기`
  - 매장 리스트 (`안산주은점`, `안산로데오점`, `안산중앙점`, `상록주공점` ...)
- 이번 플로우에서는 리스트가 모두 `0개 / 재고 준비중`으로 렌더링됨

- 새 단서:
  - 상품 상세 진입 시
    `com.pichillilorenzo/flutter_inappwebview_2` 채널이 실제로 로깅됨
  - `MethodChannel.invokeMethod`:
    - `onLoadStart`
    - `onUpdateVisitedHistory`
    - `onPageCommitVisible`
    - `onTitleChanged`
    - `onLoadStop`
  - URL은 모두 `data:text/html;charset=utf-8,...` 형태
  - UI dump에도 본문 영역에 `android.webkit.WebView`가 존재함
- 현재 해석:
  - 재고찾기 상품 상세/지도는
    완전한 네이티브 화면이 아니라 `flutter_inappwebview` 기반 `data:` HTML 경로를 사용함
  - 즉 앱이 웹뷰에 로컬 HTML을 띄우고,
    실제 상품/매장 데이터를 JS bridge 또는 별도 채널로 주입할 가능성이 높음

- 한계:
  - 같은 attach 세션에서도
    `Cronet.header`, `Cronet.method`, `URL`, `Socket.connect`로
    직접적인 `woodongs/b2c` 로그는 잡히지 않았음
  - 가능한 경우:
    - attach 시점 이전에 핵심 요청이 이미 끝남
    - 요청이 Java `UrlRequest$Builder`보다 아래 또는 다른 계층에서 생성됨
    - 웹뷰는 로컬 `data:` HTML만 받고 데이터는 앱이 별도 채널로 넣음

- 다음 우선순위:
  - `tenant/appKey/no-auth Dio` 축은 유지하되,
    이제 `WebView.loadDataWithBaseURL`, `addJavascriptInterface`,
    JS bridge 메시지 축을 직접 보는 스크립트가 추가로 필요함

Round 32: WebView bridge 전용 프로브 추가 (2026-03-11):

- 새 스크립트:
  - `scripts/frida/gs25-webview-bridge-probe.js`
- 후킹 범위:
  - `WebView.addJavascriptInterface`
  - `WebView.loadUrl`
  - `WebView.loadData`
  - `WebView.loadDataWithBaseURL`
  - `WebView.evaluateJavascript`
  - `WebView.postWebMessage`
  - `WebMessagePort.postMessage`

- 실기기 attach:
  - attach 자체는 안정적
  - 다만 홈 단계에서 광고 WebView가 먼저 대량 로깅됨
    - `googleAdsJsInterface`
    - `googleads.g.doubleclick.net`
    - `google.afma.*`
    - `omidBridge.*`

- 현재 해석:
  - WebView 전역 후킹 방향은 맞지만,
    GS25 재고 상세/지도 WebView보다 홈 광고 WebView가 먼저 잡혀 노이즈가 큼
  - 다음 라운드에서는 `googleads` / `google.afma` / `omidBridge`를 제외하는
    필터링 버전이 필요함

Round 33: 필터링 후 WebView JS payload 확보 (2026-03-11):

- `gs25-webview-bridge-probe.js`에 광고 노이즈 필터 추가
  - 제외:
    - `googleads.g.doubleclick.net`
    - `google.afma`
    - `omidBridge`
    - `googleAdsJsInterface`
- 결과:
  - 홈 광고 WebView 로그는 사실상 사라짐
  - 재고찾기 상세/지도 플로우의 JS 주입이 직접 관측되기 시작함

- 재현 플로우:
  - `재고찾기`
  - `불고기 버거`
  - `리얼)불고기버거(1980원)`
  - 상세 지도 화면
  - `목록보기`
  - 첫 매장 선택

- 관측된 `evaluateJavascript`:
  - `setMyLocationMarker(37.3177334, 126.8414634, 0.0)`
  - `setCenter(37.3177334, 126.8414634)`
  - `setAllStoreMarker([...])`
  - 매장 선택 후:
    - `setAllStoreMarker([...])` 재호출
    - `onMarkerClick("01", "VE463", true, false, true)`
    - `setCenter(37.31824253900691, 126.84142101676044)`
    - `setLevel(3, false)`

- `setAllStoreMarker([...])` 내부에서 직접 확인된 필드:
  - `storeCode`
  - `serviceCode`
  - `balloonText`
  - `latitude`
  - `longitude`
  - `enable`
  - `outstandingStoreType`
  - `isFavoriteStore`
- 샘플:
  - `{"storeCode":"VN115","serviceCode":"01","balloonText":"0개","latitude":37.313957827838635,"longitude":126.83910631508633,"enable":false,"outstandingStoreType":"none","isFavoriteStore":false}`
  - `{"storeCode":"VKA62","serviceCode":"01","balloonText":"0개","latitude":37.32015040862616,"longitude":126.84486673888017,"enable":false,"outstandingStoreType":"none","isFavoriteStore":false}`
- 같은 플로우에서 전체 5건 배열도 다시 확보:
  - `VN115` / `01` / `0개` / `(37.313957827838635, 126.83910631508633)`
  - `VKA62` / `01` / `0개` / `(37.32015040862616, 126.84486673888017)`
  - `V8W74` / `01` / `0개` / `(37.318769344413546, 126.83724981724001)`
  - `VI383` / `01` / `0개` / `(37.31798980300143, 126.83861565896433)`
  - `VE463` / `01` / `0개` / `(37.31824253900691, 126.84142101676044)`

- 현재 해석:
  - 재고찾기 지도/목록 데이터는 앱 내부에서 WebView JS 함수 인자로 직접 주입됨
  - 즉 네트워크 payload를 아직 복호화하지 못해도,
    매장 코드/서비스 코드/좌표/재고 문구는 앱 -> WebView 경계에서 평문 확보 가능
  - 다음 목표는 `setAllStoreMarker` 전체 payload와
    상품 식별자(`itemCode` 계열)가 넘어오는 다른 JS/bridge 호출을 더 찾는 것

Round 34: JS->앱 콜백 직접 캡처 및 왕복 상관관계 확인 (2026-03-11):

- 추가 스크립트:
  - `scripts/frida/gs25-webview-callhandler-probe.js`
  - 타깃: `com.pichillilorenzo.flutter_inappwebview_android.webview.JavaScriptBridgeInterface._callHandler`

- 실기기 상태:
  - 앱 PID 기준 attach 성공 (`com.gsr.gs25`)
  - `_callHandler` 오버로드 1개 후킹 활성화 확인

- 이번 라운드의 핵심 캡처:
  - `arg0=onMarkerClick`
  - `arg1=15`
  - `arg2=["01","VE463"]`

- 추가 캡처:
  - `arg0=onDragStart`
  - `arg1=19`
  - `arg2=["(37.31823797813371, 126.84141357702242)"]`
  - `arg0=onDragEndOrZoomChangedAndAnimated`
  - `arg1=48`
  - `arg2=[3,"(37.318237947893095, 126.84139101376316)"]`
  - `arg0=callAsyncJavaScript`
  - `arg1=21`
  - `arg2=[{"error":null,"resultUuid":"ab26b135-0e11-4cd5-ac2c-3b3a254b8ee5"}]`

- 같은 타이밍의 WebView JS 로그 상관관계:
  - `evaluateJavascript`에서
    `window.flutter_inappwebview.callHandler('callAsyncJavaScript', ... resultUuid='ab26b135-0e11-4cd5-ac2c-3b3a254b8ee5')`
    호출이 잡혔고,
  - 이후 `_callHandler`에서 동일 `resultUuid`가 회수됨

- 해석:
  - `onMarkerClick`, `onDragStart`, `onDragEndOrZoomChangedAndAnimated`는
    JS(WebView) -> 앱(Flutter/Android) 방향 콜백이 실제 동작함을 확인
  - 따라서 지도 상호작용의 재현/리플레이 입력 파라미터는
    최소한 `serviceCode`, `storeCode`, `zoomLevel`, `latlng` 축으로 정리 가능

Round 35: 다른 매장 선택 시 WebView 재주입 payload 확장 확인 (2026-03-11):

- 세션:
  - PID attach 상태에서 `재고찾기 -> 오리온)오감자버터갈릭64G -> 목록보기` 재현
  - `안산로데오점` 영역 탭으로 선택 매장 변경 유도

- `_callHandler` 캡처:
  - `onDragStart` / `onDragEndOrZoomChangedAndAnimated` / `callAsyncJavaScript`는 반복 확인
  - 이번 라운드에서는 `onMarkerClick`이 JS->앱으로 직접 올라오기보다,
    앱->WebView 명령(`evaluateJavascript`)으로 관찰됨

- `evaluateJavascript` 신규 핵심 캡처:
  - `setAllStoreMarker([...])`가 7개 매장으로 재주입됨
  - 이어서 순차 호출:
    - `onMarkerClick("01", "VI383", true, false, true)`
    - `setCenter(37.31798980300143, 126.83861565896433)`
    - `setLevel(3, false)`
    - `setTouchable(false, false)`
    - `setTouchable(true, true)`

- 새로 확인된 매장 코드/재고 텍스트 (샘플):
  - `VKX22` (`0개`)
  - `VI383` (`4개`)
  - `VE463` (`4개`)
  - `V6J73` (`1개`)
  - `VMM47` (`1개`)

- 의미:
  - 매장 선택 시 앱이 WebView 내부 상태를 직접 조작하는 명령 시퀀스가 명확해짐
  - 리플레이 관점에서 핵심 인자는 여전히 `serviceCode/storeCode/lat/lng/level`이며,
    `setTouchable` 토글까지 포함한 UI 제어 단계가 추가로 확인됨

Round 36: JSON 자동 추출기 도입 및 실측 검증 (2026-03-11):

- 신규 스크립트:
  - `scripts/frida/gs25-webview-replay-extract.js`
  - 기능:
    - `evaluateJavascript`에서 아래 함수를 파싱해 JSON 이벤트 출력
    - `setAllStoreMarker` -> `markers`
    - `onMarkerClick` -> `marker_click`
    - `setCenter` -> `center`
    - `setLevel` -> `level`
    - `setTouchable` -> `touchable`

- 로그 포맷:
  - `[GS25_REPLAY] {"t":"<event>","ts":<unix_ms>,"payload":{...}}`

- 실측 결과 1 (상세 지도 진입 직후):
  - `center`: `37.3180536, 126.8413164`
  - `markers` 5건:
    - `VN115(0개)`, `VKA62(0개)`, `V8W74(0개)`, `VI383(4개)`, `VE463(4개)`

- 실측 결과 2 (목록보기 -> 매장 선택 후):
  - `markers` 7건 재주입:
    - `VKX22(0개)`, `VN115(0개)`, `V8W74(0개)`, `VI383(4개)`, `VE463(4개)`, `V6J73(1개)`, `VMM47(1개)`
  - `marker_click`:
    - `{"serviceCode":"01","storeCode":"VI383","selected":true,"fromList":false,"moveCenter":true}`
  - `center`:
    - `37.31798980300143, 126.83861565896433`
  - `level`:
    - `{"level":3,"animate":false}`
  - `touchable` 토글:
    - `false,false` -> `true,true`

- 의미:
  - 이제 사람이 로그를 수동 파싱하지 않아도
    매장 리스트/선택/중심좌표/줌/터치제어를 구조화된 데이터로 즉시 축적 가능
  - 리플레이 엔진 입력 생성 자동화의 직접 전처리 단계가 마련됨

Round 37: JSONL 캡처 러너 + 파라미터 변환기 추가 (2026-03-11):

- 추가 파일:
  - `scripts/gs25-webview-replay-capture.sh`
    - Frida 추출기를 attach하고 `[GS25_REPLAY]`만 분리해
      `gs25-replay-events.jsonl`로 저장
  - `scripts/gs25-replay-events-to-params.mjs`
    - 이벤트 JSONL을 읽어 `latestState`/`replaySequence` 형태의
      리플레이 파라미터 JSON으로 변환

- 변환기 검증:
  - 샘플 이벤트 8건 입력 기준 출력 확인
  - `markersCount=7`, `selectedStore=VI383`,
    `center/level/touchable` 최신 상태가 정상 반영됨

Round 38: 환경 재점검 + Ghidra 1차 정적분석 착수 (2026-03-12):

- 목적:
  - 기존 WebView 리플레이 자동화 상태를 재확인하고,
    Ghidra 기반으로 GS25 바이너리 정적 단서를 병행 확보

- 실행/연결 확인:
  - `python3 -m pip show frida-mcp` 확인 완료 (`frida-mcp 0.1.1`)
  - `adb devices -l` 실기기 1대 연결 확인 (`SM_F926N`)
  - `adb forward tcp:27042 tcp:27042` 설정 확인
  - `frida-ps -H 127.0.0.1:27042 -ai | rg -i 'com\\.gsr\\.gs25|우리동네GS'`
    로 앱 식별 확인

- 캡처 러너 점검:
  - 앱 launch 후 PID 확보:
    - `adb shell monkey -p com.gsr.gs25 -c android.intent.category.LAUNCHER 1`
    - `adb shell pidof com.gsr.gs25` -> `26046`
  - 실행:
    - `scripts/gs25-webview-replay-capture.sh --host 127.0.0.1:27042`
  - 산출물:
    - `captures/gs25-replay-20260312-102623/frida-replay-raw.log` (13 lines)
    - `captures/gs25-replay-20260312-102623/gs25-replay-events.jsonl` (0 lines)
  - 해석:
    - attach 자체는 정상 (`[+] gs25-webview-replay-extract ready`)
    - 본 라운드는 UI 재현(재고찾기 -> 상세지도 -> 목록보기/매장선택) 미수행으로 이벤트 미포착

- Ghidra 준비/대상 추출:
  - APK 위치:
    - `tmp/gs25-apk/base.apk`
    - `tmp/gs25-apk/split_config.arm64_v8a.apk`
  - 분석용 so 추출:
    - `tmp/gs25-apk/lib/libapp.so`
    - `tmp/gs25-apk/lib/libnms.so`

- 1차 정적 단서:
  - `libapp.so` 문자열에서 아래 핵심 식별자 확인
    - `package:gstown/src/models/request/retrieve_gs25_reservation_real_stock_request.dart`
    - `ApiResponseEncryptionConverter`
    - `responseInterceptorWrapper`
    - `B2C_API_URL`, `B2C_REFRIGERATOR_API_URL`
    - `/catalog/v1/gs25/reservation/items`
    - `/refrigerator/v1/wine25/stock/infm/`
    - `Gs25ReservationRealStockData`
    - `buildB2cRefrigeratorApiServerAddressSetting`
  - `libnms.so`는 `JNI_OnLoad` 및 다수 native 함수를 확인/디컴파일 가능
    - `JNI_OnLoad` 내부 초기화/점프 테이블 호출 존재
    - 문자열 XOR decode 성격 함수(`FUN_00115134`) 확인

Round 39: 리플레이 핵심 이벤트 엄격 검증 추가 (2026-03-12):

- 변경:
  - `scripts/gs25-replay-events-to-params.mjs`에
    `--strict-core` 옵션 추가
  - 핵심 이벤트 5종(`markers`, `marker_click`, `center`, `level`, `touchable`) 미충족 시
    변환 단계에서 비정상 종료

- 검증:
  - 실제 캡처(`captures/gs25-replay-20260312-102623/gs25-replay-events.jsonl`)
    - 이벤트 0건으로 `exit=2`
  - 부분 샘플 이벤트로 strict 검증
    - 누락 이벤트: `marker_click`, `level`, `touchable`
    - `exit=3`

- 의미:
  - "이번 캡처가 완전 리플레이 가능한가"를
    정량적 조건으로 자동 판정 가능해짐

Round 40: ADB 자동 재현으로 핵심 이벤트 5종 충족 (2026-03-12):

- 실행:
  - `scripts/gs25-webview-replay-capture.sh --host 127.0.0.1:27042 --out captures/gs25-replay-20260312-auto-r2`
  - ADB 탭 시나리오:
    - `재고찾기` -> `오감자` -> `오리온)오감자50G` -> `목록보기` -> 매장 선택

- 산출물:
  - `captures/gs25-replay-20260312-auto-r2/frida-replay-raw.log`
  - `captures/gs25-replay-20260312-auto-r2/gs25-replay-events.jsonl` (7 lines)
  - `captures/gs25-replay-20260312-auto-r2/gs25-replay-events.params.json`

- strict 검증:
  - `node scripts/gs25-replay-events-to-params.mjs <jsonl> --strict-core`
  - 결과: 통과 (`exit=0`)
  - `missingCoreEventTypes=[]`
  - `isCoreReplayReady=true`

- 주요 이벤트 샘플:
  - `marker_click`: `storeCode=VKX22`
  - `center`: `37.317942551967896, 126.83563792427199`
  - `level`: `3`
  - `touchable`: `false/false -> true/true`

- 캡처 스크립트 개선:
  - `[Remote::PID ...] -> [GS25_REPLAY]` 출력 패턴도 추출되도록
    `awk` 부분매칭으로 변경
  - 실시간 추출 누락 시 raw 로그 재파싱 fallback 추가

Round 41: b2c 암복호화 윈도우 후킹 1차 적용 (2026-03-12):

- 추가:
  - `scripts/frida/gs25-b2c-crypto-window-hook.js`
  - `scripts/gs25-b2c-crypto-capture.sh`

- 목적:
  - `request_e/response_e`를 포함한 b2c 요청/응답 직렬화 경계 추적

- 실행 결과:
  - `captures/gs25-b2c-crypto-20260312-r1` ~ `r4` 생성
  - 후킹 성공:
    - `org.chromium.net.UrlRequest$Builder`
    - `android.net.Uri$Builder`
    - `android.util.Base64`
    - `javax.crypto.Cipher`
  - 후킹 실패:
    - `okhttp3.*` (`ClassNotFound`)

- 관측 요약:
  - `r2`에서 `uri_query_append` 이벤트가 대량 포착됐지만
    광고 SDK 잡음 비중이 높았음
  - `request_e/response_e` 관련 평문 이벤트는 미포착

- 판정:
  - Java/Cronet 표면 후킹 기반 1차 도구는 마련되었으나,
    아직 b2c payload 평문 추출까지는 도달하지 못함

Round 42: 네이티브 SSL 버퍼 후킹(spawn) 적용 (2026-03-12):

- 추가 파일:
  - `scripts/frida/gs25-b2c-native-payload-hook.js`
  - `scripts/gs25-b2c-native-payload-capture.sh`
  - `scripts/gs25-b2c-native-events-summary.mjs`

- 주요 변경:
  - capture 러너에 `--spawn` 옵션 추가
  - `SSL_write/SSL_read` + `send/recv/write/read` 동시 후킹
  - 이벤트 JSONL 요약 스크립트로 요청 라인/경로 빈도 집계

- 실행 라운드:
  - `captures/gs25-b2c-native-20260312-r1` ~ `r3` (attach)
  - `captures/gs25-b2c-native-20260312-r4-spawn` ~ `r6-spawn` (spawn)

- 실측 결과(r5/r6 spawn):
  - `SSL_write/SSL_read` 이벤트 다수 수집 성공
  - 평문 경로 예시:
    - `/msg-api/deviceCert.m`
    - `/msg-api/setConfig.m`
    - `/msg-api/login.m`
    - `/api/v4/apps/ourgs/events/mobile-app/9160`
    - `/ia-sdk-config/...`
  - `PRI * HTTP/2.0` 프리페이스와 HTTP/2 프레임 단서 확인

- 요약 판정:
  - `node scripts/gs25-b2c-native-events-summary.mjs captures/gs25-b2c-native-20260312-r6-spawn/gs25-b2c-native-events.jsonl`
  - `totalEvents=123`, `totalIoEvents=112`, `b2cHintCount=0`
  - 아직 `b2c-apigw/b2c-bff` 직접 단서는 미포착

Round 43: r9 재수집 및 host/path 자동 매핑 보강 (2026-03-12):

- 변경:
  - `scripts/frida/gs25-b2c-native-payload-hook.js`
    - hexdump fallback 길이 `64 -> 16384` 상향
  - `scripts/gs25-b2c-native-events-summary.mjs`
    - bytes 기반 HTTP/1 요청/Host 파싱으로 전환
    - `topHosts`, `topHostRequestLines` 산출 추가
  - `scripts/gs25-h2-header-decode.py`
    - hex 파싱 로직 정합성 보강

- 실행:
  - `captures/gs25-b2c-native-20260312-r9-spawn` 생성
  - `node scripts/gs25-b2c-native-events-summary.mjs captures/gs25-b2c-native-20260312-r9-spawn/gs25-b2c-native-events.jsonl`
  - `python3 scripts/gs25-h2-header-decode.py captures/gs25-b2c-native-20260312-r9-spawn/gs25-b2c-native-events.jsonl`

- 결과:
  - `totalEvents=178`, `totalIoEvents=167`, `b2cHintCount=1`
  - GS 계열 host/path 식별:
    - `tms31.gsshop.com` -> `/msg-api/deviceCert.m`, `/msg-api/setConfig.m`
  - 광고/분석 도메인 비중이 여전히 큼
  - `h2DecodedConnections=[]` (HTTP/2 헤더 복원 미성공)

- 결론:
  - 네이티브 후킹 + 요약 파이프라인은 안정화됨
  - 그러나 "완전히 리플레이 가능한 b2c 패킷(request_e/response_e)" 확보는 아직 아님

Round 44: Ghidra+Frida로 PGL native 브릿지 매핑 (2026-03-12):

- Ghidra 확인:
  - `libnms.so`에서 `JNI_OnLoad`, `FUN_00115134` 디컴파일 확인
  - `FUN_00115134`: 문자열 XOR 디코더 성격
  - 문자열/클래스 단서: `com.pgl.ssdk.ces.a`

- Frida 수집:
  - `scripts/frida/gs25-jni-registernatives-hook.js`
  - `scripts/gs25-jni-natives-capture.sh`
  - `scripts/frida/gs25-pgl-meta-hook.js`
  - `scripts/gs25-pgl-meta-capture.sh`
  - `scripts/gs25-pgl-meta-summary.mjs`

- 실행 산출물:
  - `captures/gs25-jni-natives-20260312-r2/gs25-jni-natives-events.jsonl`
  - `captures/gs25-pgl-meta-20260312-r1/gs25-pgl-meta-events.jsonl`

- 관측:
  - 로드된 native 메서드 스냅샷에서 확인:
    - `public static native Object com.pgl.ssdk.ces.a.meta(int, Context, Object)`
  - `meta` 후킹에서 코드별 호출/반환 타입 관측:
    - `227`: `String -> String` (긴 난독/암호화 텍스트 형태)
    - `301`: `null -> [B`
    - `302`: `[B -> String`
    - `303`: `null -> String`
    - `222`: `Object[] -> [B`
    - `223`: `[B -> Integer`

- 해석:
  - `com.pgl.ssdk.ces.a.meta`는 광고/디바이스 지문(anti-fraud) 계열 네이티브 브릿지로 보임
  - 현재까지는 `request_e/response_e`의 b2c 암복호화 직접 경계와는 분리된 축으로 판단

Round 45: `msg-api` 완전 리플레이 검증 (2026-03-12):

- 변경:
  - `scripts/gs25-msg-api-payload-extract.mjs`
    - hexdump 바이트 파싱 로직 보정(주소/ASCII 컬럼 혼입 제거)
    - `/msg-api/login.m` 누락 해소

- 실행:
  - `node scripts/gs25-msg-api-payload-extract.mjs captures/gs25-b2c-native-20260312-r10-spawn/gs25-b2c-native-events.jsonl`
  - 대상 추출:
    - `/msg-api/deviceCert.m` (`d` 길이 492)
    - `/msg-api/setConfig.m` (`d` 길이 192)
    - `/msg-api/login.m` (`d` 길이 152)
  - 재전송:
    - `curl -H 'Content-Type: application/x-www-form-urlencoded; charset=UTF-8' --data-urlencode 'd@...' https://tms31.gsshop.com/msg-api/{deviceCert|setConfig|login}.m`

- 결과:
  - 세 엔드포인트 모두 HTTP 200 응답
  - 동일 `d`를 연속 2회 전송 시 응답 바디 동일(`cmp` 일치)
    - `deviceCert.m`: 216 bytes
    - `setConfig.m`: 128 bytes
    - `login.m`: 128 bytes

- 결론:
  - `msg-api` 축은 "완전 리플레이 가능한 패킷" 확보 완료
  - 다만 목표 축인 `request_e/response_e`(b2c)는 여전히 별도 추적 필요

Round 46: `msg-api` 요청-응답 상관관계 추출 (2026-03-12):

- 추가:
  - `scripts/gs25-msg-api-response-extract.mjs`
    - `ssl` 포인터별 `ssl_write/ssl_read` stream 재조립
    - HTTP/1 요청/응답 파싱
    - chunked + gzip 응답 해제
    - 응답 `sha256` 산출

- 실행:
  - `captures/gs25-b2c-native-20260312-r9-spawn/gs25-b2c-native-events.jsonl`
  - `captures/gs25-b2c-native-20260312-r10-spawn/gs25-b2c-native-events.jsonl`

- 결과:
  - 두 라운드 모두 `/msg-api/deviceCert.m`, `/msg-api/setConfig.m`, `/msg-api/login.m`
    요청-응답 3쌍 매칭 성공
  - 응답은 gzip 해제 후 JSON 오브젝트가 아닌 base64 암호문 텍스트
  - 응답 해시가 라운드 간 동일:
    - `deviceCert`: `<REDACTED_DEVICECERT_HASH>`
    - `setConfig`: `<REDACTED_SETCONFIG_HASH>`
    - `login`: `<REDACTED_LOGIN_HASH>`

- 결론:
  - `msg-api`는 요청/응답 모두 결정적으로 재현 가능
  - 평문 의미 해석은 base64 이후 추가 복호화 루틴 추적이 필요

Round 47: r11 spawn + monkey 장시간 캡처 (2026-03-12):

- 실행:
  - `captures/gs25-b2c-native-20260312-r11-spawn`
  - spawn 후킹 + `adb shell monkey -p com.gsr.gs25 --throttle 180 -v 500`

- 결과:
  - 이벤트: `totalEvents=211`, `totalIoEvents=200`
  - `msg-api` 추출 7건:
    - `deviceCert` 1회
    - `setConfig` 3회
    - `login` 3회
  - 응답 hash는 이전 라운드(r9/r10)와 동일 패턴 반복
  - `woodongs/b2c-apigw/b2c-bff/request_e/response_e` 직접 문자열 히트 없음

- 결론:
  - 랜덤 입력(monkey)만으로는 b2c 타격 실패
  - 다음은 `재고찾기` 고정 UI 시퀀스 자동화(좌표/요소 기반)로 타겟 캡처 필요

Round 48: 재고찾기 고정 탭 스크립트 적용(r12, 2026-03-12):

- 추가:
  - `scripts/gs25-stock-flow-adb.sh`
    - 앱 실행 -> 재고찾기 -> 최근검색어 -> 첫 상품 -> 목록보기 순서 탭 자동화
    - 좌표 환경변수 오버라이드 지원

- 실행:
  - `captures/gs25-b2c-native-20260312-r12-stockflow`
  - spawn 캡처와 병행 실행

- 결과:
  - 이벤트: `totalEvents=211`, `totalIoEvents=200`, `b2cHintCount=0`
  - `msg-api`만 반복:
    - `deviceCert` 1회
    - `setConfig` 2회
    - `login` 2회
  - `woodongs/b2c-apigw/b2c-bff/request_e/response_e` 직접 히트 없음

- 결론:
  - 스크립트 프레임은 마련됨
  - 현재 좌표값 튜닝 전까지는 b2c 목표 호출 유도 성공률이 낮음

Round 49: UIAutomator 기반 흐름 자동화(r13~r15, 2026-03-12):

- 추가:
  - `scripts/gs25-stock-flow-uiautomator.sh`
    - text/content-desc 매칭 우선 탭 + 좌표 fallback
  - `scripts/gs25-uiauto-text-scan.sh`
    - 현재 화면의 text/content-desc/bounds 추출

- 실행:
  - `captures/gs25-b2c-native-20260312-r13-uiauto`
  - `captures/gs25-b2c-native-20260312-r14-uiauto2`
  - `captures/gs25-b2c-native-20260312-r15-uiauto3`

- 결과:
  - 세 라운드 모두 `msg-api` 반복 패턴으로 수렴
  - `woodongs/b2c-apigw/b2c-bff/request_e/response_e` 직접 히트 없음
  - UI 스캔에서 주소 설정 모달 상시 노출 상태 확인:
    - `현재 주소를 먼저 설정해 주세요`
    - `주소에 따라 배달매장이 변경되어 ...`
    - `취소`, `확인`

- 결론:
  - 실패 원인은 좌표 오차보다 상태 모달(주소 설정) 처리 부재가 큼
  - 다음은 모달 해제(취소) 전용 루틴 + 재고찾기 진입 루틴 분리 필요

Round 50: 모달 해제 루프 + UI 스캔 보강(r16, 2026-03-12):

- 수정:
  - `scripts/gs25-stock-flow-uiautomator.sh`
    - 단계별 `닫기/취소` 반복 해제 루프 추가
- 추가:
  - `scripts/gs25-uiauto-text-scan.sh`
    - 현재 화면 text/content-desc/bounds 추출

- 실행:
  - `captures/gs25-b2c-native-20260312-r16-uiauto4`

- 결과:
  - 이벤트: `totalEvents=113`, `totalIoEvents=102`, `b2cHintCount=0`
  - `msg-api`와 광고 SDK 요청만 관측
  - `woodongs/b2c-apigw/b2c-bff/request_e/response_e` 히트 없음
  - `uiauto-flow.log`에서 `닫기|취소` 매칭 실패 지속
  - 동시 스캔 파일 `uiauto-scan.txt` 0바이트(해당 시점 dump 비어있음)

- 결론:
  - 자동화 다음 병목은 "화면 상태 관측 안정성"
  - dump 재시도/전면 앱 확인을 붙인 관측 안정화가 선행되어야 함

Round 51: 전면확인 보정 + 재시도 캡처(r17~r20, 2026-03-12):

- 수정:
  - `scripts/gs25-stock-flow-uiautomator.sh`
    - `dumpsys window` 기반 전면확인 추가
    - dump 재시도 옵션(`DUMP_RETRY`) 추가
    - `mCurrentFocus` 파싱을 마지막 라인으로 보정(초기 null 오인 제거)
    - 주소 모달 전처리 옵션(`FALLBACK_ADDRESS_CANCEL`, `KEYCODE_BACK`) 추가
  - `scripts/gs25-uiauto-text-scan.sh`
    - 스캔 재시도 옵션(`SCAN_RETRY`) 추가

- 실행:
  - `r17` ~ `r20` 수행

- 결과:
  - `r19`에서 전면확인 성공 로그 확인
  - 하지만 텍스트 매칭은 계속 실패하고 fallback 좌표로만 진행
  - `r17~r19`는 여전히 `msg-api`/광고 트래픽 중심, b2c 직접 히트 없음
  - `r20`은 이벤트가 16건으로 축소되어 분석 기준에서 제외

- 결론:
  - 전면확인 버그는 해결됐으나, Flutter 접근성 노드 비가시성으로 UI 자동화 정확도가 낮음
  - 다음 우선순위는 "수동 UI 조작 + spawn 캡처"로 b2c 타깃 노출을 먼저 확보하는 것

Round 52: JNI RegisterNatives 매핑 확정 + Ghidra 오프셋 연계(2026-03-12):

- 수정:
  - `scripts/frida/gs25-jni-registernatives-hook.js`
    - `RegisterNatives`를 JNI 함수 테이블 index 215에서 직접 후킹
    - `register_native` 이벤트에 `moduleName/moduleOffset` 추가
  - `scripts/gs25-jni-natives-summary.mjs` 추가

- 실행:
  - `captures/gs25-jni-natives-20260312-r6-module-offset`
  - `node scripts/gs25-jni-natives-summary.mjs .../gs25-jni-natives-events.jsonl`

- 결과:
  - 등록 메서드 92건 관측
  - `com.pgl.ssdk.ces.a.meta`가 `libnms.so+0x39894`로 확정
  - Ghidra `FUN_00139894` 디컴파일과 오프셋 정합 확인
  - 내부 디스패처 `FUN_00139a5c`로 분기하는 난독화 상태머신 구조 확인

- 결론:
  - `msg-api` 외 b2c 완전 리플레이는 여전히 미확보
  - 다만 이제 `libnms` 핵심 JNI 엔트리 주소가 고정되어 다음 훅 지점이 명확해짐

Round 53: `meta` 네이티브 분기 추적(code->helper) 확보(2026-03-12):

- 추가:
  - `scripts/frida/gs25-pgl-meta-native-trace.js`
    - `libnms.so+0x39894(meta)`와 주요 helper 함수 동시 후킹
    - `meta` code 기준으로 helper 호출 태깅
  - `scripts/gs25-pgl-meta-native-trace-capture.sh`
  - `scripts/gs25-pgl-meta-native-trace-summary.mjs`

- 실행:
  - `captures/gs25-pgl-meta-native-trace-20260312-r2`
  - `captures/gs25-pgl-meta-native-trace-20260312-r3-long`

- 결과:
  - code별 주요 helper 매핑:
    - `224 -> FUN_00135680`
    - `227 -> FUN_001177c8 -> FUN_00119f08`
    - `301 -> FUN_00128654`
    - `302 -> FUN_00128384`
    - `303 -> FUN_001285c4`
  - 공통: `meta_dispatch(FUN_00139a5c)` 선행

- 결론:
  - `224/227/301/302/303`이 하나의 루틴이 아니라 helper별로 명확히 분기됨을 확인
  - 다음 타깃은 `FUN_00128654/00128384/001285c4/00135680` 입출력 객체 계측

Round 54: Java+Native 동시 캡처로 code별 반환 타입 상관 검증(2026-03-12):

- 추가:
  - `scripts/gs25-pgl-meta-dual-capture.sh`
    - `gs25-pgl-meta-hook.js` + `gs25-pgl-meta-native-trace.js` 동시 수집
  - `scripts/gs25-pgl-meta-dual-summary.mjs`
    - code별 Java return class + native helper 빈도 통합 요약

- 실행:
  - `captures/gs25-pgl-meta-dual-20260312-r1`

- 결과:
  - `224`: Java `String`, Native `FUN_00135680`
  - `227`: Java `String`, Native `FUN_001177c8 -> FUN_00119f08`
  - `301`: Java `[B`, Native `FUN_00128654`
  - `302`: Java `String`, Native `FUN_00128384`
  - `303`: Java `String`, Native `FUN_001285c4`

- 결론:
  - 목표 code 5종의 입력/출력 경로가 Java 타입까지 포함해 고정됨
  - 다음 단계는 `301([B)` 반환을 우선으로 실데이터(base64/hex) 복원

Round 55: `301([B)` 반환 base64 복원 보정(2026-03-12):

- 수정:
  - `scripts/frida/gs25-pgl-meta-hook.js`
    - `byte[]` 변환 실패 시 수동 base64 인코더 폴백 추가

- 실행:
  - `captures/gs25-pgl-meta-20260312-r6-b64`

- 결과:
  - `meta_return code=301`에서 `retDeep`가 `base64:...` 형태로 안정 출력 확인
  - 동일 라운드에서 code 222도 `base64:...` 출력 확인

- 결론:
  - `301([B)`의 실데이터 수집 경로가 확보되어,
    이후 `FUN_00128654` 반환값과 직접 비교 가능한 상태로 진전

Round 56: Java/Native 호출 단위 상관 매칭 검증(2026-03-12):

- 추가:
  - `scripts/gs25-pgl-meta-call-correlation.mjs`
    - `meta_return`(Java) <-> `meta_leave`(Native) 최근접 timestamp 매칭

- 실행:
  - `captures/gs25-pgl-meta-dual-20260312-r2-correl`
  - `--max-delta-ms 2500`로 상관 분석

- 결과:
  - 전체 `matched 18 / 36`
  - 목표 code 매칭:
    - `224`: delta 1ms, `meta_dispatch -> FUN_00135680 -> ...`
    - `227`: delta 3ms, `meta_dispatch -> FUN_001177c8 -> FUN_00119f08`
    - `301`: delta 26ms(주요 매칭), `meta_dispatch -> FUN_00128654 -> ...`
    - `302`: delta 0~1ms, `meta_dispatch -> FUN_00128384`
    - `303`: delta 5ms, `meta_dispatch -> FUN_001285c4`

- 결론:
  - 목표 code 5종은 Java 리턴과 native helper 체인이 호출 단위로 연결됨을 재확인
  - 다음은 `301([B)` payload를 우선 해석 대상으로 삼아 실의미 필드 여부 확인

Round 57: code별 payload 추출 자동화 + 실측(2026-03-12):

- 추가:
  - `scripts/gs25-pgl-meta-extract-code-payloads.mjs`
    - `meta_return`에서 code별 payload 추출/중복제거
    - `base64:` 접두 제거 후 길이/빈도 요약

- 실행:
  - 입력: `captures/gs25-pgl-meta-dual-20260312-r2-correl/gs25-pgl-meta-events.jsonl`
  - 옵션: `--codes 301,302,303`

- 결과:
  - `301`: unique 1개 (length 807, count 2)
  - `302`: unique 2개 (각 length 25)
  - `303`: unique 1개 (length 25)

- 결론:
  - `301/302/303`의 반환 payload가 반복성 있게 추출되어
    후속 디코드/필드 추정 단계로 진행 가능한 상태

Round 58: code301 payload 1차 디코드(2026-03-12):

- 추가:
  - `scripts/gs25-pgl-meta-decode-301.mjs`
    - code301 base64 -> binary 복원
    - protobuf wire-format 휴리스틱 파싱
    - 엔트로피 계산

- 실행:
  - 입력: `captures/gs25-pgl-meta-20260312-r6-b64/gs25-pgl-meta-events.jsonl`

- 결과:
  - payload 길이: base64 807 / binary 601
  - protobuf 헤더 해석:
    - field1=538969122
    - field2=1
    - field3=2
  - 헤더 소비 13바이트, 잔여 588바이트
  - 전체 엔트로피 7.6474 bits/byte

- 결론:
  - code301은 "메타 헤더 + 고엔트로피 본문" 구조로 보이며,
    본문은 암호화/압축 후보로 판단됨

Round 59: code302/303 짧은 토큰 성상 분석(2026-03-12):

- 추가:
  - `scripts/gs25-pgl-meta-decode-short-tokens.mjs`
    - 25자 토큰(base64url) 디코드 길이/엔트로피 분석

- 실행:
  - 입력: `captures/gs25-pgl-meta-dual-20260312-r2-correl/gs25-pgl-meta-events.jsonl`
  - 대상: `302,303`

- 결과:
  - code302: 2종, code303: 1종
  - 모두 길이 25 / base64url 문자셋 일치
  - 디코드 길이 18바이트
  - 엔트로피 4.06~4.17 bits/byte

- 결론:
  - `302/303`은 짧은 바이너리 토큰 계열로 판단되며,
    `301` 대형 payload와는 별도 역할일 가능성이 높음

Round 60: payload 안정성 집계(301/302/303, 2026-03-12):

- 추가:
  - `scripts/gs25-pgl-meta-payload-stability.mjs`
    - 여러 캡처를 한 번에 읽어 code별 unique payload 수 집계
    - byte-list/base64 표현 차이 일부 정규화

- 실행:
  - 대상: `r3/r4/r5/r6`, `dual-r1/r2`
  - 출력: `captures/gs25-pgl-meta-payload-stability-20260312.json`

- 결과:
  - 파일별:
    - `301` 대체로 unique 1
    - `302` unique 1~2
    - `303` unique 1
  - 전역:
    - `301`: unique 1
    - `302`: unique 10
    - `303`: unique 6

- 결론:
  - `301`은 비교적 안정적 payload
  - `302/303`은 회전성(short token) 특성이 강함

Round 61: 302/303 토큰의 301 본문 포함 여부 점검(2026-03-12):

- 실행:
  - 입력: `captures/gs25-pgl-meta-dual-20260312-r2-correl/gs25-pgl-meta-events.jsonl`
  - 방법: `302/303` 토큰(base64url->18B) 바이트열이 `301` 본문에 존재하는지 검색

- 결과:
  - `302` 2종, `303` 1종 모두 `301` 본문 내 미포함(`index=-1`)

- 결론:
  - `302/303`은 `301` 본문 직접 파생 문자열이라기보다
    별도 경로에서 생성되는 토큰일 가능성이 높음

Round 62: helper->meta 포인터 동일성 검증(2026-03-12):

- 추가:
  - `scripts/gs25-pgl-meta-pointer-flow.mjs`
    - 타깃 code에서 helper 반환 포인터와 최종 meta 반환 포인터 동일성 판정

- 실행:
  - `dual-r1`, `dual-r2-correl` native 이벤트 입력

- 결과:
  - `224/301/302/303`은 타깃 helper 반환 포인터와 meta 반환 포인터가 일치
  - `227`은 `FUN_001177c8` 반환 포인터와 meta 반환 포인터가 불일치

- 결론:
  - `227`은 helper 반환 후 추가 변환 단계가 존재할 가능성이 높음

Round 63: code301 full payload 재수집 + protobuf 판정(2026-03-12):

- 배경:
  - 기존 훅에서 `retDeep`가 800자 제한으로 잘려(`...(truncated)`) protobuf 판정 정확도가 떨어짐

- 수정:
  - `scripts/frida/gs25-pgl-meta-hook.js`
    - byte[] base64 출력 제한을 `800 -> 8192`로 상향

- 추가:
  - `scripts/gs25-pgl-meta-export-payload-bins.mjs`
    - code별 payload를 `.bin`으로 추출, truncated 자동 제외
  - `scripts/gs25-pgl-meta-protobuf-likelihood.mjs`
    - wire-format 휴리스틱 판정

- 실행:
  - 캡처: `captures/gs25-pgl-meta-20260312-r7-fullb64`
  - export: `captures/gs25-pgl-meta-payload-bins-r7`
  - 판정: `captures/gs25-pgl-meta-protobuf-likelihood-r7.json`

- 결과:
  - `301`: base64 길이 1423, binary 1060, wire 완전소비(1060/1060), likely=true
    - fields: `1(varint),2(varint),3(varint),4(len-delimited),5(varint)`
  - `302/303`: 18바이트 토큰, wire parse 불가, likely=false

- 결론:
  - `301` 경로는 protobuf wrapper가 맞음
  - 핵심 본문은 field#4 bytes 내부로 이동해 추가 해제가 필요

Round 64: blackboxprotobuf 무스키마 디코드 + mitmproxy 프로브(2026-03-12):

- 추가:
  - `scripts/gs25-pgl-meta-blackboxprotobuf-check.py`
    - `.proto` 없이 decode 시도, bytes 안전 직렬화
  - `scripts/mitm/gs25_protobuf_probe.py`
    - mitmproxy response body protobuf 후보 탐지 + blackboxprotobuf 시도

- 실행:
  - `python3 -m pip install --user blackboxprotobuf`
  - `python3 scripts/gs25-pgl-meta-blackboxprotobuf-check.py captures/gs25-pgl-meta-payload-bins-r7`
  - 결과: `captures/gs25-pgl-meta-blackboxprotobuf-r7.json`

- 결과:
  - decode 성공: `code=301` 1건(keys `1,2,3,4,5`)
  - decode 실패: `302/303` (`Invalid Message Length`, `unpack requires a buffer of 8 bytes`)

- 결론:
  - `blackboxprotobuf`로도 `301` wrapper 필드는 일관되게 복원됨
  - `302/303`은 protobuf가 아닌 short binary token 계열로 유지 판단

Round 65: field#4(bytes) 재귀 분석 + Ghidra 교차확인(2026-03-12):

- 추가:
  - `scripts/gs25-pgl-meta-301-field4-analysis.py`
    - `code=301` wrapper에서 field#4 추출 후 entropy/magic/wire/blackbox 재시도

- 실행:
  - 입력: `captures/gs25-pgl-meta-payload-bins-r7/code-301/payload-001.bin`
  - 출력: `captures/gs25-pgl-meta-301-field4-analysis-r7.json`

- 결과:
  - outer protobuf:
    - keys `1,2,3,4,5`
    - `f1=538969122`, `f2=1`, `f3=2`, `f5=1773288028`, `f4_len=1041`
  - field#4:
    - entropy `~7.844`
    - gzip/zlib/zstd/lz4 magic 없음
    - wire-scan 완전 파싱 실패(0/1041)
    - blackboxprotobuf 실패(`Found END_GROUP before START_GROUP`)

- Ghidra 확인:
  - `FUN_00139a5c`에서 `code=0x12d(301)` -> `FUN_00128654` 호출 분기 확인
  - `FUN_00128654`는 `FUN_0011c31c` -> `FUN_00115f54` -> `FUN_0013d5b4(indirect jump)` 체인으로 난독화 dispatcher 성격

- 결론:
  - `301`은 protobuf wrapper 맞음
  - 핵심 본문은 field#4 내부에서 별도 변환된 blob으로 판단

Round 66: 301 간접 분기 타깃 런타임 고정(2026-03-12):

- 추가:
  - `scripts/frida/gs25-pgl-meta-301-indirect-probe.js`
    - `meta(301)` + `FUN_00128654` + `FUN_0013d5b4(indirect)` 동시 후킹
  - `scripts/gs25-pgl-meta-301-indirect-capture.sh`
  - `scripts/gs25-pgl-meta-301-indirect-summary.mjs`

- 실행:
  - 동시 수집: `captures/gs25-pgl-meta-301-indirect-20260312-r2-dual`

- 결과:
  - `301` seq에서 간접 호출 타깃 2건:
    - `0x39a5c` (meta_dispatch)
    - `0x287a0` (helper 내부 간접 분기 대상)
  - 같은 seq에서 Java 측 `meta_return code=301`도 동시 확인

- Ghidra 확인:
  - `FUN_001287a0`는 대형 컨텍스트 수집/조합 후 `FUN_0012811c(...)`로 패킹하는 핵심 루틴 형태

- 결론:
  - `FUN_00128654`는 간접 디스패치 성격이 강하고,
    실제 `301` payload 조립 중심은 `FUN_001287a0`로 좁혀짐
