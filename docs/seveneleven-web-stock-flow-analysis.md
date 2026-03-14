# 세븐일레븐 웹 재고 Flow 분석

작성일: 2026-03-14 (KST)

## 1. 목적

현재 배포 중인 세븐일레븐 WebView/Nuxt 번들을 기준으로
재고 조회 flow의 평문 body, 세션 의존성, 상태 저장 방식을 정리합니다.

## 2. 세션/쿠키 관찰 결과

현재 배포 번들의 재고 서비스 래퍼는 별도 `Authorization` 헤더를 붙이지 않습니다.

- `BdHJfuZa.js`
  - `getRealStockByProduct(e, s)`
  - `getRealStockByStore(e, s)`
  - 둘 다 `usePostFetch` 계열인 `useCustomFetch`만 호출
- `app.js`
  - `useCustomFetch(e, method, body, options, ...)`
  - 기본 옵션:
    - `credentials: "include"`
    - `GET`은 `params`, 그 외는 `body`
  - 추가 고정 헤더 주입 로직은 현재 확인되지 않음

근거:

- 로컬 확보 번들 `BdHJfuZa.js`
- 로컬 확보 번들 `app.js`

또한 실제 WebView 쿠키 저장소에는 다음 이름들이 남아 있습니다.

- `.7-elevenapp.co.kr`
  - `incap_ses_1586_3176693`
  - `nlbi_3176693`
  - `visid_incap_3176693`
- `new.7-elevenapp.co.kr`
  - `NetFunnel_ID`
  - `WMONID`

근거:

- `captures/seveneleven-cache-replay-20260314-r3/extracted/app_webview/Default/Cookies`

해석:

- 기존 `replay-curl-templates.sh`의 `authorization: Bearer <REPLACE_TOKEN>`는
  현재 웹 번들 기준 실증된 헤더가 아니라 가정치에 가까움
- 실제 웹 레이어는 우선 `credentials: include`로 쿠키 세션을 싣고 호출하는 구조임
- 다음 재현 우선순위는 `Authorization` 추측보다 WebView 쿠키/세션 재사용 여부 검증임

추가 실측:

- `POST /api/v1/open/search/goods`는 `pageNo/pageSize` 조합에서 안정적으로 응답함
- 같은 요청에 `sort`를 함께 넣으면 `CollectionId`만 내려오고 `Documentset.totalCount/resultCount`가 `0`으로 비는 케이스를 확인함
- 현재 MCP 상품 검색은 이 차이를 반영해 `sort` 없이 `pageNo/pageSize`만 전송하도록 조정함

## 3. 검색 다이얼로그의 실제 재고 매장 조회 body

현재 배포 번들의 `SearchStore` 다이얼로그(`BiYayDnU.js`)를 보면,
재고 매장 조회는 다음 두 단계로 진행됩니다.

1. 매장명 키워드 검색
   - `POST /api/v1/open/search/store`
   - body:
     - `collection: "store"`
     - `query`
     - `sort: "Date/desc"`
     - `listCount: 9999`
2. 재고 보유 매장 조회
   - `POST /api/v1/stock/search/stores`
   - body:
     - `searchType: "list"`
     - `storeCdList`
     - `storeNm`
     - `myLat`
     - `myLng`
     - `order`
     - `smCd`
     - `stockApplicationRate`
     - `stokMngCd`
     - `stokMngQty`
     - `ignoreRateYn: "Y"`

직접 확인된 코드 조각:

- `const p = { searchType:"list", storeCdList:e, storeNm:o.trim(), myLat, myLng, order:S.value, smCd:v.product[0].smCd, stockApplicationRate:v.product[0].stockApplicationRate, stokMngCd:v.product[0].stokMngCd, stokMngQty:v.product[0].stokMngQty, ignoreRateYn:"Y" }`
- `await te.getStockStores2(p)`

근거:

- 로컬 확보 번들 `BiYayDnU.js`
- 로컬 확보 번들 `Pu23xhmP.js`

해석:

- 현재 MCP가 가정한 `goodsCd/storeCd/lat/lng`는
  실제 웹 검색 다이얼로그의 재고 매장 조회 body와 일치하지 않음
- 실제 웹 flow는 상품 단에서 이미 `smCd/stokMngCd/stokMngQty/stockApplicationRate`를 확보한 뒤,
  매장 후보 목록(`storeCdList`)과 합쳐 `/api/v1/stock/search/stores`를 호출함

## 4. 실제 수량 조회 body

현재 배포 중인 Nuxt 번들을 직접 추적하면, 실제 수량 조회는 최소 두 가지 shape로 나뉩니다.

- 상품 상세 페이지 기준(`F-mghwu7.js`)
  - `POST /api/v1/open/real-stock/multi/01/stocks`
  - body:
    - `smCd`
    - `stokMngCd`
    - `stokMngQty`
    - `stockApplicationRate`
    - `storeList: [storeCd]`
- 상품 목록 페이지 기준(`BxUztD7K.js`)
  - `POST /api/v1/open/real-stock/multi/02/stocks`
  - body:
    - `storeCd`
    - `itemList: content[]`

근거:

- 로컬 확보 번들 `F-mghwu7.js`
- 로컬 확보 번들 `BxUztD7K.js`

## 5. 선택 매장 유지 방식

매장 선택 다이얼로그(`DP3_tkgp.js`)와 재고 검색 다이얼로그(`BiYayDnU.js`) 기준으로,
선택 매장은 로그인 상태에 따라 두 방식으로 유지됩니다.

- 로그인 상태:
  - 서버 API 경유 저장
- 비로그인 상태:
  - `localStorage.setItem("selectStore_P" | "selectStore_R", JSON.stringify({ serviceType, storeCd, storeNm }))`

또한 선택 직후 메모리 store에는 전체 `storeInfo`가 들어갑니다.

- `selectedStore.storeInfo = s`
- 이후 상품 상세에서
  - `storeCd`
  - `storeNm`
  - 영업 시간 관련 필드
    를 꺼내 `real-stock`과 후속 검증 로직에 사용

근거:

- 로컬 확보 번들 `BiYayDnU.js`
- 로컬 확보 번들 `DP3_tkgp.js`
- 로컬 확보 번들 `F-mghwu7.js`

## 6. 현재 해석

- 리플레이에 필요한 평문 재료는 이미 WebView 레이어에 충분히 존재함
- 현재 실패 원인은 하나가 아니라 두 층으로 보는 것이 맞음
  - flow mismatch: MCP가 현재 웹의 2단계 재고 flow를 재현하지 못함
  - security/session mismatch: 쿠키 세션 및 암호화 경계가 여전히 남아 있음

## 7. 실제 재리플레이 비교

실제 공개 endpoint로 다음을 확인했습니다.

1. 상품 메타 공개 조회
   - `GET /api/v1/open/product/search/stock?itemCd=8801097135215`
   - 응답:
     - `smCd: "201051"`
     - `stokMngCd: "201051"`
     - `stokMngQty: 1`
     - `stockApplicationRate: "100"`
2. 같은 메타로 `POST /api/v1/stock/search/stores` 호출
   - body:
     - `searchType: "list"`
     - `storeCdList: ["68907","54928","10463","12235"]`
     - `storeNm: "안산중앙"`
     - `myLat: "37.3176731476"`
     - `myLng: "126.8359394453"`
     - `order: "stock"`
     - `smCd: "201051"`
     - `stockApplicationRate: "100"`
     - `stokMngCd: "201051"`
     - `stokMngQty: "1"`
     - `ignoreRateYn: "Y"`

비교 결과:

- 쿠키 없음:
  - `HTTP 400`
  - `{"success":false,"message":"RSA 복호화 실패","code":501}`
- WebView 쿠키 포함:
  - `HTTP 400`
  - `{"success":false,"message":"RSA 복호화 실패","code":501}`

3. 같은 메타로 `POST /api/v1/open/real-stock/multi/01/stocks` 호출
   - body:
     - `smCd: "201051"`
     - `stokMngCd: "201051"`
     - `stokMngQty: 1`
     - `stockApplicationRate: "100"`
     - `storeList: ["68907","54928","10463","12235"]`
   - 응답:
     - `HTTP 200`
     - `{"success":true,"code":200,...}`
     - 매장별 `stock` 반환 확인
   - 쿠키 유무:
     - 쿠키 없음: 성공
     - WebView 쿠키 포함: 성공

사용한 쿠키:

- `incap_ses_1586_3176693`
- `nlbi_3176693`
- `visid_incap_3176693`
- `WMONID`

해석:

- 현재 확보한 WebView 쿠키만으로는 `stock/search/stores`를 통과시키지 못함
- 즉 이 단계의 직접 블로커는 세션 부족보다 `RSA/SignEnc` 경계일 가능성이 높음
- 다시 말해, body shape를 맞춘 뒤에도 암호화 블록이 없으면 서버가 payload를 파싱하기 전에 거절함
- 반대로 `open/real-stock/multi/01/stocks`는 공개 평문 호출이 가능하므로,
  매장 후보만 다른 공개 경로로 확보하면 재고수량 조회 자체는 우회 가능함

## 8. 다음 실측 우선순위

1. `open/search/store` 결과의 `storeCdList`를 그대로 후보군으로 사용
2. `open/product/search/stock`에서 `smCd/stokMngCd/stokMngQty/stockApplicationRate` 확보
3. `open/real-stock/multi/01|02/stocks`로 직접 재고수량 조회
