# 올리브영 오특 네트워크 분석

올리브영 오특(오늘의 특가) 화면의 데이터 출처와 응답 구조를 기록합니다. 구현은 `src/services/oliveyoung/todayDeals.ts`, 고정 경로와 응답 판정은 `src/services/oliveyoung/htmlRoute.ts`에 있습니다.

## 확인 방법

2026-10-24와 2026-10-26(Asia/Seoul)에 Playwright 화면 브라우저로 `https://www.oliveyoung.co.kr/store/main/getHotdealList.do`를 열고 네트워크 요청을 기록했습니다. Cloudflare 보안 확인은 사람이 직접 통과했으며 자동으로 우회하지 않았습니다. 같은 날 화면에 표시된 목록과 파싱 결과의 상품명, 순서, 가격, 할인율, 혜택 표시를 대조했습니다. 이 결과는 확인 당시 관측값이며 원본 정책에 따라 바뀔 수 있습니다.

## 데이터 출처

| 화면 섹션          | 요청                                                                                                             | 응답                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 오늘의 브랜드 특가 | `GET /store/main/getHotdealList.do`                                                                              | 페이지 HTML (약 147KB) |
| 오늘의 특가        | `GET /store/main/getHotdealPagingListAjax.do?date=YYYYMMDD&pageIdx=N&fltCondition=02&fltDispCatNo=&prdSort=rank` | 상품 카드 HTML 조각    |
| coming soon        | 페이지 HTML 안의 배너                                                                                            | 상품명과 이미지만 있음 |

- JSON API는 확인하지 못했습니다. 두 응답 모두 HTML입니다.
- `date`는 한국 날짜이며 페이지 스크립트도 같은 값을 보냅니다. 오특은 한국 자정에 바뀝니다.
- 목록 조각은 10개씩 내려오며 마지막 다음 페이지는 공백만 있는 응답입니다. 2026-10-26에는 10, 10, 7개로 27개였습니다.
- 브랜드 특가 카드는 페이지 HTML에 처음부터 포함됩니다. 2026-10-26에는 4개였습니다.
- coming soon은 상품번호와 가격이 없어 구현하지 않았습니다. 사용자 관측 기준으로 대략 한국 시간 9시부터 표시됩니다.

## 상품 카드 구조

두 섹션은 같은 `<li data-impression="상품번호^코너^순위">` 카드를 사용합니다. 코너 이름은 브랜드 특가가 `오특_오특상품리스트_스페셜`, 오늘의 특가가 `오특_오특상품리스트_인기순`입니다.

| 값              | 위치                                            |
| --------------- | ----------------------------------------------- |
| 상품번호        | `data-ref-goodsNo`                              |
| 상품명          | `.prod-name`                                    |
| 브랜드·카테고리 | `data-ref-goodsbrand`, `data-ref-goodscategory` |
| 할인가          | `.price .total` (끝의 "원~"은 옵션별 최저가)    |
| 정가            | `.price .origin`                                |
| 할인율          | `.flag-badge .Pnum`                             |
| 혜택            | `.flags .flag` (세일, 쿠폰, 증정, 1+1 등)       |
| 오늘드림        | `.price .oneday`                                |
| 일시품절        | `.status_flag.soldout`                          |

상품번호가 `B`로 시작하는 상품은 관측 당시 오늘드림 표시가 없었습니다. 2026-10-27에는 오늘의 특가 27번 상품이 화면에 "일시품절"로 표시되었고, 카드 썸네일 안에 `<span class="status_flag soldout">일시품절</span>`이 있어 `soldOut`으로 반환합니다. 페이지 스타일에는 `status_flag soldend`도 정의되어 있지만 상품 카드에서 관측하지 못해 반환하지 않습니다.

## 접근 경로와 제한

- 같은 날 Node fetch와 curl의 직접 요청은 기존 상품 검색 API와 마찬가지로 HTTP403 보안 확인 화면이었습니다. 운영 환경은 브라우저 릴레이가 필요합니다.
- 릴레이 작업 이름은 `today-deals-page`(`{date}`)와 `today-deals-list`(`{date, pageIdx}`)입니다. 날짜는 자정 전후 캐시 구분용이며 페이지 주소에는 붙이지 않습니다. 정렬·필터 값은 고정입니다.
- 브라우저 릴레이는 고정 주소만 GET으로 읽고 정상 오특 HTML만 `{status:"SUCCESS", data:{html}}`로 감쌉니다. 보안 확인 화면이나 다른 페이지는 실패로 반환합니다.
- Python HTTP 릴레이(`OY_RELAY_TRANSPORT=http`)는 기존 네 JSON 경로만 허용하므로 오특 작업은 실패로 반환합니다.
- 한 번의 조회는 페이지 1회와 목록 페이지 수만큼 요청합니다. 2026-10-26 기준 4회이며 릴레이 호출 한도도 같은 횟수만큼 사용합니다. 목록은 최대 20페이지까지 읽고 모두 가득 차면 `truncated=true`를 반환합니다.
