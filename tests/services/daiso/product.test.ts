/**
 * 다이소 상품 매핑 유틸리티 테스트
 */

import { describe, expect, it } from 'vitest';
import { toProductSummary } from '../../../src/services/daiso/product.js';

describe('toProductSummary', () => {
  it('기본 상품 필드를 요약 정보로 변환한다', () => {
    const result = toProductSummary({
      PD_NO: '12345',
      PDNM: '테스트상품',
      EXH_PD_NM: '대체상품명',
      PD_PRC: '1000',
      ATCH_FILE_URL: '/images/test.jpg',
      BRND_NM: '다이소',
      SOLD_OUT_YN: 'N',
      NEW_PD_YN: 'Y',
    });

    expect(result).toEqual({
      id: '12345',
      name: '테스트상품',
      imageUrl: expect.stringContaining('/images/test.jpg'),
      brand: '다이소',
      soldOut: false,
      isNew: true,
    });
  });

  it('PDNM이 비면 EXH_PD_NM을 사용한다', () => {
    const result = toProductSummary({
      PD_NO: '67890',
      PDNM: '',
      EXH_PD_NM: '전시상품명',
      PD_PRC: '2000',
      SOLD_OUT_YN: 'Y',
      NEW_PD_YN: 'N',
    });

    expect(result).toEqual({
      id: '67890',
      name: '전시상품명',
      imageUrl: undefined,
      brand: undefined,
      soldOut: true,
      isNew: false,
    });
  });

  it('이름과 브랜드가 없으면 빈 문자열과 undefined를 사용한다', () => {
    const result = toProductSummary({
      PD_NO: '99999',
      PDNM: '',
      EXH_PD_NM: '',
      PD_PRC: '3000',
      BRND_NM: '',
      SOLD_OUT_YN: 'N',
      NEW_PD_YN: 'N',
    });

    expect(result).toEqual({
      id: '99999',
      name: '',
      imageUrl: undefined,
      brand: undefined,
      soldOut: false,
      isNew: false,
    });
  });
});
