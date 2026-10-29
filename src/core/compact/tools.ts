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
  if (schema instanceof z.ZodDefault) {
    const inner = withoutDefault(schema.removeDefault() as z.ZodType);
    return schema.description ? inner.describe(schema.description) : inner;
  }
  if (schema instanceof z.ZodOptional)
    return withoutDefault(schema.unwrap() as z.ZodType).optional();
  return schema;
}
function mergedInputs(group: CompactGroup, legacy: Map<string, ToolRegistration>): ToolInputSchema {
  const fields = new Map<string, z.ZodType[]>();
  const descriptions = new Map<string, Set<string>>();
  for (const route of group.routes) {
    for (const [key, schema] of Object.entries(legacy.get(route.legacy)!.metadata.inputSchema)) {
      const variants = fields.get(key) ?? [];
      variants.push(withoutDefault(schema));
      fields.set(key, variants);
      const notes = descriptions.get(key) ?? new Set<string>();
      notes.add(
        `${[route.service, route.operation].filter(Boolean).join('/') || group.name}: ${schema.description || key}`,
      );
      descriptions.set(key, notes);
    }
  }
  const shape: ToolInputSchema = {};
  for (const [key, variants] of fields)
    shape[key] = (
      variants.length === 1 ? variants[0] : z.union(variants as [z.ZodType, ...z.ZodType[]])
    )
      .optional()
      .describe([...descriptions.get(key)!].join(' · '));
  const services = [
    ...new Set(group.routes.flatMap((route) => (route.service ? [route.service] : []))),
  ];
  const operations = [
    ...new Set(group.routes.flatMap((route) => (route.operation ? [route.operation] : []))),
  ];
  if (services.length) {
    const service = z.enum(services as [string, ...string[]]);
    shape.service = group.defaultService
      ? service.optional().describe(`조회할 서비스. 생략하면 ${group.defaultService}`)
      : service.describe('조회할 서비스');
  }
  if (operations.length) {
    const operation = z.enum(operations as [string, ...string[]]);
    // 서비스 없이 작업만으로 호출하던 도구는 작업을 계속 필수로 요구합니다.
    shape.operation = (
      services.length && !group.defaultService ? operation.optional() : operation
    ).describe('조회 작업. 같은 서비스에 작업이 여러 개면 필수입니다.');
  }
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
        const { service = group.defaultService, operation, ...input } = parsed;
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
        // 다이소의 매장 수 조건은 다른 편의점과 같은 storeLimit 이름도 받습니다.
        if (
          group.name === 'check_inventory' &&
          service === 'daiso' &&
          input.storeLimit !== undefined
        ) {
          if (input.pageSize !== undefined && input.pageSize !== input.storeLimit)
            throw new Error('storeLimit과 pageSize는 같은 매장 수를 지정해야 합니다.');
          input.pageSize = input.storeLimit;
          delete input.storeLimit;
        }
        const ignored = Object.keys(input).filter(
          (key) => !Object.hasOwn(target.metadata.inputSchema, key),
        );
        const result = await target.handler(z.object(target.metadata.inputSchema).parse(input));
        if (ignored.length === 0 || result.isError) return result;
        return {
          ...result,
          _meta: { ...result._meta, ignoredArguments: ignored },
          content: [
            ...result.content,
            {
              type: 'text',
              text: `선택한 서비스/작업에서 지원하지 않는 옵션은 적용하지 않았습니다: ${ignored.join(', ')}. 이 옵션의 조건을 충족했다고 안내하지 마세요.`,
            },
          ],
        };
      },
    };
  });
}
