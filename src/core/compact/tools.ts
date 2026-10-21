/** 기존 작업의 검증과 실행을 재사용하는 공개 도구 어댑터입니다. */
import * as z from 'zod';
import { COMPACT_CATALOG, PUBLIC_TOOL_LIMIT, type CompactGroup } from './catalog.js';
import { createToolOutputSchema } from '../outputSchema.js';
import type { ToolRegistration, ToolInputSchema } from '../types.js';

export function assertCompactCoverage(legacy: ToolRegistration[]): void {
  const expected = COMPACT_CATALOG.flatMap((group) => group.routes.map((route) => route.legacy));
  const actual = legacy.map((tool) => tool.name);
  if (
    COMPACT_CATALOG.length !== PUBLIC_TOOL_LIMIT ||
    new Set(expected).size !== expected.length ||
    actual.length !== expected.length ||
    actual.some((name) => !expected.includes(name)) ||
    expected.some((name) => !actual.includes(name))
  ) {
    throw new Error(
      '공개 도구 10개 계약 또는 기존 작업 매핑이 일치하지 않습니다. 도구를 늘리지 말고 기존 작업에 통합하세요.',
    );
  }
}
function withoutDefault(schema: z.ZodType): z.ZodType {
  if (schema instanceof z.ZodDefault) return withoutDefault(schema.removeDefault() as z.ZodType);
  if (schema instanceof z.ZodOptional)
    return withoutDefault(schema.unwrap() as z.ZodType).optional();
  return schema;
}
function mergedInputs(group: CompactGroup, legacy: Map<string, ToolRegistration>): ToolInputSchema {
  const fields = new Map<string, z.ZodType[]>();
  for (const route of group.routes) {
    for (const [key, schema] of Object.entries(legacy.get(route.legacy)!.metadata.inputSchema)) {
      const variants = fields.get(key) ?? [];
      variants.push(withoutDefault(schema));
      fields.set(key, variants);
    }
  }
  const shape: ToolInputSchema = {};
  for (const [key, variants] of fields)
    shape[key] = z.union(variants as [z.ZodType, ...z.ZodType[]]).optional();
  const services = [
    ...new Set(group.routes.flatMap((route) => (route.service ? [route.service] : []))),
  ];
  const operations = [
    ...new Set(group.routes.flatMap((route) => (route.operation ? [route.operation] : []))),
  ];
  if (services.length)
    shape.service = z.enum(services as [string, ...string[]]).describe('조회할 서비스');
  if (operations.length)
    shape.operation = z
      .enum(operations as [string, ...string[]])
      .optional()
      .describe('조회 작업. 같은 서비스에 작업이 여러 개면 필수입니다.');
  return shape;
}
export function createCompactTools(legacyTools: ToolRegistration[]): ToolRegistration[] {
  assertCompactCoverage(legacyTools);
  const legacy = new Map(legacyTools.map((tool) => [tool.name, tool]));
  return COMPACT_CATALOG.map((group) => {
    const single = legacy.get(group.routes[0].legacy)!;
    const inputSchema: ToolInputSchema =
      group.name === 'submit_request'
        ? {
            requestType: z
              .literal('developer')
              .optional()
              .default('developer')
              .describe('현재 지원 유형: developer'),
            request: z.object(single.metadata.inputSchema).strict().describe('제출할 요청 내용'),
          }
        : mergedInputs(group, legacy);
    const outputSchema: ToolInputSchema = {};
    const outputs = group.routes.map((route) => {
      const tool = legacy.get(route.legacy)!;
      return createToolOutputSchema(tool.name, tool.metadata.outputSchema).shape as ToolInputSchema;
    });
    for (const key of new Set(outputs.flatMap((shape) => Object.keys(shape)))) {
      const variants = outputs.map((shape) => shape[key] ?? z.unknown());
      outputSchema[key] = z.union(variants as [z.ZodType, ...z.ZodType[]]).optional();
    }
    return {
      name: group.name,
      strictInput: true,
      metadata: { title: group.title, description: group.description, inputSchema, outputSchema },
      handler: async (args: unknown) => {
        const parsed = z.object(inputSchema).strict().parse(args);
        if (group.name === 'submit_request') return single.handler(parsed.request);
        const { service, operation, ...input } = parsed;
        const matches = group.routes.filter(
          (route) =>
            route.service === service && (operation === undefined || route.operation === operation),
        );
        if (matches.length !== 1)
          throw new Error(
            '지원하는 service/operation 조합을 명시하세요. ' +
              group.routes
                .map((route) => [route.service, route.operation].filter(Boolean).join('/'))
                .join(', '),
          );
        const target = legacy.get(matches[0].legacy)!;
        return target.handler(z.object(target.metadata.inputSchema).strict().parse(input));
      },
    };
  });
}
