/**
 * 디트릭스 극장 카탈로그 테스트
 */

import { describe, expect, it } from 'vitest';
import {
  DTRYX_CINEMAS,
  findCinemaByCode,
  findCinemasByKeyword,
} from '../../../src/services/dtryx/catalog.js';

describe('디트릭스 극장 카탈로그', () => {
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
});
