/**
 * 디트릭스 극장 카탈로그
 *
 * 디트릭스는 브랜드/극장 목록을 반환하는 공개 엔드포인트를 제공하지 않습니다.
 * 그래서 조회로 확인된 극장을 상수로 관리합니다.
 *
 * 아래 목록은 상영시간표 응답의 `CinemaNm` 으로 확인한 값만 담았습니다.
 * `indieart/000068`, `etc/000086` 두 코드는 상영 가능 날짜는 있으나
 * 아직 편성 회차가 없어 극장명을 확인하지 못해 제외했습니다.
 *
 * `BrandCd` 는 조회 시 반드시 일치해야 하며, 값이 다르면 오류 없이 0건이 반환됩니다.
 */

import type { DtryxCinema } from './types.js';

export const DTRYX_CINEMAS: readonly DtryxCinema[] = [
  { brandCode: 'indieart', cinemaCode: '000053', cinemaName: '씨네아트 리좀' },
  { brandCode: 'indieart', cinemaCode: '000057', cinemaName: '인디플러스포항' },
  { brandCode: 'indieart', cinemaCode: '000059', cinemaName: '오오극장' },
  { brandCode: 'indieart', cinemaCode: '000061', cinemaName: '전주디지털독립영화관' },
  { brandCode: 'indieart', cinemaCode: '000065', cinemaName: '더숲아트시네마' },
  { brandCode: 'indieart', cinemaCode: '000066', cinemaName: '광주극장' },
  { brandCode: 'indieart', cinemaCode: '000067', cinemaName: '아트하우스모모' },
  { brandCode: 'indieart', cinemaCode: '000069', cinemaName: '에무시네마' },
  { brandCode: 'indieart', cinemaCode: '000071', cinemaName: '헤이리시네마' },
  { brandCode: 'spacedog', cinemaCode: '000072', cinemaName: '라이카시네마' },
  { brandCode: 'etc', cinemaCode: '000083', cinemaName: '천안인생극장' },
  { brandCode: 'etc', cinemaCode: '000084', cinemaName: '광주자동차극장' },
  { brandCode: 'etc', cinemaCode: '000088', cinemaName: '아리랑시네센터' },
  { brandCode: 'etc', cinemaCode: '000092', cinemaName: '밀양시네마' },
  { brandCode: 'etc', cinemaCode: '000097', cinemaName: '모퉁이극장' },
  { brandCode: 'etc', cinemaCode: '000098', cinemaName: '씨네인디U' },
  { brandCode: 'etc', cinemaCode: '000100', cinemaName: '애관극장' },
  { brandCode: 'etc', cinemaCode: '000107', cinemaName: '금성시네마' },
  { brandCode: 'etc', cinemaCode: '000113', cinemaName: '낭만극장' },
  { brandCode: 'etc', cinemaCode: '000115', cinemaName: '허리우드클래식' },
  { brandCode: 'etc', cinemaCode: '000116', cinemaName: '명화극장' },
  { brandCode: 'etc', cinemaCode: '000117', cinemaName: '자유로자동차극장' },
];

/** 극장명 부분 일치로 카탈로그를 검색합니다. */
export function findCinemasByKeyword(keyword: string): DtryxCinema[] {
  const normalized = keyword.replace(/\s+/g, '').toLowerCase();

  if (!normalized) {
    return [...DTRYX_CINEMAS];
  }

  return DTRYX_CINEMAS.filter((cinema) =>
    cinema.cinemaName.replace(/\s+/g, '').toLowerCase().includes(normalized),
  );
}

/** 극장 코드로 카탈로그 항목을 찾습니다. */
export function findCinemaByCode(cinemaCode: string): DtryxCinema | undefined {
  return DTRYX_CINEMAS.find((cinema) => cinema.cinemaCode === cinemaCode);
}
