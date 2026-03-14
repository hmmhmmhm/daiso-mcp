/**
 * OpenAPI 응답 생성 모듈
 */

import { generateOpenApiSpec } from './openapiSpec.js';
import { generateFullOpenApiSpec } from './openapiFullSpec.js';
import { jsonToYaml } from './openapiYaml.js';

/**
 * OpenAPI 스펙 응답 생성 (JSON)
 */
export function createOpenApiJsonResponse(baseUrl: string): Response {
  const spec = generateOpenApiSpec(baseUrl);

  return new Response(JSON.stringify(spec, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * OpenAPI 스펙 응답 생성 (YAML)
 */
export function createOpenApiYamlResponse(baseUrl: string): Response {
  const spec = generateOpenApiSpec(baseUrl);
  const yaml = jsonToYaml(spec);

  return new Response(yaml, {
    headers: {
      'Content-Type': 'text/yaml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * 전체 OpenAPI 스펙 응답 생성 (JSON)
 */
export function createFullOpenApiJsonResponse(baseUrl: string): Response {
  const spec = generateFullOpenApiSpec(baseUrl);

  return new Response(JSON.stringify(spec, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * 전체 OpenAPI 스펙 응답 생성 (YAML)
 */
export function createFullOpenApiYamlResponse(baseUrl: string): Response {
  const spec = generateFullOpenApiSpec(baseUrl);
  const yaml = jsonToYaml(spec);

  return new Response(yaml, {
    headers: {
      'Content-Type': 'text/yaml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
