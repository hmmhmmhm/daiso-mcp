/**
 * 다이소 API 헬퍼 함수 테스트
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getImageUrl, formatTime, DAISOMALL_API, DAISO_WEB_API } from '../../../src/services/daiso/api.js';

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it('img.daisomall.co.kr 절대 URL을 CDN 도메인으로 변환한다', () => {
    expect(getImageUrl('https://img.daisomall.co.kr/images/product/123.jpg')).toBe(
      'https://cdn.daisomall.co.kr/images/product/123.jpg',
    );
  });

  it('파싱할 수 없는 절대 URL 형태는 원문을 반환한다', () => {
    expect(getImageUrl('https://%')).toBe('https://%');
  });
});

describe('formatTime', () => {
  it('4자리 시간 문자열을 HH:MM 형식으로 변환한다', () => {
    expect(formatTime('0900')).toBe('09:00');
    expect(formatTime('1430')).toBe('14:30');
  });

  it('4자리가 아니면 원문을 반환한다', () => {
    expect(formatTime('휴무')).toBe('휴무');
  });
});

describe('API 상수', () => {
  describe('DAISOMALL_API', () => {
    it('필수 엔드포인트가 정의되어 있다', () => {
      expect(DAISOMALL_API.SEARCH_PRODUCTS).toBeDefined();
      expect(DAISOMALL_API.ONLINE_STOCK).toBeDefined();
      expect(DAISOMALL_API.STORE_INVENTORY).toBeDefined();
      expect(DAISOMALL_API.STORE_SEARCH_V2).toBeDefined();
      expect(DAISOMALL_API.STORE_INVENTORY_V2).toBeDefined();
      expect(DAISOMALL_API.AUTH_REQUEST).toBeDefined();
      expect(DAISOMALL_API.IMAGE_BASE_URL).toBeDefined();
    });

    it('올바른 도메인을 사용한다', () => {
      expect(DAISOMALL_API.SEARCH_PRODUCTS).toContain('daisomall.co.kr');
      expect(DAISOMALL_API.STORE_SEARCH_V2).toContain('fapi.daisomall.co.kr');
      expect(DAISOMALL_API.STORE_INVENTORY_V2).toContain('fapi.daisomall.co.kr');
      expect(DAISOMALL_API.IMAGE_BASE_URL).toContain('cdn.daisomall.co.kr');
    });
  });

  describe('DAISO_WEB_API', () => {
    it('필수 엔드포인트가 정의되어 있다', () => {
      expect(DAISO_WEB_API.SHOP_SEARCH).toBeDefined();
      expect(DAISO_WEB_API.SIDO_SEARCH).toBeDefined();
      expect(DAISO_WEB_API.GUGUN_SEARCH).toBeDefined();
    });
  });
});
