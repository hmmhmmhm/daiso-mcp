import { describe, expect, it, vi } from 'vitest';
import * as z from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ServiceRegistry } from '../../../src/core/registry.js';
import { COMPACT_CATALOG, PUBLIC_TOOL_NAMES } from '../../../src/core/compact/catalog.js';
import { applyCompactTools } from '../../../src/core/compact/server.js';

describe('실제 MCP 프로토콜 10개 목록과 deprecated 호환', () => {
  it('SDK 검증을 거쳐 신형과 구형을 모두 실행하고 목록에는10개만 표시한다', async () => {
    const registry = new ServiceRegistry();
    const response = {
      content: [
        { type: 'text' as const, text: JSON.stringify({ product: { id: '123' }, quantity: null }) },
      ],
    };
    const handler = vi.fn(async () => response);
    registry.register(() => ({
      metadata: { id: 'all', name: 'all', version: '1' },
      getTools: () =>
        COMPACT_CATALOG.flatMap((g) =>
          g.routes.map((r) => ({
            name: r.legacy,
            metadata: {
              title: r.legacy,
              description: r.legacy,
              inputSchema: { query: z.string(), page: z.number().default(1) },
            },
            handler,
          })),
        ),
    }));
    const server = new McpServer({ name: 'compact-test', version: '1' });
    applyCompactTools(server, registry);
    const client = new Client({ name: 'test', version: '1' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    await client.connect(b);
    try {
      const list = await client.listTools();
      expect(list.tools.map((t) => t.name)).toEqual([...PUBLIC_TOOL_NAMES]);
      expect(list.nextCursor).toBeUndefined();
      expect(list.tools.every((t) => t.inputSchema.type === 'object')).toBe(true);
      const modern = await client.callTool({
        name: 'search_products',
        arguments: { service: 'daiso', query: '테ープ' },
      });
      const old = await client.callTool({
        name: 'daiso_search_products',
        arguments: { query: 'テープ' },
      });
      expect(modern.isError).not.toBe(true);
      expect(old.isError).not.toBe(true);
      expect(old.content).toEqual(modern.content);
      expect(old.structuredContent).toEqual(modern.structuredContent);
      expect(old._meta).toMatchObject({ deprecated: true, replacement: 'search_products' });
      expect(handler).toHaveBeenCalledWith({ query: 'テープ', page: 1 });
      const bad = await client.callTool({
        name: 'search_products',
        arguments: { service: 'daiso' },
      });
      expect(bad.isError).toBe(true);
      const legacyBad = await client.callTool({
        name: 'daiso_search_products',
        arguments: { query: 1 },
      });
      expect(legacyBad.isError).toBe(true);
      const typo = await client.callTool({
        name: 'search_products',
        arguments: { service: 'daiso', query: 'x', typo: true },
      });
      expect(typo.isError).toBe(true);
      expect(handler).toHaveBeenCalledTimes(2);
      handler.mockResolvedValueOnce({
        isError: true,
        content: [{ type: 'text', text: 'unavailable' }],
      } as typeof response);
      const legacyError = await client.callTool({
        name: 'daiso_search_products',
        arguments: { query: 'x' },
      });
      expect(legacyError.isError).toBe(true);
      expect(legacyError._meta).toMatchObject({ deprecated: true });
      handler.mockRejectedValueOnce(new Error('upstream failure'));
      expect(
        (
          await client.callTool({
            name: 'search_products',
            arguments: { service: 'daiso', query: 'x' },
          })
        ).isError,
      ).toBe(true);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
