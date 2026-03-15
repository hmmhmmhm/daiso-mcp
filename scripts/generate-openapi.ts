#!/usr/bin/env node

import { writeFile } from 'node:fs/promises';

const DEFAULT_BASE_URL = 'https://mcp.aka.page';

async function main() {
  const baseUrl = process.env.OPENAPI_BASE_URL || DEFAULT_BASE_URL;

  const openapiModule = await import('../dist/pages/openapi.js');
  const spec = openapiModule.generateOpenApiSpec(baseUrl);

  const jsonResponse = openapiModule.createOpenApiJsonResponse(baseUrl);
  const yamlResponse = openapiModule.createOpenApiYamlResponse(baseUrl);

  const jsonText = await jsonResponse.text();
  const yamlText = await yamlResponse.text();

  await Promise.all([
    writeFile('openapi.json', jsonText + '\n', 'utf8'),
    writeFile('openapi.yaml', yamlText + '\n', 'utf8'),
  ]);

  console.log(`OpenAPI generated for ${baseUrl} (${Object.keys(spec).length} top-level keys)`);
}

main().catch((error) => {
  console.error('OpenAPI 생성 실패:', error);
  process.exit(1);
});
