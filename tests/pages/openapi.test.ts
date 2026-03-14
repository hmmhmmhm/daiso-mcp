/**
 * OpenAPI 페이지 테스트
 */

import { describe, it, expect } from 'vitest';
import {
  generateOpenApiSpec,
  generateFullOpenApiSpec,
  createFullOpenApiJsonResponse,
  createFullOpenApiYamlResponse,
  createOpenApiJsonResponse,
  createOpenApiYamlResponse,
  __testOnlyJsonToYaml,
} from '../../src/pages/openapi.js';

describe('OpenAPI 페이지', () => {
  it('OpenAI Actions용 OpenAPI 스펙 객체를 생성한다', () => {
    const spec = generateOpenApiSpec('https://example.com') as {
      openapi: string;
      servers: Array<{ url: string }>;
      paths: Record<
        string,
        {
          get: {
            parameters: Array<{ name: string; description?: string }>;
          };
        }
      >;
    };

    expect(spec.openapi).toBe('3.1.0');
    expect(spec.servers[0].url).toBe('https://example.com');
    expect(spec.paths['/api/actions/query']).toBeDefined();
    expect(spec.paths['/api/daiso/products']).toBeUndefined();
    expect(
      (spec as { info: { description: string } }).info.description,
    ).toContain('브랜드명이 요청 앞부분에 나오면 뒤의 상품/재고 요청까지 같은 브랜드로 해석');
    expect(
      spec.paths['/api/actions/query'].get.parameters.find(
        (parameter) => parameter.name === 'action',
      )?.description?.length,
    ).toBeLessThan(700);
    expect(
      spec.paths['/api/actions/query'].get.parameters.some(
        (parameter) => parameter.name === 'itemCode',
      ),
    ).toBe(true);
  });

  it('전체 OpenAPI 스펙 객체를 생성한다', () => {
    const spec = generateFullOpenApiSpec('https://example.com') as {
      openapi: string;
      servers: Array<{ url: string }>;
      paths: Record<string, unknown>;
    };

    expect(spec.openapi).toBe('3.1.0');
    expect(spec.servers[0].url).toBe('https://example.com');
    expect(spec.paths['/api/daiso/products']).toBeDefined();
    expect(spec.paths['/api/daiso/display-location']).toBeDefined();
    expect(
      (
        spec.paths['/api/daiso/stores'] as {
          get: { description: string };
        }
      ).get.description,
    ).toContain('storeCode는 /api/daiso/inventory 응답에서 확인');
    expect(
      (
        spec.paths['/api/daiso/inventory'] as {
          get: { description: string };
        }
      ).get.description,
    ).toContain('storeCode 없이 productId만으로 호출할 수');
    expect(spec.paths['/api/oliveyoung/stores']).toBeDefined();
    expect(spec.paths['/api/cu/stores']).toBeDefined();
    expect(spec.paths['/api/cu/inventory']).toBeDefined();
    expect(spec.paths['/api/emart24/stores']).toBeDefined();
    expect(spec.paths['/api/emart24/products']).toBeDefined();
    expect(spec.paths['/api/emart24/inventory']).toBeDefined();
    expect(spec.paths['/api/lottemart/stores']).toBeDefined();
    expect(spec.paths['/api/lottemart/products']).toBeDefined();
    expect(spec.paths['/api/gs25/stores']).toBeDefined();
    expect(spec.paths['/api/gs25/products']).toBeDefined();
    expect(spec.paths['/api/gs25/inventory']).toBeDefined();
    expect(
      ((spec.paths['/api/gs25/inventory'] as { get: { parameters: Array<{ name: string }> } }).get.parameters).some(
        (parameter) => parameter.name === 'itemCode',
      ),
    ).toBe(true);
    expect(spec.paths['/api/seveneleven/products']).toBeDefined();
    expect(spec.paths['/api/seveneleven/stores']).toBeDefined();
    expect(spec.paths['/api/seveneleven/inventory']).toBeDefined();
    expect(spec.paths['/api/seveneleven/popwords']).toBeDefined();
    expect(spec.paths['/api/seveneleven/catalog']).toBeDefined();
    expect(spec.paths['/api/megabox/theaters']).toBeDefined();
    expect(spec.paths['/api/megabox/movies']).toBeDefined();
    expect(spec.paths['/api/megabox/seats']).toBeDefined();
    expect(spec.paths['/api/lottecinema/theaters']).toBeDefined();
    expect(spec.paths['/api/lottecinema/movies']).toBeDefined();
    expect(spec.paths['/api/lottecinema/seats']).toBeDefined();
    expect(spec.paths['/api/cgv/theaters']).toBeDefined();
    expect(spec.paths['/api/cgv/movies']).toBeDefined();
    expect(spec.paths['/api/cgv/timetable']).toBeDefined();
  });

  it('OpenAPI JSON 응답을 생성한다', async () => {
    const response = createOpenApiJsonResponse('https://example.com');

    expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600');

    const body = await response.json();
    expect(body.openapi).toBe('3.1.0');
  });

  it('OpenAPI YAML 응답을 생성한다', async () => {
    const response = createOpenApiYamlResponse('https://example.com');

    expect(response.headers.get('Content-Type')).toBe('text/yaml; charset=utf-8');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');

    const body = await response.text();
    expect(body).toContain('openapi: 3.1.0');
    expect(body).toContain('servers:');
    expect(body).toContain('paths:');
    expect(body).toContain('description: |');
  });

  it('전체 OpenAPI JSON/YAML 응답을 생성한다', async () => {
    const jsonResponse = createFullOpenApiJsonResponse('https://example.com');
    const yamlResponse = createFullOpenApiYamlResponse('https://example.com');

    const jsonBody = await jsonResponse.json();
    const yamlBody = await yamlResponse.text();

    expect(jsonBody.paths['/api/daiso/products']).toBeDefined();
    expect(yamlBody).toContain('/api/daiso/products');
  });

  it('jsonToYaml 보조 함수의 예외 분기를 처리한다', () => {
    expect(__testOnlyJsonToYaml(null)).toBe('null');
    expect(__testOnlyJsonToYaml(123n)).toBe('123');
    expect(__testOnlyJsonToYaml([])).toBe('[]');
    expect(__testOnlyJsonToYaml({})).toBe('{}');
    expect(__testOnlyJsonToYaml('a:b')).toBe('"a:b"');
  });
});
