/**
 * 디트릭스 극장 레지스트리 테스트
 */

import { describe, expect, it } from 'vitest';
import {
  DTRYX_CINEMAS,
  findCinemaByCode,
  findCinemasByKeyword,
  findCinemasByRegion,
} from '../../../src/services/dtryx/location.js';

describe('디트릭스 극장 레지스트리', () => {
  it('극장 코드가 중복되지 않는다', () => {
    const codes = DTRYX_CINEMAS.map((cinema) => cinema.cinemaCode);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('알려진 브랜드 코드만 사용한다', () => {
    const brands = new Set(DTRYX_CINEMAS.map((cinema) => cinema.brandCode));
    expect([...brands].sort()).toEqual(['etc', 'indieart', 'spacedog']);
  });

  it('모든 항목에 극장명이 있다', () => {
    expect(DTRYX_CINEMAS.every((cinema) => cinema.cinemaName.length > 0)).toBe(true);
  });

  it('키워드 부분 일치로 극장을 찾는다', () => {
    expect(findCinemasByKeyword('모모').map((cinema) => cinema.cinemaCode)).toEqual(['000067']);
  });

  it('공백을 무시하고 비교한다', () => {
    expect(findCinemasByKeyword('아트하우스 모모')).toHaveLength(1);
  });

  it('키워드가 비면 전체를 반환한다', () => {
    expect(findCinemasByKeyword('')).toHaveLength(DTRYX_CINEMAS.length);
  });

  it('일치하는 극장이 없으면 빈 배열이다', () => {
    expect(findCinemasByKeyword('존재하지않는극장')).toEqual([]);
  });

  it('극장 코드로 조회한다', () => {
    expect(findCinemaByCode('000072')?.cinemaName).toBe('라이카시네마');
    expect(findCinemaByCode('999999')).toBeUndefined();
  });

  it('모든 항목에 지역과 주소가 있다', () => {
    expect(
      DTRYX_CINEMAS.every((cinema) => cinema.region.length > 0 && cinema.address.length > 0),
    ).toBe(true);
  });

  it('주소가 지역 표기와 어긋나지 않는다', () => {
    const prefix: Record<string, string> = {
      서울: '서울특별시',
      경기: '경기도',
      인천: '인천광역시',
      대전: '대전광역시',
      대구: '대구광역시',
      부산: '부산광역시',
      광주: '광주광역시',
      충남: '충청남도',
      전북: '전라북도',
      경남: '경상남도',
      경북: '경상북도',
    };
    for (const cinema of DTRYX_CINEMAS) {
      expect(cinema.address.startsWith(prefix[cinema.region] ?? '')).toBe(true);
    }
  });

  it('지역명으로 극장을 찾는다', () => {
    expect(findCinemasByRegion('서울')).toHaveLength(7);
    expect(findCinemasByRegion('경기')).toHaveLength(3);
  });

  it('지역명이 비면 전체를 반환한다', () => {
    expect(findCinemasByRegion('')).toHaveLength(DTRYX_CINEMAS.length);
  });

  it('없는 지역이면 빈 배열이다', () => {
    expect(findCinemasByRegion('제주')).toEqual([]);
  });
});
