/**
 * 액션 프록시 URL 해석 테스트
 */

import { describe, expect, it } from 'vitest';
import {
  ACTION_QUERY_ACTIONS,
  buildActionQueryTargetUrl,
  getActionQueryDefinition,
} from '../../src/api/actionsProxy.js';

describe('actionsProxy', () => {
  it('액션 정의를 조회할 수 있다', () => {
    expect(getActionQueryDefinition('lottemartFindStores')?.targetPath).toBe('/api/lottemart/stores');
    expect(ACTION_QUERY_ACTIONS).toContain('daisoGetProduct');
  });

  it('일반 GET 액션을 대상 URL로 변환한다', () => {
    const target = buildActionQueryTargetUrl(
      'https://example.com/api/actions/query?action=lottemartFindStores&area=%EC%84%9C%EC%9A%B8&keyword=%EA%B0%95%EB%B3%80',
    );

    expect(target.pathname).toBe('/api/lottemart/stores');
    expect(target.searchParams.get('action')).toBeNull();
    expect(target.searchParams.get('area')).toBe('서울');
    expect(target.searchParams.get('keyword')).toBe('강변');
  });

  it('상대 경로 요청도 대상 URL로 변환한다', () => {
    const target = buildActionQueryTargetUrl(
      '/api/actions/query?action=lottemartFindStores&area=%EC%84%9C%EC%9A%B8',
    );

    expect(target.pathname).toBe('/api/lottemart/stores');
    expect(target.searchParams.get('area')).toBe('서울');
  });

  it('path 파라미터가 필요한 액션은 경로에 주입한다', () => {
    const target = buildActionQueryTargetUrl(
      'https://example.com/api/actions/query?action=daisoGetProduct&productId=12%2034&page=2',
    );

    expect(target.pathname).toBe('/api/daiso/products/12%2034');
    expect(target.searchParams.get('productId')).toBeNull();
    expect(target.searchParams.get('page')).toBe('2');
  });

  it('action이 없으면 에러를 던진다', () => {
    expect(() =>
      buildActionQueryTargetUrl('https://example.com/api/actions/query?keyword=%ED%85%8C%EC%8A%A4%ED%8A%B8'),
    ).toThrow('action 파라미터를 입력해주세요.');
  });

  it('지원하지 않는 action이면 에러를 던진다', () => {
    expect(() =>
      buildActionQueryTargetUrl('https://example.com/api/actions/query?action=unknownAction'),
    ).toThrow('지원하지 않는 action 입니다: unknownAction');
  });

  it('path 파라미터가 비어 있으면 에러를 던진다', () => {
    expect(() =>
      buildActionQueryTargetUrl('https://example.com/api/actions/query?action=daisoGetProduct'),
    ).toThrow('productId 파라미터를 입력해주세요.');
  });
});
