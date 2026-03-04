/**
 * OpenAPI 페이지 테스트
 */

import { describe, it, expect } from 'vitest';
import {
  generateOpenApiSpec,
  createOpenApiJsonResponse,
  createOpenApiYamlResponse,
  __testOnlyJsonToYaml,
} from '../../src/pages/openapi.js';

describe('OpenAPI 페이지', () => {
  it('OpenAPI 스펙 객체를 생성한다', () => {
    const spec = generateOpenApiSpec('https://example.com') as {
      openapi: string;
      servers: Array<{ url: string }>;
      paths: Record<string, unknown>;
    };

    expect(spec.openapi).toBe('3.1.0');
    expect(spec.servers[0].url).toBe('https://example.com');
    expect(spec.paths['/api/daiso/products']).toBeDefined();
    expect(spec.paths['/api/oliveyoung/stores']).toBeDefined();
    expect(spec.paths['/api/megabox/theaters']).toBeDefined();
    expect(spec.paths['/api/megabox/movies']).toBeDefined();
    expect(spec.paths['/api/megabox/seats']).toBeDefined();
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

  it('jsonToYaml 보조 함수의 예외 분기를 처리한다', () => {
    expect(__testOnlyJsonToYaml(null)).toBe('null');
    expect(__testOnlyJsonToYaml(123n)).toBe('123');
    expect(__testOnlyJsonToYaml([])).toBe('[]');
    expect(__testOnlyJsonToYaml({})).toBe('{}');
    expect(__testOnlyJsonToYaml('a:b')).toBe('"a:b"');
  });
});
