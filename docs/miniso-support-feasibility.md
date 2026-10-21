# MINISO 지원 가능성 검토

검증일: 2026-10-21 KST. 이 문서는 지원 여부를 판단하기 위한 조사 기록이며 공개 MINISO 도구가 배포됐다는 뜻은 아닙니다.

## 결론

중국 MINISO의 실제 매장 재고는 아직 검증하지 못했습니다. 멕시코 MINISO는 로그인·쿠키 없는 HTTP로 상품의 픽업 가능 매장과 주소·좌표를 확인했습니다. 이를 현재 매대 재고나 정확한 수량으로 표시해서는 안 됩니다. 중국의 실제 재고 지원은 보류하고, 멕시코는 별도 국가 서비스의 상품·픽업 조회 후보로 분리합니다.

## 중국

[공식 개인정보처리방침](https://www.miniso.cn/privacy.html)은 위챗·알리페이 미니프로그램에서 위치에 따른 매장 재고를 확인한다고 설명합니다. 공식 웹의 온라인몰 링크는 Tmall입니다. 현재 Mac의 격리 브라우저에서 공식 중국 웹에 접근하면 MINISO 안전 게이트웨이의 접근 제한 페이지가 반환됐습니다. 검색 엔진의 문서 열람 가능 여부와 실제 클라이언트 접속 성공은 다릅니다.

추가로 공식 도메인의 [회원 H5](https://wxh5.miniso.com/)와 그 공개 스크립트에 HTTP200으로 접근했습니다. 이 페이지는 휴대전화·문자 인증 회원가입 및 쿠폰 경로이며, 실제 상품·매장 재고 응답을 제공하는 경로는 확인하지 못했습니다. 등록·문자 발송·계정 생성 요청은 실행하지 않았습니다.

미니프로그램에서 상품→매장→재고 응답을 확보하지 못했으므로, 공개·무인증 API의 존재, 로그인 필요 여부, 자동 갱신 방법, 실제 수량 제공 여부는 미확정입니다. 중국 전체 매장 재고를 지원한다고 발표하거나 Tmall 온라인 재고를 매장 재고로 대체하지 않습니다. 다음 단계는 정상 위챗·알리페이 이용 환경에서 공식 미니프로그램의 읽기 요청을 관찰하는 것입니다. 아직 실제 로그인 화면에 도달하지 않았으므로 사용자 로그인이 필수라고 단정하지 않습니다.

## 멕시코

공식 [상품 페이지](https://www.miniso.com.mx/llavero-sanrio-my-melody-sintetico-rosa-19-5-cm/p)에서 상품 참조2025513010108, VTEX 상품37371, SKU37189, 가격399.90 MXN을 확인했습니다. 우편번호06000으로 매장 확인 UI를 실행하면 매장명과 주소가 표시됩니다.

브라우저에서 실제 관측한 요청은 다음과 같습니다. 조회용 simulation이며 주문 생성·결제 요청은 실행하지 않았습니다.

```http
POST https://www.miniso.com.mx/api/checkout/pub/orderForms/simulation?sc=1&RnbBehavior=0
Content-Type: application/json

{"items":[{"id":"37189","quantity":1,"seller":"1","availableQuantity":1}],"postalCode":"06000","country":"MEX"}
```

동일 요청을 Node fetch에서 Authorization·쿠키·브라우저 없이 재현해 HTTP200, pickupPoints10곳, messages빈목록, items availability=available을 받았습니다. 실제 pickup-in-point SLA에는 Portal Centro·Parque Delta 등과 shippingEstimate=20h, 매장 주소·좌표가 포함됐습니다. UI에 보이는 목록과 전체 pickupPoints는 같다고 가정하지 말고, 해당 SKU의 logisticsInfo[].slas 중 pickup-in-point에 연결된 pickupPointId로 매장을 선택해야 합니다.

중요한 제한은 다음과 같습니다.

- 요청 quantity=1 및 availableQuantity=1은 요청자가 보낸 값입니다. 남은 재고 수량의 증거가 아닙니다.
- pickupPoints 전체 목록만으로 상품을 수령할 수 있다고 판단하지 않습니다. 해당 SKU의 픽업 SLA와 일치해야 합니다.
- 20h 픽업 약속은 즉시 방문 구매 가능 또는 매대 실재고를 보장하지 않습니다.
- 공개 VTEX Legacy Search의 AvailableQuantity는 정확한 수량이 아닌 구간값일 수 있습니다. 수량으로 그대로 노출하지 않습니다.
- 일반 상품 검색용 Legacy Search는 이번 Mac 직접 요청에서 비JSON 오류를 반환했습니다. 공식 UI의 GraphQL 조회는 성공했으나 임의 상품 검색의 무브라우저 계약과 Worker 출구 성공 여부는 추가 검증이 필요합니다.

## 지원 설계 후보

국가를 MX, 통화를 MXN으로 분리하고 상품 ID와 SKU를 구분합니다. 조회 이름은 inventory 대신 pickup availability로 명시합니다. 응답에는 pickupAvailable, shippingEstimate, store, source를 제공하고 stockQuantity는 제공하지 않습니다. 미확인·조회 실패를 품절로 바꾸지 않습니다. 중국 데이터와 섞지 않습니다.

구현 전에는 최소 두 상품·두 우편번호, 정상 빈값·판매 불가 SKU·원본 오류·계약 변경을 검증해야 합니다. Worker에서 공식 상품 검색과 simulation을 성공시키고 REST JSON/HTML·MCP·CLI를 연결한 뒤에만 지원 목록에 추가합니다. 현재는 이 기준에 도달하지 않아 서비스 레지스트리·README 지원 표는 변경하지 않았습니다.

## 근거

- [MINISO 중국 개인정보처리방침](https://www.miniso.cn/privacy.html)
- [MINISO 멕시코 공식 상품](https://www.miniso.com.mx/llavero-sanrio-my-melody-sintetico-rosa-19-5-cm/p)
- [VTEX 픽업 조회와 Cart simulation](https://developers.vtex.com/docs/guides/setting-up-white-label-seller-as-pickup-point)
- [VTEX Checkout API](https://developers.vtex.com/docs/api-reference/checkout-api)
- [VTEX 공개 수량 필드 변경](https://developers.vtex.com/updates/release-notes/2024-09-10-change-available-quantity-field-search-api)

브라우저 HAR와 원본 진단은 로컬 비공개 작업 폴더에 보관합니다. 사용자 쿠키·토큰·개인정보는 이 문서나 저장소에 포함하지 않습니다.
