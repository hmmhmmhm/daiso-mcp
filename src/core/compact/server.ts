/** 공개 SDK API로 구형 호출을 유지하고 공개 목록은 10개로 고정합니다. */
import * as z from 'zod';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServiceRegistry } from '../registry.js';
import { createToolOutputSchema } from '../outputSchema.js';
import { COMPACT_CATALOG, PUBLIC_TOOL_NAMES } from './catalog.js';
import { createCompactTools } from './tools.js';

export function applyCompactTools(server: McpServer, registry: ServiceRegistry): void {
  const legacy = registry.getAllTools();
  const compact = createCompactTools(legacy);
  const replacements = new Map(
    COMPACT_CATALOG.flatMap((group) =>
      group.routes.map((route) => [route.legacy, group.name] as const),
    ),
  );
  const hidden = legacy
    .filter((tool) => !PUBLIC_TOOL_NAMES.includes(tool.name))
    .map((tool) => {
      const replacement = replacements.get(tool.name)!;
      return {
        ...tool,
        metadata: {
          ...tool.metadata,
          description: `[Deprecated] ${replacement}를 사용하세요. ${tool.metadata.description}`,
          _meta: { deprecated: true, replacement },
        },
        handler: async (args: unknown) => {
          const result = await tool.handler(args);
          return { ...result, _meta: { ...result._meta, deprecated: true, replacement } };
        },
      };
    });
  registry.applyToServer(server, [...hidden, ...compact]);
  const tools = compact.map((tool) => ({
    name: tool.name,
    title: tool.metadata.title,
    description: tool.metadata.description,
    inputSchema: z.toJSONSchema(z.object(tool.metadata.inputSchema).strict(), {
      io: 'input',
      target: 'draft-7',
    }) as { type: 'object' },
    outputSchema: z.toJSONSchema(createToolOutputSchema(tool.name, tool.metadata.outputSchema), {
      io: 'output',
      target: 'draft-7',
    }) as { type: 'object' },
  }));
  server.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools }));
}
