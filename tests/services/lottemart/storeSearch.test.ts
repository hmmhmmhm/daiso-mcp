import { describe, expect, it, vi } from 'vitest';
import {
  attachDistance,
  fetchAllStoresForAreaList,
  fetchKeywordMatchedStores,
  getTargetAreas,
  normalizeArea,
  toDisplayArea,
} from '../../../src/services/lottemart/storeSearch.js';
import type { LotteMartStore } from '../../../src/services/lottemart/types.js';

function createStore(overrides: Partial<LotteMartStore> = {}): LotteMartStore {
  return {
    area: '경기',
    storeCode: '2415',
    storeName: '안산점',
    brandVariant: 'lottemart',
    address: '경기 안산시 상록구 항가울로 422',
    phone: '031-000-0000',
    openTime: '',
    closedDays: '',
    parkingType: '',
    parkingDetails: '',
    detailUrl: '',
    latitude: 37.3,
    longitude: 126.8,
    distanceM: null,
    ...overrides,
  };
}

describe('lottemart storeSearch helpers', () => {
  it('지역 정규화와 표시 이름을 변환한다', () => {
    expect(normalizeArea('제주')).toBe('기타');
    expect(normalizeArea('경기')).toBe('경기');
    expect(normalizeArea('없는지역')).toBeUndefined();
    expect(toDisplayArea('기타')).toBe('제주');
    expect(toDisplayArea('경기')).toBe('경기');
  });

  it('대상 지역 목록을 반환한다', () => {
    expect(getTargetAreas('경기')).toEqual(['경기']);
    expect(getTargetAreas().length).toBeGreaterThan(1);
  });

  it('좌표가 있으면 거리를 붙이고 없으면 원본을 유지한다', () => {
    const withDistance = attachDistance([createStore()], 37.3001, 126.8001);
    const withoutDistance = attachDistance(
      [createStore({ latitude: 0, longitude: 0 }), createStore()],
      undefined,
      undefined,
    );

    expect(withDistance[0]?.distanceM).toBeTypeOf('number');
    expect(withoutDistance[0]?.distanceM).toBeNull();
    expect(withoutDistance[1]?.distanceM).toBeNull();
  });

  it('여러 지역의 매장 목록을 합친다', async () => {
    const fetcher = vi.fn(async (area: string) => [createStore({ area, storeCode: area })]);

    const stores = await fetchAllStoresForAreaList(['서울', '경기'], fetcher);

    expect(stores.map((store) => store.storeCode)).toEqual(['서울', '경기']);
  });

  it('키워드 일치 매장을 찾으면 limit에서 순차 조회를 멈춘다', async () => {
    const fetcher = vi.fn(async (area: string) => {
      if (area === '서울') {
        return [createStore({ area, storeCode: '2301', storeName: '강변점', address: '서울 광진구 광나루로 56길 85' })];
      }

      return [
        createStore({ area, storeCode: '2415', storeName: '안산점' }),
        createStore({ area, storeCode: '24151', storeName: '토이저러스 안산점', brandVariant: 'toysrus' }),
      ];
    });

    const stores = await fetchKeywordMatchedStores(
      ['서울', '경기', '인천'],
      '안산 중앙역',
      'lottemart',
      1,
      fetcher,
    );

    expect(stores.map((store) => store.storeCode)).toEqual(['2415']);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('조건을 못 채우면 끝까지 순차 조회한다', async () => {
    const fetcher = vi.fn(async (area: string) => [createStore({ area, storeCode: area, storeName: `${area}점`, address: `${area} 어딘가` })]);

    const stores = await fetchKeywordMatchedStores(['서울', '경기'], '없는 키워드', '', 2, fetcher);

    expect(stores).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
