# Daiso MCP 서비스 레퍼런스

README 하단에 있던 기능, REST API, 개발, 아키텍처 설명을 분리한 문서입니다.

## 기능

### daiso_search_products

다이소 제품을 검색합니다.

| 파라미터   | 필수 | 설명                          |
| :--------- | :--: | :---------------------------- |
| `query`    |  O   | 검색할 제품명 또는 키워드     |
| `page`     |      | 페이지 번호 (기본값: 1)       |
| `pageSize` |      | 페이지당 결과 수 (기본값: 30) |

<br>

### daiso_find_stores

다이소 매장을 검색합니다.

| 파라미터  | 필수 | 설명                      |
| :-------- | :--: | :------------------------ |
| `keyword` |      | 매장명 또는 주소 키워드   |
| `sido`    |      | 시/도 (예: 서울, 경기)    |
| `gugun`   |      | 구/군 (예: 강남구)        |
| `dong`    |      | 동 (예: 역삼동)           |
| `limit`   |      | 최대 매장 수 (기본값: 50) |

<br>

### daiso_check_inventory

특정 제품의 매장별 재고를 확인합니다.

| 파라미터     | 필수 | 설명                          |
| :----------- | :--: | :---------------------------- |
| `productId`  |  O   | 제품 ID                       |
| `storeQuery` |      | 매장 검색어 (예: 안산 중앙역) |
| `latitude`   |      | 위도 (기본값: 서울 시청)      |
| `longitude`  |      | 경도 (기본값: 서울 시청)      |
| `page`       |      | 페이지 번호 (기본값: 1)       |
| `pageSize`   |      | 페이지당 결과 수 (기본값: 30) |

`daiso_check_inventory`는 `storeCode` 없이 호출할 수 있습니다. `storeCode`는 재고 결과의 각 매장에서 확인한 뒤 `daiso_get_display_location`에 전달합니다.

<br>

### daiso_get_price_info

제품의 가격 정보를 조회합니다.

| 파라미터      | 필수 | 설명                                |
| :------------ | :--: | :---------------------------------- |
| `productId`   |      | 제품 ID                             |
| `productName` |      | 제품명 (productId가 없을 경우 사용) |

<br>

### daiso_get_display_location

다이소 매장 내 상품의 진열 위치(구역/층)를 조회합니다.

| 파라미터    | 필수 | 설명                                     |
| :---------- | :--: | :--------------------------------------- |
| `productId` |  O   | 상품 ID (daiso_search_products로 조회)   |
| `storeCode` |  O   | 매장 코드 (daiso_check_inventory로 조회) |

<br>

### cu_find_nearby_stores

위치 기반으로 주변 CU 매장을 조회합니다.

| 파라미터    | 필수 | 설명                                |
| :---------- | :--: | :---------------------------------- |
| `latitude`  |      | 위도 (기본값: 서울 시청)            |
| `longitude` |      | 경도 (기본값: 서울 시청)            |
| `keyword`   |      | 매장명/지역 키워드 (예: 강남, 안산) |
| `limit`     |      | 최대 결과 수 (기본값: 20)           |

<br>

### cu_check_inventory

상품 키워드로 CU 재고를 조회하고 주변 매장 정보를 함께 반환합니다.

| 파라미터       | 필수 | 설명                         |
| :------------- | :--: | :--------------------------- |
| `keyword`      |  O   | 재고를 확인할 상품 키워드    |
| `latitude`     |      | 위도 (기본값: 서울 시청)     |
| `longitude`    |      | 경도 (기본값: 서울 시청)     |
| `storeKeyword` |      | 주변 매장 필터 키워드        |
| `size`         |      | 검색 결과 수 (기본값: 20)    |
| `offset`       |      | 검색 시작 오프셋 (기본값: 0) |
| `searchSort`   |      | 정렬 방식 (기본값: `recom`)  |
| `storeLimit`   |      | 매장 결과 수 (기본값: 10)    |

<br>

### emart24_find_nearby_stores

키워드/지역 조건으로 이마트24 매장을 조회합니다.

| 파라미터     | 필수 | 설명                                    |
| :----------- | :--: | :-------------------------------------- |
| `keyword`    |      | 매장명/지역 키워드                      |
| `area1`      |      | 시/도 (예: 서울특별시)                  |
| `area2`      |      | 구/군 (예: 강남구)                      |
| `latitude`   |      | 위도 (선택)                             |
| `longitude`  |      | 경도 (선택)                             |
| `service24h` |      | 24시간 매장만 조회 여부 (기본값: false) |
| `limit`      |      | 최대 결과 수 (기본값: 20)               |

<br>

### emart24_search_products

키워드로 이마트24 상품 목록을 조회합니다.

| 파라미터        | 필수 | 설명                              |
| :-------------- | :--: | :-------------------------------- |
| `keyword`       |  O   | 상품 검색어                       |
| `page`          |      | 페이지 번호 (기본값: 1)           |
| `pageSize`      |      | 페이지당 결과 수 (기본값: 10)     |
| `sortType`      |      | 정렬 기준 (기본값: `SALE`)        |
| `saleProductYn` |      | 행사 상품 여부 필터 (기본값: `N`) |

<br>

### emart24_check_inventory

PLU 코드 기준으로 매장별 재고를 조회합니다.

| 파라미터   | 필수 | 설명                     |
| :--------- | :--: | :----------------------- |
| `pluCd`    |  O   | 상품 PLU 코드            |
| `bizNoArr` |  O   | 쉼표 구분 매장 코드 목록 |

<br>

### oliveyoung_find_nearby_stores

Zyte API 기반으로 내 주변 올리브영 매장을 조회합니다.

| 파라미터    | 필수 | 설명                                |
| :---------- | :--: | :---------------------------------- |
| `latitude`  |      | 위도 (기본값: 서울 시청)            |
| `longitude` |      | 경도 (기본값: 서울 시청)            |
| `keyword`   |      | 매장명/지역 키워드 (예: 명동, 강남) |
| `pageIdx`   |      | 페이지 번호 (기본값: 1)             |
| `limit`     |      | 최대 결과 수 (기본값: 20)           |

<br>

### oliveyoung_check_inventory

Zyte API 기반으로 올리브영 상품 재고를 조회하고 주변 매장 정보를 함께 반환합니다. 상위 상품에는 `storeInventory`가 붙으며 매장별 수량/상태를 함께 제공합니다.

| 파라미터         | 필수 | 설명                           |
| :--------------- | :--: | :----------------------------- |
| `keyword`        |  O   | 재고를 확인할 상품 키워드      |
| `latitude`       |      | 위도 (기본값: 서울 시청)       |
| `longitude`      |      | 경도 (기본값: 서울 시청)       |
| `storeKeyword`   |      | 주변 매장 검색 키워드          |
| `page`           |      | 페이지 번호 (기본값: 1)        |
| `size`           |      | 페이지당 상품 수 (기본값: 20)  |
| `includeSoldOut` |      | 품절 포함 여부 (기본값: false) |

주의:
올리브영은 상품 검색 응답과 매장별 수량 응답이 분리되어 있습니다. `storeInventory.stores[]`가 있으면 그 안의 `stockLabel`, `remainQuantity`, `stockStatus`를 우선 해석합니다.

<br>

### megabox_find_nearby_theaters

사용자 좌표 또는 위치 키워드 기준으로 메가박스 주변 지점을 거리순으로 조회합니다.

| 파라미터    | 필수 | 설명                               |
| :---------- | :--: | :--------------------------------- |
| `keyword`   |      | 위치 키워드 (예: 안산 중앙역)      |
| `latitude`  |      | 위도 (기본값: 서울 시청)           |
| `longitude` |      | 경도 (기본값: 서울 시청)           |
| `playDate`  |      | 조회 날짜 (YYYYMMDD, 기본값: 오늘) |
| `areaCode`  |      | 지역 코드 (기본값: 11, 서울)       |
| `limit`     |      | 최대 결과 수 (기본값: 10)          |

<br>

### megabox_list_now_showing

날짜/지점 조건으로 메가박스 영화 및 상영 회차 목록을 조회합니다. `theaterId`가 없고 `keyword`/좌표가 있으면 가장 가까운 지점을 먼저 선택합니다.

| 파라미터    | 필수 | 설명                               |
| :---------- | :--: | :--------------------------------- |
| `playDate`  |      | 조회 날짜 (YYYYMMDD, 기본값: 오늘) |
| `theaterId` |      | 지점 ID (예: 1372)                 |
| `movieId`   |      | 영화 ID (예: 25104500)             |
| `keyword`   |      | 위치 키워드 (예: 안산 중앙역)      |
| `latitude`  |      | 위도                               |
| `longitude` |      | 경도                               |
| `areaCode`  |      | 지역 코드 (기본값: 11, 서울)       |

<br>

### megabox_get_remaining_seats

영화/지점/날짜 조건으로 회차별 남은 좌석 수를 조회합니다. `theaterId`가 없고 `keyword`/좌표가 있으면 가장 가까운 지점을 먼저 선택합니다.

| 파라미터    | 필수 | 설명                               |
| :---------- | :--: | :--------------------------------- |
| `playDate`  |      | 조회 날짜 (YYYYMMDD, 기본값: 오늘) |
| `theaterId` |      | 지점 ID                            |
| `movieId`   |      | 영화 ID                            |
| `keyword`   |      | 위치 키워드 (예: 안산 중앙역)      |
| `latitude`  |      | 위도                               |
| `longitude` |      | 경도                               |
| `areaCode`  |      | 지역 코드 (기본값: 11, 서울)       |
| `limit`     |      | 최대 결과 수 (기본값: 50)          |

<br>

### lottecinema_find_nearby_theaters

사용자 좌표 기준으로 롯데시네마 주변 지점을 거리순으로 조회합니다.

| 파라미터    | 필수 | 설명                               |
| :---------- | :--: | :--------------------------------- |
| `latitude`  |      | 위도 (기본값: 서울 시청)           |
| `longitude` |      | 경도 (기본값: 서울 시청)           |
| `playDate`  |      | 조회 날짜 (YYYYMMDD, 기본값: 오늘) |
| `limit`     |      | 최대 결과 수 (기본값: 10)          |

<br>

### lottecinema_list_now_showing

날짜/지점/영화 조건으로 롯데시네마 영화 및 상영 회차 목록을 조회합니다.

| 파라미터    | 필수 | 설명                               |
| :---------- | :--: | :--------------------------------- |
| `playDate`  |      | 조회 날짜 (YYYYMMDD, 기본값: 오늘) |
| `theaterId` |      | 지점 ID (예: 1016)                 |
| `movieId`   |      | 대표 영화 코드 (예: 23816)         |

<br>

### lottecinema_get_remaining_seats

영화/지점/날짜 조건으로 회차별 남은 좌석 수를 조회합니다.

| 파라미터    | 필수 | 설명                               |
| :---------- | :--: | :--------------------------------- |
| `playDate`  |      | 조회 날짜 (YYYYMMDD, 기본값: 오늘) |
| `theaterId` |      | 지점 ID                            |
| `movieId`   |      | 대표 영화 코드                     |
| `limit`     |      | 최대 결과 수 (기본값: 50)          |

<br>

### cgv_find_theaters

지역 코드 또는 위치 키워드 기준으로 CGV 극장 목록을 조회합니다.

| 파라미터     | 필수 | 설명                               |
| :----------- | :--: | :--------------------------------- |
| `playDate`   |      | 조회 날짜 (YYYYMMDD, 기본값: 오늘) |
| `regionCode` |      | 지역 코드 (예: 01 서울)            |
| `keyword`    |      | 위치 키워드 (예: 안산 중앙역)      |
| `latitude`   |      | 위도                               |
| `longitude`  |      | 경도                               |
| `limit`      |      | 최대 결과 수 (기본값: 30)          |
| `timeoutMs`  |      | 요청 제한 시간(ms, 기본값: 15000)  |

<br>

### cgv_search_movies

날짜/극장 조건으로 CGV 영화 목록을 조회합니다. `theaterCode`가 없으면 위치 키워드 기준 최근접 극장을 선택할 수 있습니다.

| 파라미터      | 필수 | 설명                               |
| :------------ | :--: | :--------------------------------- |
| `playDate`    |      | 조회 날짜 (YYYYMMDD, 기본값: 오늘) |
| `theaterCode` |      | CGV 극장 코드 (예: 0056)           |
| `keyword`     |      | 위치 키워드 (예: 안산 중앙역)      |
| `latitude`    |      | 위도                               |
| `longitude`   |      | 경도                               |
| `timeoutMs`   |      | 요청 제한 시간(ms, 기본값: 15000)  |

<br>

### cgv_get_timetable

날짜/극장/영화 조건으로 CGV 상영 시간표를 조회합니다. `theaterCode`가 없으면 위치 키워드 기준 최근접 극장을 선택할 수 있습니다.

| 파라미터      | 필수 | 설명                               |
| :------------ | :--: | :--------------------------------- |
| `playDate`    |      | 조회 날짜 (YYYYMMDD, 기본값: 오늘) |
| `theaterCode` |      | CGV 극장 코드 (예: 0056)           |
| `movieCode`   |      | CGV 영화 코드                      |
| `keyword`     |      | 위치 키워드 (예: 안산 중앙역)      |
| `latitude`    |      | 위도                               |
| `longitude`   |      | 경도                               |
| `limit`       |      | 최대 결과 수 (기본값: 50)          |
| `timeoutMs`   |      | 요청 제한 시간(ms, 기본값: 15000)  |

<br>

### 올리브영 REST 캐싱 정책

Cloudflare Edge Cache API(`caches.default`)를 사용해 올리브영 REST 응답을 캐싱합니다.

- `GET /api/oliveyoung/stores`: 24시간 TTL
- `GET /api/oliveyoung/inventory`: 10분 TTL
- 공통: `stale-while-revalidate` 적용, 오류 응답(4xx/5xx)은 캐시하지 않음

<br>

### 메가박스 REST 캐싱 정책

Cloudflare Edge Cache API(`caches.default`)를 사용해 메가박스 REST 응답을 캐싱합니다.

- `GET /api/megabox/theaters`: 24시간 TTL
- `GET /api/megabox/movies`: 10분 TTL
- `GET /api/megabox/seats`: 3분 TTL
- 공통: `stale-while-revalidate` 적용, 오류 응답(4xx/5xx)은 캐시하지 않음

<br>

### CGV REST 캐싱 정책

Cloudflare Edge Cache API(`caches.default`)를 사용해 CGV REST 응답을 캐싱합니다.

- `GET /api/cgv/theaters`: 24시간 TTL
- `GET /api/cgv/movies`: 10분 TTL
- `GET /api/cgv/timetable`: 3분 TTL
- 공통: `stale-while-revalidate` 적용, 오류 응답(4xx/5xx)은 캐시하지 않음

<br>

### 롯데시네마 REST 캐싱 정책

Cloudflare Edge Cache API(`caches.default`)를 사용해 롯데시네마 REST 응답을 캐싱합니다.

- `GET /api/lottecinema/theaters`: 24시간 TTL
- `GET /api/lottecinema/movies`: 10분 TTL
- `GET /api/lottecinema/seats`: 3분 TTL
- 공통: `stale-while-revalidate` 적용, 오류 응답(4xx/5xx)은 캐시하지 않음

<br>

### 다이소 REST 캐싱 정책

Cloudflare Edge Cache API(`caches.default`)를 사용해 다이소 REST 응답을 캐싱합니다.

- `GET /api/daiso/products`: 30분 TTL
- `GET /api/daiso/products/:id`: 1시간 TTL
- `GET /api/daiso/stores`: 24시간 TTL
- `GET /api/daiso/inventory`: 10분 TTL
- `GET /api/daiso/display-location`: 10분 TTL
- 공통: `stale-while-revalidate` 적용, 오류 응답(4xx/5xx)은 캐시하지 않음

<br>

### CU REST 캐싱 정책

Cloudflare Edge Cache API(`caches.default`)를 사용해 CU REST 응답을 캐싱합니다.

- `GET /api/cu/stores`: 24시간 TTL
- `GET /api/cu/inventory`: 10분 TTL
- 공통: `stale-while-revalidate` 적용, 오류 응답(4xx/5xx)은 캐시하지 않음

<br>

### 이마트24 REST 캐싱 정책

Cloudflare Edge Cache API(`caches.default`)를 사용해 이마트24 REST 응답을 캐싱합니다.

- `GET /api/emart24/stores`: 30분 TTL
- `GET /api/emart24/products`: 10분 TTL
- `GET /api/emart24/inventory`: 5분 TTL
- 공통: `stale-while-revalidate` 적용, 오류 응답(4xx/5xx)은 캐시하지 않음

<br>

---

<br>

## REST API

MCP를 지원하지 않는 서비스를 위한 GET 기반 REST API입니다.

### 엔드포인트

| 엔드포인트                        | 설명                                |
| :-------------------------------- | :---------------------------------- |
| `GET /prompt`                     | API 사용법 설명 페이지 (에이전트용) |
| `GET /api/daiso/products`         | 제품 검색                           |
| `GET /api/daiso/products/:id`     | 제품 상세 정보                      |
| `GET /api/daiso/stores`           | 매장 검색                           |
| `GET /api/daiso/inventory`        | 재고 확인                           |
| `GET /api/daiso/display-location` | 진열 위치 조회                      |
| `GET /api/cu/stores`              | CU 매장 검색                        |
| `GET /api/cu/inventory`           | CU 재고 확인                        |
| `GET /api/emart24/stores`         | 이마트24 매장 검색                  |
| `GET /api/emart24/products`       | 이마트24 상품 검색                  |
| `GET /api/emart24/inventory`      | 이마트24 재고 확인                  |
| `GET /api/oliveyoung/stores`      | 올리브영 매장 검색                  |
| `GET /api/oliveyoung/inventory`   | 올리브영 재고 확인                  |
| `GET /api/megabox/theaters`       | 메가박스 주변 지점 조회             |
| `GET /api/megabox/movies`         | 메가박스 영화/회차 목록 조회        |
| `GET /api/megabox/seats`          | 메가박스 잔여 좌석 조회             |
| `GET /api/lottecinema/theaters`   | 롯데시네마 주변 지점 조회           |
| `GET /api/lottecinema/movies`     | 롯데시네마 영화/회차 목록 조회      |
| `GET /api/lottecinema/seats`      | 롯데시네마 잔여 좌석 조회           |
| `GET /api/cgv/theaters`           | CGV 극장 목록 조회                  |
| `GET /api/cgv/movies`             | CGV 영화 목록 조회                  |
| `GET /api/cgv/timetable`          | CGV 상영 시간표 조회                |

### 제품 검색

```
GET /api/daiso/products?q={검색어}&page={페이지}&pageSize={개수}
```

| 파라미터   | 필수 | 설명                          |
| :--------- | :--: | :---------------------------- |
| `q`        |  O   | 검색 키워드                   |
| `page`     |      | 페이지 번호 (기본값: 1)       |
| `pageSize` |      | 페이지당 결과 수 (기본값: 30) |

### 매장 검색

```
GET /api/daiso/stores?keyword={키워드}&sido={시도}&limit={개수}
```

| 파라미터  | 필수 | 설명                                                |
| :-------- | :--: | :-------------------------------------------------- |
| `keyword` |  △   | 매장명/주소 키워드 (keyword 또는 sido 중 하나 필수) |
| `sido`    |  △   | 시/도                                               |
| `gugun`   |      | 구/군                                               |
| `dong`    |      | 동                                                  |
| `limit`   |      | 최대 결과 수 (기본값: 50)                           |

### 재고 확인

```
GET /api/daiso/inventory?productId={제품ID}&lat={위도}&lng={경도}
```

| 파라미터    | 필수 | 설명                          |
| :---------- | :--: | :---------------------------- |
| `productId` |  O   | 제품 ID                       |
| `lat`       |      | 위도 (기본값: 37.5665)        |
| `lng`       |      | 경도 (기본값: 126.978)        |
| `keyword`   |      | 매장 검색어                   |
| `page`      |      | 페이지 번호 (기본값: 1)       |
| `pageSize`  |      | 페이지당 결과 수 (기본값: 30) |

### 올리브영 매장 검색

```
GET /api/oliveyoung/stores?keyword={키워드}&lat={위도}&lng={경도}
```

| 파라미터  | 필수 | 설명                                |
| :-------- | :--: | :---------------------------------- |
| `keyword` |      | 매장명/지역 키워드 (예: 명동, 강남) |
| `lat`     |      | 위도 (기본값: 37.5665)              |
| `lng`     |      | 경도 (기본값: 126.978)              |
| `pageIdx` |      | 페이지 번호 (기본값: 1)             |
| `limit`   |      | 최대 결과 수 (기본값: 20)           |

### CU 매장 검색

```
GET /api/cu/stores?keyword={키워드}&lat={위도}&lng={경도}
```

| 파라미터  | 필수 | 설명                                |
| :-------- | :--: | :---------------------------------- |
| `keyword` |      | 매장명/지역 키워드 (예: 강남, 안산) |
| `lat`     |      | 위도 (기본값: 37.5665)              |
| `lng`     |      | 경도 (기본값: 126.978)              |
| `limit`   |      | 최대 결과 수 (기본값: 20)           |

### CU 재고 확인

```
GET /api/cu/inventory?keyword={검색어}&lat={위도}&lng={경도}
```

| 파라미터       | 필수 | 설명                           |
| :------------- | :--: | :----------------------------- |
| `keyword`      |  O   | 검색 키워드 (예: 과자, 컵라면) |
| `lat`          |      | 위도 (기본값: 37.5665)         |
| `lng`          |      | 경도 (기본값: 126.978)         |
| `storeKeyword` |      | 주변 매장 필터 키워드          |
| `size`         |      | 검색 결과 수 (기본값: 20)      |
| `offset`       |      | 검색 시작 오프셋 (기본값: 0)   |
| `searchSort`   |      | 정렬 방식 (기본값: `recom`)    |
| `storeLimit`   |      | 매장 결과 수 (기본값: 10)      |

### 올리브영 재고 확인

```
GET /api/oliveyoung/inventory?keyword={검색어}&lat={위도}&lng={경도}
```

| 파라미터         | 필수 | 설명                           |
| :--------------- | :--: | :----------------------------- |
| `keyword`        |  O   | 검색 키워드 (예: 선크림, 립밤) |
| `lat`            |      | 위도 (기본값: 37.5665)         |
| `lng`            |      | 경도 (기본값: 126.978)         |
| `storeKeyword`   |      | 주변 매장 필터 키워드          |
| `page`           |      | 페이지 번호 (기본값: 1)        |
| `size`           |      | 페이지당 결과 수 (기본값: 20)  |
| `sort`           |      | 정렬 코드 (기본값: 01)         |
| `includeSoldOut` |      | 품절 포함 여부 (기본값: false) |

응답의 `inventory.products[]`에는 `inStock`, `stockStatus`, `stockSource`, `storeInventory`가 포함될 수 있습니다. `stockSource=nearby_store`이면 `inStock`는 주변 매장 기준 결과입니다.

### 메가박스 주변 지점 조회

```
GET /api/megabox/theaters?keyword={위치키워드}&lat={위도}&lng={경도}&playDate={YYYYMMDD}&areaCode={지역코드}
```

| 파라미터   | 필수 | 설명                               |
| :--------- | :--: | :--------------------------------- |
| `keyword`  |      | 위치 키워드 (예: 안산 중앙역)      |
| `lat`      |      | 위도 (기본값: 37.5665)             |
| `lng`      |      | 경도 (기본값: 126.978)             |
| `playDate` |      | 조회 날짜 (YYYYMMDD, 기본값: 오늘) |
| `areaCode` |      | 지역 코드 (기본값: 11, 서울)       |
| `limit`    |      | 최대 결과 수 (기본값: 10)          |

### 메가박스 영화/회차 목록 조회

```
GET /api/megabox/movies?playDate={YYYYMMDD}&theaterId={지점ID}&movieId={영화ID}&keyword={위치키워드}
```

| 파라미터    | 필수 | 설명                               |
| :---------- | :--: | :--------------------------------- |
| `playDate`  |      | 조회 날짜 (YYYYMMDD, 기본값: 오늘) |
| `theaterId` |      | 지점 ID (예: 1372)                 |
| `movieId`   |      | 영화 ID (예: 25104500)             |
| `keyword`   |      | 위치 키워드 (예: 안산 중앙역)      |
| `lat`       |      | 위도                               |
| `lng`       |      | 경도                               |
| `areaCode`  |      | 지역 코드 (기본값: 11, 서울)       |

### 메가박스 잔여 좌석 조회

```
GET /api/megabox/seats?playDate={YYYYMMDD}&theaterId={지점ID}&movieId={영화ID}&keyword={위치키워드}
```

| 파라미터    | 필수 | 설명                               |
| :---------- | :--: | :--------------------------------- |
| `playDate`  |      | 조회 날짜 (YYYYMMDD, 기본값: 오늘) |
| `theaterId` |      | 지점 ID                            |
| `movieId`   |      | 영화 ID                            |
| `keyword`   |      | 위치 키워드 (예: 안산 중앙역)      |
| `lat`       |      | 위도                               |
| `lng`       |      | 경도                               |
| `areaCode`  |      | 지역 코드 (기본값: 11, 서울)       |
| `limit`     |      | 최대 결과 수 (기본값: 50)          |

### 롯데시네마 주변 지점 조회

```
GET /api/lottecinema/theaters?lat={위도}&lng={경도}&playDate={YYYYMMDD}
```

| 파라미터   | 필수 | 설명                               |
| :--------- | :--: | :--------------------------------- |
| `lat`      |      | 위도 (기본값: 37.5665)             |
| `lng`      |      | 경도 (기본값: 126.978)             |
| `playDate` |      | 조회 날짜 (YYYYMMDD, 기본값: 오늘) |
| `limit`    |      | 최대 결과 수 (기본값: 10)          |

### 롯데시네마 영화/회차 목록 조회

```
GET /api/lottecinema/movies?playDate={YYYYMMDD}&theaterId={지점ID}&movieId={영화ID}
```

| 파라미터    | 필수 | 설명                               |
| :---------- | :--: | :--------------------------------- |
| `playDate`  |      | 조회 날짜 (YYYYMMDD, 기본값: 오늘) |
| `theaterId` |      | 지점 ID (예: 1016)                 |
| `movieId`   |      | 대표 영화 코드 (예: 23816)         |

### 롯데시네마 잔여 좌석 조회

```
GET /api/lottecinema/seats?playDate={YYYYMMDD}&theaterId={지점ID}&movieId={영화ID}
```

| 파라미터    | 필수 | 설명                               |
| :---------- | :--: | :--------------------------------- |
| `playDate`  |      | 조회 날짜 (YYYYMMDD, 기본값: 오늘) |
| `theaterId` |      | 지점 ID                            |
| `movieId`   |      | 대표 영화 코드                     |
| `limit`     |      | 최대 결과 수 (기본값: 50)          |

### CGV 극장 목록 조회

```
GET /api/cgv/theaters?playDate={YYYYMMDD}&regionCode={지역코드}&keyword={위치키워드}
```

| 파라미터     | 필수 | 설명                               |
| :----------- | :--: | :--------------------------------- |
| `playDate`   |      | 조회 날짜 (YYYYMMDD, 기본값: 오늘) |
| `regionCode` |      | 지역 코드 (예: 01 서울)            |
| `keyword`    |      | 위치 키워드 (예: 안산 중앙역)      |
| `lat`        |      | 위도                               |
| `lng`        |      | 경도                               |
| `limit`      |      | 최대 결과 수 (기본값: 30)          |
| `timeoutMs`  |      | 요청 제한 시간(ms, 기본값: 15000)  |

### CGV 영화 목록 조회

```
GET /api/cgv/movies?playDate={YYYYMMDD}&theaterCode={극장코드}&keyword={위치키워드}
```

| 파라미터      | 필수 | 설명                               |
| :------------ | :--: | :--------------------------------- |
| `playDate`    |      | 조회 날짜 (YYYYMMDD, 기본값: 오늘) |
| `theaterCode` |      | CGV 극장 코드 (예: 0056)           |
| `keyword`     |      | 위치 키워드 (예: 안산 중앙역)      |
| `lat`         |      | 위도                               |
| `lng`         |      | 경도                               |
| `timeoutMs`   |      | 요청 제한 시간(ms, 기본값: 15000)  |

### CGV 시간표 조회

```
GET /api/cgv/timetable?playDate={YYYYMMDD}&theaterCode={극장코드}&movieCode={영화코드}&keyword={위치키워드}
```

| 파라미터      | 필수 | 설명                               |
| :------------ | :--: | :--------------------------------- |
| `playDate`    |      | 조회 날짜 (YYYYMMDD, 기본값: 오늘) |
| `theaterCode` |      | CGV 극장 코드 (예: 0056)           |
| `movieCode`   |      | CGV 영화 코드                      |
| `keyword`     |      | 위치 키워드 (예: 안산 중앙역)      |
| `lat`         |      | 위도                               |
| `lng`         |      | 경도                               |
| `limit`       |      | 최대 결과 수 (기본값: 50)          |
| `timeoutMs`   |      | 요청 제한 시간(ms, 기본값: 15000)  |

### 응답 형식

```json
{
  "success": true,
  "data": { ... },
  "meta": { "total": 100, "page": 1, "pageSize": 30 }
}
```

<br>

---

<br>

## 사용 예시

```
사용자: 수납박스 검색해줘
AI: daiso_search_products 도구로 제품 목록 조회

사용자: 이 제품 안산 중앙역 근처 매장에 재고 있어?
AI: daiso_check_inventory 도구로 특정 매장 재고 확인

사용자: 강남역 근처 다이소 매장 찾아줘
AI: daiso_find_stores 도구로 매장 검색

사용자: 이 상품 이 매장 어디에 있어?
AI: daiso_get_display_location 도구로 매장 내 진열 위치 조회

사용자: 명동 근처 올리브영 매장 찾아줘
AI: oliveyoung_find_nearby_stores 도구로 주변 매장 검색

사용자: 올리브영 선크림 재고 확인해줘
AI: oliveyoung_check_inventory 도구로 재고/매장 정보 조회

사용자: 강남 근처 CU 매장 찾아줘
AI: cu_find_nearby_stores 도구로 CU 매장 검색

사용자: CU 과자 재고 확인해줘
AI: cu_check_inventory 도구로 CU 재고/매장 정보 조회

사용자: 강남역 근처 메가박스 지점 찾아줘
AI: megabox_find_nearby_theaters 도구로 주변 지점 조회

사용자: 메가박스 강남점 영화 목록과 잔여 좌석 알려줘
AI: megabox_list_now_showing / megabox_get_remaining_seats 도구로 회차/좌석 조회

사용자: 잠실 근처 롯데시네마 지점 찾아줘
AI: lottecinema_find_nearby_theaters 도구로 주변 지점 조회

사용자: 롯데시네마 월드타워 영화 목록과 잔여 좌석 알려줘
AI: lottecinema_list_now_showing / lottecinema_get_remaining_seats 도구로 회차/좌석 조회

사용자: 서울 지역 CGV 극장 목록 알려줘
AI: cgv_find_theaters 도구로 CGV 극장 목록 조회

사용자: CGV 강남 상영 영화랑 시간표 알려줘
AI: cgv_search_movies / cgv_get_timetable 도구로 영화/시간표 조회
```

<br>

---

<br>

## 개발

```bash
# Node 버전 맞추기
nvm use

# 설치
npm ci

# 환경 변수 설정
cp .env.example .env
# .env 파일에 ZYTE_API_KEY 값 입력

# 품질 검사 (포맷/린트/타입/테스트)
npm run check

# 로컬 개발 서버
npm run dev

# 배포
npm run deploy
```

## npm 퍼블리싱

```bash
# npm 로그인
npm login

# 배포 산출물/메타 검증
npm run release:dry-run

# 퍼블리시 (공개 패키지)
npm run publish:public
```

기여 가이드는 [CONTRIBUTING.md](../CONTRIBUTING.md)에서 확인할 수 있습니다.

<br>

---

<br>

## 아키텍처

| 항목       | 기술                         |
| :--------- | :--------------------------- |
| 런타임     | Cloudflare Workers           |
| 프레임워크 | Hono + TypeScript            |
| 프로토콜   | MCP (Model Context Protocol) |
| 전송       | SSE (Server-Sent Events)     |

<br>

---

<br>

## 프로젝트 구조

```
daiso-mcp/
├── src/
│   ├── index.ts              # MCP 서버 진입점
│   ├── core/                 # 핵심 모듈
│   │   ├── types.ts          # 공통 타입
│   │   ├── interfaces.ts     # ServiceProvider 인터페이스
│   │   └── registry.ts       # ServiceRegistry
│   ├── services/             # 서비스 프로바이더
│   │   ├── daiso/            # 다이소 서비스
│   │   ├── cu/               # CU 서비스
│   │   ├── oliveyoung/       # 올리브영 서비스 (Zyte API)
│   │   ├── megabox/          # 메가박스 서비스
│   │   ├── lottecinema/      # 롯데시네마 서비스
│   │   └── cgv/              # CGV 서비스
│   ├── api/                  # REST API (MCP 미지원 서비스용)
│   │   ├── handlers.ts       # 다이소/CU/올리브영 API 핸들러
│   │   ├── megaboxHandlers.ts # 메가박스 API 핸들러
│   │   ├── lottecinemaHandlers.ts # 롯데시네마 API 핸들러
│   │   ├── cgvHandlers.ts    # CGV API 핸들러
│   │   └── routes/           # 서비스별 API 라우트
│   ├── pages/                # 정적 페이지
│   │   └── prompt.ts         # 에이전트용 프롬프트 페이지
│   └── utils/                # 유틸리티
├── wrangler.toml             # Cloudflare Workers 설정
└── package.json
```

<br>

---

<br>

## 확장 가능한 아키텍처

이 프로젝트는 **플러그인 기반 아키텍처**로 설계되어 새로운 서비스를 쉽게 추가할 수 있습니다.

### 핵심 컴포넌트

| 컴포넌트           | 역할                                   |
| :----------------- | :------------------------------------- |
| `ServiceProvider`  | 모든 서비스가 구현해야 하는 인터페이스 |
| `ServiceRegistry`  | 서비스 등록 및 MCP 서버 연결 관리      |
| `ToolRegistration` | 도구 메타데이터와 핸들러 정의          |

### 새 서비스 추가 방법

예: CU 편의점 서비스 추가

```typescript
// 1. src/services/cu/index.ts 생성
import type { ServiceProvider } from '../../core/interfaces.js';

class CuService implements ServiceProvider {
  readonly metadata = {
    id: 'cu',
    name: 'CU 편의점',
    version: '1.0.0',
  };

  getTools() {
    return [
      /* cu_search_products, cu_find_stores 등 */
    ];
  }
}

export function createCuService(): ServiceProvider {
  return new CuService();
}
```

```typescript
// 2. src/index.ts에 한 줄 추가
import { createCuService } from './services/cu/index.js';

registry.registerAll([createDaisoService, createCuService]);
```
