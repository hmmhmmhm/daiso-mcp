# 세븐일레븐 재고 암호화 보완 분석 (통신 + Ghidra)

작성일: 2026-03-14 (KST)

## 1. 목적

세븐일레븐 재고 엔드포인트(`POST /api/v1/open/stock/search/stores`)가
현재 공개 리플레이에서 `503` 또는 `RSA 복호화 실패`로 실패하는 원인을
앱 내부 암호화 경계 기준으로 추적하고, 실측 가능한 후킹 체계를 추가합니다.

## 2. 현재 통신 상태

- 정상(OPEN):
  - `POST /api/v1/open/search/goods`
  - `POST /api/v1/open/search/store`
  - `GET /api/v1/product/pages` 등
- 실패(재고):
  - `POST /api/v1/open/stock/search/stores`
  - `POST /api/v1/stock/search/stores`
  - 실패 유형: `code=503(서비스를 사용할 수 없습니다)` / `RSA 복호화 실패`

해석:
- 단순 JSON body 재현이 아니라, 앱 내부에서 생성하는 암호화 블록/서명 값이 필요할 가능성이 높음

## 2.1 현재 MCP 구현과의 대조

현재 MCP 재고 요청은 실측 리플레이에서 사용한 평문 필드 포맷에 맞춰 정리했습니다.

- 현재 MCP 요청 body:
  - `goodsCd`
  - `storeCd`
  - `lat`
  - `lng`
- 근거:
  - `scripts/seveneleven-open-replay-batch.sh`의 `body_stock_probe.json`
  - `captures/seveneleven-replay-batch-20260314-r12/body_stock_probe.json`

정리:
- `itemCd/query` 같은 잘못된 평문 필드 차이는 제거됨
- 그 이후에도 재고 엔드포인트는 `503` 또는 `RSA 복호화 실패`로 막힘
- 따라서 남은 핵심 블로커는 요청 body shape가 아니라 `SignEnc`/`XecureCrypto` 경계의 암호화 payload임

## 2.2 헤더 비교 결과

공개 성공 엔드포인트와 재고 실패 엔드포인트의 리플레이 헤더를 비교했을 때,
현재 수집본만으로는 "추가 클라이언트 헤더가 없어서 실패한다"는 근거는 확인되지 않았습니다.

- 공개 성공:
  - `POST /api/v1/open/search/goods`
  - `POST /api/v1/open/search/popword`
- 재고 실패:
  - `POST /api/v1/open/stock/search/stores`
  - `POST /api/v1/stock/search/stores`
- 공통 관찰:
  - `content-type: application/json;charset=UTF-8`
  - `x-cdn: Imperva`
  - `set-cookie` 계열은 응답에서 공통적으로 보임

해석:
- 현재 단계에서 추가 헤더 추정보다 암호화 payload 확보가 우선순위가 높음
- 다음 실측은 요청 헤더보다 `SignEnc_GetEncData` 입력/출력 쌍 확보에 집중해야 함

## 2.3 공개 제품 정보와의 정합성

공개 자료 기준으로도 `TouchEn AppIron`은 앱 위변조 방지 계열 제품으로 소개됩니다.

- 라온시큐어 제품 페이지:
  - TouchEn AppIron = "AI-Based App Tampering & Forgery Protection Solution"
- 라온시큐어 브로셔:
  - 단말 OS/앱 위변조 검증 결과에 따라 앱 실행 여부를 제어한다고 설명
- 과거 공개 자료:
  - AppIron을 "앱 위변조 및 디컴파일 방지 솔루션"으로 소개

현재 실측과 연결하면:

- attach 직후 앱 종료
- logcat의 `AppIronExpress`, `Anti-Debug`, `verifyJni`, `FRIDA_T` 계열 흔적

위 두 축이 서로 맞물립니다. 즉, 현재 증상은 우연한 크래시보다
AppIron 계열 보호 로직이 Frida/동적 계측을 탐지하고 앱 실행을 중단시키는 흐름으로 보는 것이 타당합니다.

참고 링크:

- https://www.raonsecure.com/en/solution/appiron
- https://www.raonsecure.com/common/en/downfile/RAON_Brochure_Eng_v.1.5_Spread_20230327.pdf
- https://www.raonsecure.com/ko/about/notification/view/99

## 2.4 Frida 없이 확인한 앱 내부 보안 체크 경로

`classes2.dex` 정적 추적으로 다음 연결을 확인했습니다.

- `RequestFromWeb.etc_startAppSecureCheck(JSONArray, String)`
  - WebView 플러그인 레이어의 보안 체크 진입점
- 위 메서드는 다음을 호출
  - `SecureManager.h(context)` : context 세팅
  - `SecureManager.i()` : 상태 확인
  - `SecureManager.e(runnable, continuation)` : 비동기 보안 체크 실행
- `SecureManager.e(...)` 내부 coroutine 본체
  - `SecureManager$checkSecurityAsync$2.invokeSuspend(...)`
  - 여기서 `XecureAppShield.getInstance().checkApp(context)` 호출
- `SecureManager`는 추가로 다음 값을 노출
  - `SecureManager.f()` -> `XecureAppShield.getSID()`
  - `SecureManager.g()` -> `XecureAppShield.getToken()`

해석:

- 세븐일레븐 앱은 재고/리플레이 이전에 WebView 브리지에서 보안 세션을 먼저 시작함
- 이 보안 세션 결과물은 `XecureAppShield`의 `SID` / `Token` 축으로 관리될 가능성이 높음
- 따라서 Frida 없이 리플레이 재료를 모으려면, 네이티브 암호화 우회보다
  `etc_startAppSecureCheck` 이후 WebView/브리지/캐시에서 `SID`/`Token`이 어디로 전달되는지 찾는 편이 더 현실적임

## 2.5 WebView 재고 페이지의 실제 호출 방식

WebView 캐시에 남아 있는 Nuxt 번들을 기준으로, 재고 페이지의 공개 API 호출 방식은 다음처럼 정리됩니다.

- 재고 매장 조회 서비스:
  - `Pu23xhmP.js`
  - `/api/v1/open/search/store`
  - `/api/v1/open/stock/search/stores`
  - `/api/v1/stock/search/stores`
- 재고 수량 조회 서비스:
  - `BdHJfuZa.js`
  - `/api/v1/open/real-stock/multi/{...}/stocks`

캐시 번들에서 바로 확인되는 동작:

- `getStockStoresByKeyword(e)`
  - body: `{ collection: "store", query: e, sort: "Date/desc", listCount: 9999 }`
- `getStockStores(e)`
  - `myLat`, `myLng`를 문자열로 변환
  - `ctLat`, `ctLng`는 제거
  - `null` 필드는 제거
  - 이후 `POST /api/v1/open/stock/search/stores`
- `getRealStockByProduct(e, s)` / `getRealStockByStore(e, s)`
  - `POST /api/v1/open/real-stock/multi/${s}/stocks`

근거:

- `captures/seveneleven-cache-replay-20260314-r3/extracted/cache/WebView/Default/HTTP Cache/Cache_Data/a529689c6d508942_0:1`
- `captures/seveneleven-cache-replay-20260314-r3/extracted/cache/WebView/Default/HTTP Cache/Cache_Data/ed909a8faa46af7e_0:1`

해석:

- 공개 WebView 레이어는 재고 조회를 두 단계로 나눔
  - 1단계: `open/stock/search/stores`로 재고 보유 매장 후보 조회
  - 2단계: `open/real-stock/multi/.../stocks`로 실제 수량 조회
- 따라서 현재 MCP가 직접 맞춰야 할 것은 단일 "재고 API 하나"가 아니라
  페이지가 쓰는 두 단계 흐름과 각 단계의 body shape임

## 2.6 WebView 상태 저장소에서 보이는 입력 축

재고 관련 Pinia store도 캐시 번들에서 확인됩니다.

- `selectedStore`
  - `storeInfo`
- `searchStoreFilter`
  - `areaResearch`
  - `ctLat`
  - `ctLng`
  - `myLat`
  - `myLng`
- `stock`
  - `stockProduct`
  - `myLatitude`
  - `myLongitude`

근거:

- `captures/seveneleven-cache-replay-20260314-r3/extracted/cache/WebView/Default/HTTP Cache/Cache_Data/62883454b2cb39a1_0:1`
- `captures/seveneleven-cache-replay-20260314-r3/extracted/cache/WebView/Default/HTTP Cache/Cache_Data/4d163a05d301e896_0:1`

해석:

- 재고 페이지는 검색 위치를 `myLat/myLng` 축으로 관리하고,
  선택된 매장 상세는 `selectedStore.storeInfo`로 따로 들고 있음
- 즉, 현재 MCP에서 `storeCd/lat/lng`를 만드는 방향 자체는 WebView 구조와 크게 어긋나지 않음
- 남은 차이는
  - 실제 페이지가 `selectedStore.storeInfo`에서 어떤 필드를 `open/real-stock` body로 넘기는지
  - 그리고 그 요청 직전 보안 세션/암호화 경계가 개입하는지 여부임

## 2.7 현재 웹 번들 기준 실제 수량 조회 body

현재 배포 중인 Nuxt 번들을 직접 추적하면, 실제 수량 조회는 최소 두 가지 shape로 나뉩니다.

- 상품 상세 페이지 기준(`F-mghwu7.js`)
  - 선택 매장 저장: `selectedStore.storeInfo.storeCd`
  - 실제 수량 요청:
    - `POST /api/v1/open/real-stock/multi/01/stocks`
    - body:
      - `smCd`
      - `stokMngCd`
      - `stokMngQty`
      - `stockApplicationRate`
      - `storeList: [storeCd]`
- 상품 목록 페이지 기준(`BxUztD7K.js`)
  - 매장 선택 상태에서 상품 목록을 받아온 뒤 실제 수량 요청:
    - `POST /api/v1/open/real-stock/multi/02/stocks`
    - body:
      - `storeCd`
      - `itemList: content[]`

직접 확인된 코드 조각:

- 상품 상세:
  - `const i = { smCd, stokMngCd, stokMngQty, stockApplicationRate, storeList: s }`
  - `await An.getRealStockByProduct(i, "01")`
- 상품 목록:
  - `const r = { storeCd: o.storeCd, itemList: c.content }`
  - `await Ke.getRealStockByStore(r, "02")`

근거:

- `/tmp/seven-app/F-mghwu7.js`
- `/tmp/seven-app/BxUztD7K.js`

해석:

- 현재 MCP 구현이 맞춰 둔 `goodsCd/storeCd/lat/lng`는
  현재 웹 번들의 "실제 수량 조회" body와는 일치하지 않음
- 이 필드 조합은 `open/stock/search/stores` 또는 과거 프로브 body와 더 가까움
- 따라서 현재 실패 원인은 암호화 경계뿐 아니라
  "실제 웹 수량 조회 flow 자체를 재현하지 못하고 있음"도 함께 고려해야 함

## 2.8 현재 MCP 실패 원인의 재정리

지금까지 확보한 근거를 기준으로, 현재 MCP 재고 로직의 실패 원인은 다음 두 층으로 보는 것이 맞습니다.

1. Flow mismatch
   - 현재 MCP는 `open/stock/search/stores` 1회 호출만으로 재고를 해결하려고 함
   - 실제 웹은
     - `open/stock/search/stores`로 재고 매장 후보를 찾고
     - `open/real-stock/multi/01|02/stocks`로 실제 수량을 다시 조회함
2. Security/session mismatch
   - 재고 계열 엔드포인트는 공개 리플레이에서 `503` 또는 `RSA 복호화 실패`가 반복됨
   - WebView 보안 세션(`SID`/`Token`)과 `SignEnc`/`XecureCrypto` 경계가 개입할 가능성이 높음

정리:

- 현재 MCP의 `goodsCd/storeCd/lat/lng` 보정은 "완전히 틀린 방향"은 아니지만,
  실제 수량 조회를 재현하기엔 충분하지 않음
- 다음 캡처 우선순위는 `open/stock/search/stores`가 아니라
  `open/real-stock/multi/01|02/stocks` 직전의 평문 body와 세션 상태임

## 2.9 WebView flow 분석 문서 분리

WebView/Nuxt 번들 기준 재고 flow 상세는 별도 문서로 분리했습니다.

- [seveneleven-web-stock-flow-analysis.md](/Users/hm/Documents/GitHub/daiso-mcp/docs/seveneleven-web-stock-flow-analysis.md)

핵심만 요약하면:

- 웹 레이어는 `Authorization`보다 `credentials: include` 기반 쿠키 세션을 사용함
- 검색 다이얼로그의 재고 매장 조회 body는 `storeCdList + smCd/stokMng* + myLat/myLng`
- 실제 수량 조회는 `open/real-stock/multi/01|02/stocks`에서 따로 수행됨

## 3. Ghidra 핵심 결과

분석 바이너리:
- `captures/seveneleven-ghidra-extract-20260314/apk_unzip_20260314/lib/arm64-v8a/libSignEnc.so`
- `captures/seveneleven-ghidra-extract-20260314/apk_unzip_20260314/lib/arm64-v8a/libXecureCrypto.so`

### 3.1 libSignEnc.so

확인된 JNI export:
- `Java_kr_co_nicevan_signenc_SignEnc_GetEncData`
- `Java_kr_co_nicevan_signenc_SignEnc_MakePinBlock`

`GetEncData` 디컴파일 관찰:
- 입력 `jbyteArray`를 복사 후 내부에서 SHA1 + DES 루프(`function_des`) 수행
- 결과를 다른 `jbyteArray`로 write (`SetByteArrayRegion` 경로)
- 즉, 네트워크 payload 전처리(암호화 블록 생성) 후보

### 3.2 libXecureCrypto.so

RSA/PKCS1 계열 심볼 다수 확인:
- `SF_PKEY_Encrypt`
- `SF_PKCS1_V15_Encrypt`
- `SF_PKCS1_OAEP_Decrypt` 등

해석:
- `SignEnc`에서 1차 블록 생성 후 `XecureCrypto`의 RSA 경로로 래핑되는 2단계 흐름 가능성

추가 문자열 단서:
- 난수 계열: `SF_RAND_GetRandom`, `SF_GetRandom`
- 해시 계열: `SF_Hash`, `SF_SHA1`
- 대칭 암호 계열: `SF_Cipher_Encrypt`, `SF_AES_*`, `SF_DES_*`

해석:
- 재고 요청 암호화 블록에 `nonce/timestamp`가 섞이면 난수 함수 호출 타이밍이 함께 나타나야 함
- 따라서 RSA만이 아니라 `rand/hash/cipher` 이벤트를 같이 수집해야 재현 규칙을 좁힐 수 있음

## 4. 이번에 추가한 보완 도구

### 4.1 Frida 후킹 스크립트

파일:
- `scripts/frida/seveneleven-signenc-hook.js`

기능:
- `libSignEnc.so`
  - `SignEnc_GetEncData` 진입/복귀 시 입력/출력 바이트 배열 캡처
  - `SignEnc_MakePinBlock` 진입/복귀 시 문자열 인자/출력 배열 캡처
- `libXecureCrypto.so`
  - RSA/난수/해시/대칭암호 후보 함수 호출 enter/leave 트레이스
- 출력 포맷:
  - `[SE_SIGNENC] {"t":"...","ts":...,"payload":{...}}`

### 4.2 캡처 러너

파일:
- `scripts/seveneleven-signenc-capture.sh`

기능:
- attach 자동 폴백 주입
  - 1순위: `-N <package>` (식별자 attach)
  - 2순위: `-n <name>` (이름 attach)
  - 3순위: `-p <pid>` (PID attach, 재시도)
- raw 로그 + JSONL 자동 분리 저장
- 산출물:
  - `captures/seveneleven-signenc-*/frida-signenc-raw.log`
  - `captures/seveneleven-signenc-*/seveneleven-signenc-events.jsonl`

## 5. 실행 절차

```bash
# 1) 앱 수동 실행 후 홈 진입
adb shell monkey -p kr.co.kork7app -c android.intent.category.LAUNCHER 1

# 2) frida-server/포트포워딩 준비(이미 사용 중이면 생략)
adb shell 'su -c "/data/local/tmp/frida-server >/dev/null 2>&1 &"'
adb forward tcp:27042 tcp:27042

# 3) 후킹 시작
bash scripts/seveneleven-signenc-capture.sh

# (선택) PID 재조회 횟수 지정
bash scripts/seveneleven-signenc-capture.sh --pid-retry 30

# 4) 앱에서 상품/매장 선택 후 재고조회 시도
# 5) Ctrl+C 종료
```

## 6. 성공 판정

다음 이벤트가 실제 값으로 잡히면 성공:
- `signenc_getencdata_enter`
- `signenc_getencdata_leave`
- `xecure_enter`/`xecure_leave` (RSA 계열)

최소 확보 항목:
- 암호화 전 바이트 길이/헤더 패턴
- 암호화 후 블록 길이/hex 프리픽스
- 동일 입력 대비 출력 변동 규칙(고정값/nonce/timestamp)

## 7. 다음 보완 단계

1. `seveneleven-signenc-events.jsonl`에서 `GetEncData` 입력-출력 쌍 5회 이상 확보
2. 재고 API 요청 body와 이벤트 시점 매칭
3. 서버에서 검증하는 필드(예: nonce, timestamp, key index) 후보 추출
4. 재현 가능하면 `src/services/seveneleven/client.ts`에 재고 조회 클라이언트 추가

## 8. 트러블슈팅

- `Failed to spawn: unable to find process with name ...`
  - 원인: attach 옵션 불일치 또는 앱 프로세스명 변동
  - 대응: 최신 러너는 `-N -> -n -> -p` 자동 폴백
- `Process terminated`가 자주 발생
  - 원인: 앱 재시작/화면 전환 시 PID 교체
  - 대응: `--pid`를 고정하지 말고 기본 auto 모드 사용
