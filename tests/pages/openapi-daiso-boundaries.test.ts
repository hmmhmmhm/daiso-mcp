import { describe, expect, it } from 'vitest';
import { OPENAPI_PATHS_DAISO } from '../../src/pages/openapiSpecPathsDaiso.js';

describe('다이소 공개 입력 계약', () => {
  it('좌표 범위와 두 값 동시 생략 기본값을 설명하고 개별 기본값은 주입하지 않는다', () => {
    const params = OPENAPI_PATHS_DAISO['/api/daiso/inventory'].get.parameters;
    const lat = params.find((p) => p.name === 'lat')!;
    const lng = params.find((p) => p.name === 'lng')!;
    expect(lat.schema).toMatchObject({ minimum: -90, maximum: 90 });
    expect(lng.schema).toMatchObject({ minimum: -180, maximum: 180 });
    expect(lat.schema).not.toHaveProperty('default');
    expect(lng.schema).not.toHaveProperty('default');
    expect(lat.description).toContain('함께');
    expect(lng.description).toContain('함께');
  });

  it('페이지와 매장 개수는 양의 정수이며 구현에 없는 100 상한을 광고하지 않는다', () => {
    for (const path of ['/api/daiso/products', '/api/daiso/stores', '/api/daiso/inventory'] as const) {
      for (const param of OPENAPI_PATHS_DAISO[path].get.parameters) {
        if (!['page', 'pageSize', 'limit'].includes(param.name)) continue;
        expect(param.schema).toMatchObject({ type: 'integer', minimum: 1 });
        expect(param.schema).not.toHaveProperty('maximum');
      }
    }
  });
});
