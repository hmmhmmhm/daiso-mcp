/**
 * 다이소 API 헬퍼 함수 테스트
 */
import { describe, it, expect } from 'vitest';
import { getImageUrl, formatTime, DAISOMALL_API, DAISO_WEB_API } from '../../../src/services/daiso/api.js';

describe('getImageUrl', () => {
  it('유효한 경로가 주어지면 전체 URL을 반환한다', () => {
    const path = '/images/product/123.jpg';
    const result = getImageUrl(path);

    expect(result).toBe(`${DAISOMALL_API.IMAGE_BASE_URL}/images/product/123.jpg`);
  });

  it('빈 문자열이 주어지면 undefined를 반환한다', () => {
    expect(getImageUrl('')).toBeUndefined();
  });

  it('undefined가 주어지면 undefined를 반환한다', () => {
    expect(getImageUrl(undefined)).toBeUndefined();
  });

  it('경로가 슬래시로 시작하지 않아도 처리한다', () => {
    const path = 'images/product/123.jpg';
    const result = getImageUrl(path);

    expect(result).toBe(`${DAISOMALL_API.IMAGE_BASE_URL}images/product/123.jpg`);
  });
});

describe('formatTime', () => {
  it('4자리 시간 문자열을 HH:MM 형식으로 변환한다', () => {
    expect(formatTime('0900')).toBe('09:00');
    expect(formatTime('1430')).toBe('14:30');
    expect(formatTime('2359')).toBe('23:59');
    expect(formatTime('0000')).toBe('00:00');
  });

  it('4자리가 아닌 문자열은 그대로 반환한다', () => {
    // 5자리 (콜론 포함)
    expect(formatTime('09:00')).toBe('09:00');
    // 3자리
    expect(formatTime('900')).toBe('900');
    // 5자리
    expect(formatTime('09000')).toBe('09000');
    // 빈 문자열
    expect(formatTime('')).toBe('');
  });

  it('4자리 문자열에 콜론이 있으면 변환된다 (주의: 예상치 못한 동작)', () => {
    // '9:00'은 4자리이므로 변환 로직이 적용됨
    expect(formatTime('9:00')).toBe('9::00');
  });
});

describe('API 상수', () => {
  describe('DAISOMALL_API', () => {
    it('필수 엔드포인트가 정의되어 있다', () => {
      expect(DAISOMALL_API.SEARCH_PRODUCTS).toBeDefined();
      expect(DAISOMALL_API.ONLINE_STOCK).toBeDefined();
      expect(DAISOMALL_API.STORE_INVENTORY).toBeDefined();
      expect(DAISOMALL_API.IMAGE_BASE_URL).toBeDefined();
    });

    it('올바른 도메인을 사용한다', () => {
      expect(DAISOMALL_API.SEARCH_PRODUCTS).toContain('daisomall.co.kr');
      expect(DAISOMALL_API.IMAGE_BASE_URL).toContain('img.daisomall.co.kr');
    });
  });

  describe('DAISO_WEB_API', () => {
    it('필수 엔드포인트가 정의되어 있다', () => {
      expect(DAISO_WEB_API.SHOP_SEARCH).toBeDefined();
      expect(DAISO_WEB_API.SIDO_SEARCH).toBeDefined();
      expect(DAISO_WEB_API.GUGUN_SEARCH).toBeDefined();
    });

    it('올바른 도메인을 사용한다', () => {
      expect(DAISO_WEB_API.SHOP_SEARCH).toContain('daiso.co.kr');
    });
  });
});
