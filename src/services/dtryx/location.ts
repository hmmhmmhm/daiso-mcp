/**
 * 디트릭스 극장 레지스트리 및 극장 해석 보조 모듈
 *
 * 다른 영화관 서비스의 `location.ts` 와 같은 자리이지만, 디트릭스 응답에는
 * 극장 좌표가 없어 좌표 기반 근접 검색 대신 극장명 매칭만 제공합니다.
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
  {
    brandCode: 'indieart',
    cinemaCode: '000053',
    cinemaName: '씨네아트 리좀',
    region: '경남',
    address: '경상남도 창원시 마산합포구 동서북14길 24 (동성동)',
  },
  {
    brandCode: 'indieart',
    cinemaCode: '000057',
    cinemaName: '인디플러스포항',
    region: '경북',
    address: '경상북도 포항시 남구 희망대로 850, 1층 (대도동, 포항문화예술회관)',
  },
  {
    brandCode: 'indieart',
    cinemaCode: '000059',
    cinemaName: '오오극장',
    region: '대구',
    address: '대구광역시 중구 국채보상로 537 (수동)',
  },
  {
    brandCode: 'indieart',
    cinemaCode: '000061',
    cinemaName: '전주디지털독립영화관',
    region: '전북',
    address: '전라북도 전주시 완산구 전주객사3길 22, 2층 (고사동, 전주영화제작소)',
  },
  {
    brandCode: 'indieart',
    cinemaCode: '000065',
    cinemaName: '더숲아트시네마',
    region: '서울',
    address: '서울특별시 노원구 노해로 480, 지하1층 (상계동, 조광빌딩)',
  },
  {
    brandCode: 'indieart',
    cinemaCode: '000066',
    cinemaName: '광주극장',
    region: '광주',
    address: '광주광역시 동구 충장로46번길 10 (충장로5가)',
  },
  {
    brandCode: 'indieart',
    cinemaCode: '000067',
    cinemaName: '아트하우스모모',
    region: '서울',
    address: '서울특별시 서대문구 이화여대길 52, 지하4층 (대현동, 이화여대 ECC)',
  },
  {
    brandCode: 'indieart',
    cinemaCode: '000069',
    cinemaName: '에무시네마',
    region: '서울',
    address: '서울특별시 종로구 경희궁1가길 7, 1~3층·지하1층 (신문로2가)',
  },
  {
    brandCode: 'indieart',
    cinemaCode: '000071',
    cinemaName: '헤이리시네마',
    region: '경기',
    address: '경기도 파주시 탄현면 헤이리마을길 93-119, 지상3층',
  },
  {
    brandCode: 'spacedog',
    cinemaCode: '000072',
    cinemaName: '라이카시네마',
    region: '서울',
    address: '서울특별시 서대문구 연희로8길 18 (연희동)',
  },
  {
    brandCode: 'etc',
    cinemaCode: '000083',
    cinemaName: '천안인생극장',
    region: '충남',
    address: '충청남도 천안시 동남구 버들로 41',
  },
  {
    brandCode: 'etc',
    cinemaCode: '000084',
    cinemaName: '광주자동차극장',
    region: '광주',
    address: '광주광역시 북구 우치로 649',
  },
  {
    brandCode: 'etc',
    cinemaCode: '000088',
    cinemaName: '아리랑시네센터',
    region: '서울',
    address: '서울특별시 성북구 아리랑로12길 4',
  },
  {
    brandCode: 'etc',
    cinemaCode: '000092',
    cinemaName: '밀양시네마',
    region: '경남',
    address: '경상남도 밀양시 백민로 75-1',
  },
  {
    brandCode: 'etc',
    cinemaCode: '000097',
    cinemaName: '모퉁이극장',
    region: '부산',
    address: '부산광역시 중구 광복중앙로 13, 4층',
  },
  {
    brandCode: 'etc',
    cinemaCode: '000098',
    cinemaName: '씨네인디U',
    region: '대전',
    address: '대전광역시 중구 계백로 1712 (문화동, 기독교연합봉사회관 1층)',
  },
  {
    brandCode: 'etc',
    cinemaCode: '000100',
    cinemaName: '애관극장',
    region: '인천',
    address: '인천광역시 중구 경동 238',
  },
  {
    brandCode: 'etc',
    cinemaCode: '000107',
    cinemaName: '금성시네마',
    region: '충남',
    address: '충청남도 부여군 부여읍 사비로100번길 12',
  },
  {
    brandCode: 'etc',
    cinemaCode: '000113',
    cinemaName: '낭만극장',
    region: '서울',
    address: '서울특별시 종로구 삼일대로 428, 4층',
  },
  {
    brandCode: 'etc',
    cinemaCode: '000115',
    cinemaName: '허리우드클래식',
    region: '서울',
    address: '서울특별시 종로구 삼일대로 428, 4층',
  },
  {
    brandCode: 'etc',
    cinemaCode: '000116',
    cinemaName: '명화극장',
    region: '경기',
    address: '경기도 안산시 단원구 중앙대로 921 (고잔동, 동서코아빌딩 지하2층)',
  },
  {
    brandCode: 'etc',
    cinemaCode: '000117',
    cinemaName: '자유로자동차극장',
    region: '경기',
    address: '경기도 파주시 탄현면 필승로 432',
  },
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

/** 광역 지역명으로 극장을 찾습니다. 부분 일치를 허용합니다. */
export function findCinemasByRegion(region: string): DtryxCinema[] {
  const normalized = region.replace(/\s+/g, '');

  if (!normalized) {
    return [...DTRYX_CINEMAS];
  }

  return DTRYX_CINEMAS.filter((cinema) => cinema.region.includes(normalized));
}
