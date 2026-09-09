import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import { ServiceRegistry } from '../../../src/core/registry.js';
import { createFeedbackService } from '../../../src/services/feedback/index.js';

describe('개발자 요청 JSON Schema 호환성', () => {
  it('실제 tools/list에서 Home Assistant가 거부하는 propertyNames를 내보내지 않는다', async () => {
    const server = new McpServer({ name: 'schema-server', version: '1.0.0' });
    const client = new Client({ name: 'schema-client', version: '1.0.0' });
    const registry = new ServiceRegistry();
    registry.register(createFeedbackService);
    registry.applyToServer(server);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
      const { tools } = await client.listTools();
      const schema = tools.find((tool) => tool.name === 'submit_developer_request')?.inputSchema;
      expect(schema).toBeDefined();
      // HA 2026.9.0b0의 probatio 0.11.2는 재귀 참조를 지원하지만 propertyNames는 거부한다.
      expect(JSON.stringify(schema)).not.toContain('"propertyNames"');
      expect(schema?.properties?.userContext).toMatchObject({
        type: 'object',
        additionalProperties: { $ref: expect.stringMatching(/^#\/definitions\//) },
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('임의 키와 중첩 JSON 값을 그대로 보존한다', () => {
    const tool = createFeedbackService().getTools()[0];
    const schema = z.object(tool.metadata.inputSchema);
    const userContext = {
      '': [{ nested: [null, true, false, 2, 1.5, 'text', {}, []] }],
      '한글 키': { child: { value: 'preserved' } },
    };
    expect(schema.parse({ title: '제목', description: '설명', userContext }).userContext).toEqual(
      userContext,
    );
  });

  it.each([undefined, () => 'value', Symbol('value'), 1n, NaN, Infinity, new Date()])(
    '중첩된 비 JSON 값 %s를 거부한다',
    (value) => {
      const tool = createFeedbackService().getTools()[0];
      const schema = z.object(tool.metadata.inputSchema);
      expect(
        schema.safeParse({ title: '제목', description: '설명', userContext: { nested: { value } } })
          .success,
      ).toBe(false);
    },
  );
});
