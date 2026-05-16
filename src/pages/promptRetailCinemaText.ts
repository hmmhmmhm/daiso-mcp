/**
 * 프롬프트 리테일/영화 API 섹션
 */

export function buildPromptRetailCinemaText(baseUrl: string): string {
  return `### 6-1. 롯데마트 매장/상품 조회

**설명**: 롯데마트 계열 매장 검색과 특정 매장 기준 상품 가격/재고 조회를 제공합니다.

**URL**:
- ${baseUrl}/api/lottemart/stores?keyword={키워드}
- ${baseUrl}/api/lottemart/products?keyword={검색어}&storeName={매장명}

**선택 파라미터**:
- area: 지역 (예: 서울, 경기, 제주)
- brandVariant: lottemart, toysrus, max, bottlebunker, mealguru, grandgrocery
- lat: 위도 (선택)
- lng: 경도 (선택)
- limit: 최대 결과 수 (기본값: 20)
- storeCode 또는 storeName: 상품 검색 대상 매장
- pageLimit: 추가 조회할 최대 페이지 수 (기본값: 3)

**예시**:
- ${baseUrl}/api/lottemart/stores?keyword=잠실&area=서울&limit=10
- ${baseUrl}/api/lottemart/stores?area=경기&brandVariant=lottemart&limit=10
- ${baseUrl}/api/lottemart/products?keyword=콜라&storeName=강변점&area=서울
- ${baseUrl}/api/lottemart/products?keyword=우유&storeCode=2301&pageLimit=2

---

### 6-2. GS25 매장/상품/재고 조회

**설명**: GS25 매장 탐색, 상품 키워드 검색, 재고 조회를 제공합니다.

**URL**:
- ${baseUrl}/api/gs25/stores?keyword={키워드}
- ${baseUrl}/api/gs25/products?keyword={검색어}
- ${baseUrl}/api/gs25/inventory?keyword={검색어}
- ${baseUrl}/api/gs25/inventory?itemCode={상품코드}

**선택 파라미터(공통)**:
- lat: 위도 (선택)
- lng: 경도 (선택)
- limit / storeLimit: 최대 결과 수
- serviceCode: 서비스 코드 (기본값: 01)

**예시**:
- ${baseUrl}/api/gs25/stores?keyword=강남&limit=10
- ${baseUrl}/api/gs25/products?keyword=오감자&limit=20
- ${baseUrl}/api/gs25/inventory?keyword=오감자&storeKeyword=강남&storeLimit=10
- ${baseUrl}/api/gs25/inventory?itemCode=8801056038861&storeKeyword=안산%20중앙역&storeLimit=10

---

### 6-3. 세븐일레븐 상품/매장/재고/인기검색어/카탈로그 조회

**설명**: 세븐일레븐 상품 검색, 매장 검색, 재고 수량 조회, 인기 검색어, 카탈로그 스냅샷을 제공합니다.

**URL**:
- ${baseUrl}/api/seveneleven/products?query={검색어}
- ${baseUrl}/api/seveneleven/stores?keyword={매장키워드}
- ${baseUrl}/api/seveneleven/inventory?keyword={검색어}
- ${baseUrl}/api/seveneleven/popwords?label={라벨}
- ${baseUrl}/api/seveneleven/catalog?includeIssues={true|false}&includeExhibition={true|false}&limit={개수}

**선택 파라미터**:
- page: 페이지 번호 (기본값: 1)
- size: 페이지당 결과 수 (기본값: 20)
- sort: 정렬 기준 (기본값: recommend)
- storeKeyword: 매장명/지역 키워드
- storeLimit: 최대 매장 수 (기본값: 20)
- timeoutMs: 요청 제한 시간 (기본값: 20000)
- label: 인기 검색어 라벨 (기본값: home)

**예시**:
- ${baseUrl}/api/seveneleven/products?query=삼각김밥&size=20
- ${baseUrl}/api/seveneleven/stores?keyword=안산%20중앙역&limit=10
- ${baseUrl}/api/seveneleven/inventory?keyword=핫식스&storeKeyword=안산%20중앙역&storeLimit=10
- ${baseUrl}/api/seveneleven/popwords?label=home
- ${baseUrl}/api/seveneleven/catalog?includeIssues=true&includeExhibition=true&limit=10

---

### 7. 메가박스 주변 지점 찾기

**설명**: 사용자 좌표 또는 위치 키워드 기준으로 메가박스 지점을 거리순으로 조회합니다.

**URL**: ${baseUrl}/api/megabox/theaters?lat={위도}&lng={경도}

**선택 파라미터**:
- keyword: 위치 키워드 (예: 안산 중앙역, 강남역)
- lat: 위도 (기본값: 37.5665)
- lng: 경도 (기본값: 126.978)
- playDate: 조회 날짜 (YYYYMMDD, 기본값: 오늘)
- areaCode: 지역 코드 (기본값: 11, 서울)
- limit: 최대 결과 수 (기본값: 10)

**예시**:
- ${baseUrl}/api/megabox/theaters?keyword=안산%20중앙역&limit=5
- ${baseUrl}/api/megabox/theaters?lat=37.4982&lng=127.0264
- ${baseUrl}/api/megabox/theaters?areaCode=11&limit=5

---

### 8. 메가박스 영화/회차 목록

**설명**: 날짜/지점 조건으로 메가박스 영화와 상영 회차를 조회합니다. theaterId가 없고 위치 키워드/좌표가 있으면 가장 가까운 지점을 먼저 선택합니다.

**URL**: ${baseUrl}/api/megabox/movies?playDate={YYYYMMDD}

**선택 파라미터**:
- playDate: 조회 날짜 (YYYYMMDD, 기본값: 오늘)
- theaterId: 지점 ID (예: 1372)
- movieId: 영화 ID (예: 25104500)
- keyword: 위치 키워드 (예: 안산 중앙역, 강남역)
- lat: 위도
- lng: 경도
- areaCode: 지역 코드 (기본값: 11)

**예시**:
- ${baseUrl}/api/megabox/movies?playDate=20260315&keyword=안산%20중앙역
- ${baseUrl}/api/megabox/movies?playDate=20260304&theaterId=1372
- ${baseUrl}/api/megabox/movies?playDate=20260304&movieId=25104500

---

### 9. 메가박스 잔여 좌석 조회

**설명**: 영화/지점/날짜 기준으로 회차별 잔여 좌석 수를 조회합니다. theaterId가 없고 위치 키워드/좌표가 있으면 가장 가까운 지점을 먼저 선택합니다.

**URL**: ${baseUrl}/api/megabox/seats?playDate={YYYYMMDD}

**선택 파라미터**:
- playDate: 조회 날짜 (YYYYMMDD, 기본값: 오늘)
- theaterId: 지점 ID
- movieId: 영화 ID
- keyword: 위치 키워드 (예: 안산 중앙역, 강남역)
- lat: 위도
- lng: 경도
- areaCode: 지역 코드 (기본값: 11)
- limit: 최대 결과 수 (기본값: 50)

**예시**:
- ${baseUrl}/api/megabox/seats?playDate=20260315&keyword=안산%20중앙역
- ${baseUrl}/api/megabox/seats?playDate=20260304&theaterId=1372
- ${baseUrl}/api/megabox/seats?playDate=20260304&movieId=25104500&limit=20

---

### 10. CGV 극장 검색

**설명**: 지역 코드 또는 위치 키워드 기준으로 CGV 극장 목록을 조회합니다.

**URL**: ${baseUrl}/api/cgv/theaters?playDate={YYYYMMDD}

**선택 파라미터**:
- playDate: 조회 날짜 (YYYYMMDD, 기본값: 오늘)
- regionCode: 지역 코드 (예: 01)
- keyword: 위치 키워드 (예: 안산 중앙역, 강남역)
- lat: 위도
- lng: 경도
- limit: 최대 결과 수 (기본값: 30)

**예시**:
- ${baseUrl}/api/cgv/theaters?playDate=20260304&regionCode=01
- ${baseUrl}/api/cgv/theaters?playDate=20260315&keyword=안산%20중앙역
- ${baseUrl}/api/cgv/theaters?playDate=20260304&limit=10

---

### 11. CGV 영화 검색

**설명**: 날짜/극장 조건으로 CGV 영화 목록을 조회합니다. theaterCode가 없으면 keyword 또는 lat,lng 기준으로 가장 가까운 극장을 먼저 선택합니다.

**URL**: ${baseUrl}/api/cgv/movies?playDate={YYYYMMDD}

**선택 파라미터**:
- playDate: 조회 날짜 (YYYYMMDD, 기본값: 오늘)
- theaterCode: 극장 코드 (예: 0056)
- keyword: 위치 키워드 (예: 안산 중앙역, 강남역)
- lat: 위도
- lng: 경도

**예시**:
- ${baseUrl}/api/cgv/movies?playDate=20260304&theaterCode=0056
- ${baseUrl}/api/cgv/movies?playDate=20260315&keyword=안산%20중앙역

---

### 12. CGV 시간표 조회

**설명**: 날짜/극장/영화 조건으로 CGV 상영 시간표를 조회합니다. theaterCode가 없으면 keyword 또는 lat,lng 기준으로 가장 가까운 극장을 먼저 선택합니다. 잔여 좌석은 각 회차의 \`remainingSeats\` 필드로 함께 내려옵니다.

**URL**: ${baseUrl}/api/cgv/timetable?playDate={YYYYMMDD}

**선택 파라미터**:
- playDate: 조회 날짜 (YYYYMMDD, 기본값: 오늘)
- theaterCode: 극장 코드 (예: 0056)
- movieCode: 영화 코드
- keyword: 위치 키워드 (예: 안산 중앙역, 강남역)
- lat: 위도
- lng: 경도
- limit: 최대 결과 수 (기본값: 50)

**예시**:
- ${baseUrl}/api/cgv/timetable?playDate=20260304&theaterCode=0056
- ${baseUrl}/api/cgv/timetable?playDate=20260315&keyword=안산%20중앙역
- ${baseUrl}/api/cgv/timetable?playDate=20260304&movieCode=200001

---

### 13. 롯데시네마 주변 지점 찾기

**설명**: 위치 키워드 또는 사용자 좌표 기준으로 롯데시네마 지점을 거리순으로 조회합니다.

**URL**: ${baseUrl}/api/lottecinema/theaters?keyword={위치키워드}

**선택 파라미터**:
- keyword: 위치 키워드 (예: 안산 중앙역, 잠실역)
- lat: 위도 (keyword가 없을 때 기본값: 37.5665)
- lng: 경도 (keyword가 없을 때 기본값: 126.978)
- playDate: 조회 날짜 (YYYYMMDD, 기본값: 오늘)
- limit: 최대 결과 수 (기본값: 10)

**예시**:
- ${baseUrl}/api/lottecinema/theaters?keyword=안산%20중앙역
- ${baseUrl}/api/lottecinema/theaters?lat=37.5133&lng=127.1042

---

### 14. 롯데시네마 영화/회차 목록

**설명**: 날짜/지점/영화 조건으로 롯데시네마 영화와 상영 회차를 조회합니다. theaterId가 없으면 위치 키워드 기준 최근접 지점을 선택할 수 있습니다.

**URL**: ${baseUrl}/api/lottecinema/movies?playDate={YYYYMMDD}

**선택 파라미터**:
- playDate: 조회 날짜 (YYYYMMDD, 기본값: 오늘)
- theaterId: 지점 ID (예: 1016)
- movieId: 대표 영화 코드 (예: 23816)
- keyword: 위치 키워드 (예: 안산 중앙역)
- lat: 위도 (theaterId가 없을 때 사용)
- lng: 경도 (theaterId가 없을 때 사용)

**예시**:
- ${baseUrl}/api/lottecinema/movies?playDate=20260315&keyword=안산%20중앙역
- ${baseUrl}/api/lottecinema/movies?playDate=20260310&theaterId=1016
- ${baseUrl}/api/lottecinema/movies?playDate=20260310&theaterId=1016&movieId=23816

---

### 15. 롯데시네마 잔여 좌석 조회

**설명**: 영화/지점/날짜 기준으로 회차별 잔여 좌석 수를 조회합니다. theaterId가 없으면 위치 키워드 기준 최근접 지점을 선택할 수 있습니다.

**URL**: ${baseUrl}/api/lottecinema/seats?playDate={YYYYMMDD}

**선택 파라미터**:
- playDate: 조회 날짜 (YYYYMMDD, 기본값: 오늘)
- theaterId: 지점 ID
- movieId: 대표 영화 코드
- keyword: 위치 키워드 (예: 안산 중앙역)
- lat: 위도 (theaterId가 없을 때 사용)
- lng: 경도 (theaterId가 없을 때 사용)
- limit: 최대 결과 수 (기본값: 50)

**예시**:
- ${baseUrl}/api/lottecinema/seats?playDate=20260315&keyword=안산%20중앙역
- ${baseUrl}/api/lottecinema/seats?playDate=20260310&theaterId=1016&movieId=23816

---

`;
}
