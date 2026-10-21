/** 공개 도구는 정확히 10개를 유지합니다. 신규 기능은 아래 작업으로 통합합니다. */
export interface CompactRoute {
  legacy: string;
  service?: string;
  operation?: string;
}
export interface CompactGroup {
  name: string;
  title: string;
  description: string;
  routes: CompactRoute[];
}
const retail = (names: Record<string, string>): CompactRoute[] =>
  Object.entries(names).map(([service, legacy]) => ({ service, legacy }));
export const COMPACT_CATALOG: CompactGroup[] = [
  {
    name: 'search_products',
    title: '상품 검색',
    description:
      '서비스별 상품 검색. daiso/daiso_jp/seveneleven은 query, gs25/emart24/oliveyoung은 keyword를 입력합니다. 재고 조회에 사용할 상품 코드를 얻습니다.',
    routes: retail({
      daiso: 'daiso_search_products',
      daiso_jp: 'daiso_jp_search_products',
      gs25: 'gs25_search_products',
      seveneleven: 'seveneleven_search_products',
      emart24: 'emart24_search_products',
      oliveyoung: 'oliveyoung_search_products',
    }),
  },
  {
    name: 'find_stores',
    title: '매장 검색',
    description:
      '서비스별 매장 검색. keyword 또는 latitude/longitude를 입력합니다. 일본은 매장 검색만 제공하며 매장별 재고는 지원하지 않습니다.',
    routes: retail({
      daiso: 'daiso_find_stores',
      daiso_jp: 'daiso_jp_find_stores',
      gs25: 'gs25_find_nearby_stores',
      seveneleven: 'seveneleven_search_stores',
      cu: 'cu_find_nearby_stores',
      emart24: 'emart24_find_nearby_stores',
      oliveyoung: 'oliveyoung_find_nearby_stores',
    }),
  },
  {
    name: 'check_inventory',
    title: '상품 재고 조회',
    description:
      '실제 매장 재고 확인. 다이소는 operation=by_name이면 query, by_id이면 productId를 입력합니다. 그 외 서비스는 keyword 또는 해당 상품 코드를 입력합니다. storeQuery는 다이소 위치, storeLimit은 매장 수(pageSize와 같은 값), productLimit은 후보 수이며 실제 조회 상품은 selectedProduct 하나입니다. 실패나 미확인 수량은 품절이 아닙니다.',
    routes: [
      { service: 'daiso', operation: 'by_id', legacy: 'daiso_check_inventory' },
      { service: 'daiso', operation: 'by_name', legacy: 'daiso_find_inventory_by_name' },
      ...retail({
        gs25: 'gs25_check_inventory',
        seveneleven: 'seveneleven_check_inventory',
        cu: 'cu_check_inventory',
        emart24: 'emart24_check_inventory',
        oliveyoung: 'oliveyoung_check_inventory',
      }),
    ],
  },
  {
    name: 'get_product_details',
    title: '상품 상세 조회',
    description:
      '일본 상품 상세는 service=daiso_jp, operation=product, id를 입력합니다. 한국 다이소 가격은 operation=price와 productId/productName, 진열 위치는 operation=display_location과 productId/storeCode를 입력합니다.',
    routes: [
      { service: 'daiso', operation: 'price', legacy: 'daiso_get_price_info' },
      { service: 'daiso', operation: 'display_location', legacy: 'daiso_get_display_location' },
      { service: 'daiso_jp', operation: 'product', legacy: 'daiso_jp_get_product' },
    ],
  },
  {
    name: 'find_places',
    title: '주변 장소와 영화관 검색',
    description:
      'service=places는 음식점/카페 등 장소 검색, 나머지는 영화관 검색입니다. location/keyword 또는 latitude/longitude를 입력합니다.',
    routes: retail({
      places: 'places_search_nearby',
      megabox: 'megabox_find_nearby_theaters',
      dtryx: 'dtryx_list_cinemas',
      lottecinema: 'lottecinema_find_nearby_theaters',
      cgv: 'cgv_find_theaters',
    }),
  },
  {
    name: 'get_showtimes',
    title: '영화와 상영 시간표 조회',
    description:
      'operation=movies는 상영 영화, seats는 메가박스/디트릭스/롯데시네마 잔여석, timetable은 CGV 시간표와 잔여석입니다. playDate는 YYYYMMDD, 각 서비스의 theaterId/theaterCode/cinemaCode를 사용합니다.',
    routes: [
      { service: 'megabox', operation: 'movies', legacy: 'megabox_list_now_showing' },
      { service: 'megabox', operation: 'seats', legacy: 'megabox_get_remaining_seats' },
      { service: 'dtryx', operation: 'movies', legacy: 'dtryx_list_now_showing' },
      { service: 'dtryx', operation: 'seats', legacy: 'dtryx_get_remaining_seats' },
      { service: 'lottecinema', operation: 'movies', legacy: 'lottecinema_list_now_showing' },
      { service: 'lottecinema', operation: 'seats', legacy: 'lottecinema_get_remaining_seats' },
      { service: 'cgv', operation: 'movies', legacy: 'cgv_search_movies' },
      { service: 'cgv', operation: 'timetable', legacy: 'cgv_get_timetable' },
    ],
  },
  {
    name: 'get_fuel_info',
    title: '유가와 주유소 조회',
    description:
      '오피넷 정보. operation=average 평균유가, lowest 최저가 주유소, around 주변 주유소, detail 주유소 상세. 각 작업의 지역/좌표/주유소 ID 조건을 입력합니다.',
    routes: [
      { operation: 'average', legacy: 'opinet_get_average_prices' },
      { operation: 'lowest', legacy: 'opinet_get_lowest_price_stations' },
      { operation: 'around', legacy: 'opinet_search_stations_around' },
      { operation: 'detail', legacy: 'opinet_get_station_detail' },
    ],
  },
  {
    name: 'get_catalog',
    title: '인기 검색어와 기획전',
    description:
      '세븐일레븐 공개 카탈로그. operation=popwords 인기 검색어, snapshot 기획전/이슈 목록입니다. operation은 필수입니다. includeIssues/includeExhibition/limit은 snapshot 전용이며 popwords에는 label만 지정합니다. 실시간 재고를 의미하지 않습니다.',
    routes: [
      { operation: 'popwords', legacy: 'seveneleven_get_search_popwords' },
      { operation: 'snapshot', legacy: 'seveneleven_get_catalog_snapshot' },
    ],
  },
  {
    name: 'compare_products',
    title: '상품 비교',
    description: '기존 서비스 상품 가격 후보를 비교합니다.',
    routes: [{ legacy: 'compare_products' }],
  },
  {
    name: 'submit_request',
    title: '요청 제출',
    description:
      '요청을 제출합니다. 현재 requestType=developer만 지원하며 request에 개발자에게 전달할 오류/개선/기능/문서 요청을 입력합니다. 미래 요청 유형도 이 도구에서 확장합니다. 사용자 요청이 있을 때만 제출하고 인증값/개인정보는 넣지 마세요.',
    routes: [{ legacy: 'submit_developer_request' }],
  },
];
export const PUBLIC_TOOL_NAMES = Object.freeze(COMPACT_CATALOG.map((group) => group.name));
export const PUBLIC_TOOL_LIMIT = 10;
