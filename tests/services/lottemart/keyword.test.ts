import { describe, expect, it } from 'vitest';
import { buildLotteMartKeywordVariants } from '../../../src/services/lottemart/keyword.js';

describe('buildLotteMartKeywordVariants', () => {
  it('빈 키워드는 빈 배열을 반환한다', () => {
    expect(buildLotteMartKeywordVariants('   ')).toEqual([]);
  });

  it('다중 토큰 키워드는 첫 위치 토큰 위주로 보정한다', () => {
    expect(buildLotteMartKeywordVariants('안산 중앙역 주변 롯데마트')).toEqual([
      '안산 중앙역 주변 롯데마트',
      '안산중앙역주변롯데마트',
      '안산중앙역',
      '안산',
    ]);
  });

  it('역 한 글자처럼 축약 불가능한 입력도 유지한다', () => {
    expect(buildLotteMartKeywordVariants('역')).toEqual(['역']);
  });

  it('잡음어만 있는 입력은 의미 있는 후보만 남긴다', () => {
    expect(buildLotteMartKeywordVariants('주변 롯데마트')).toEqual([
      '주변 롯데마트',
      '주변롯데마트',
    ]);
  });
});
