import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import type { ServiceProvider } from '../../src/core/interfaces.js';
import { ServiceRegistry } from '../../src/core/registry.js';
import type { ToolRegistration } from '../../src/core/types.js';

function createService(tool: ToolRegistration): ServiceProvider {
  return {
    metadata: {
      id: 'contract-test',
      name: 'Contract Test',
      version: '1.0.0',
    },
    getTools: () => [tool],
  };
}

async function callRegisteredTool(tool: ToolRegistration) {
  const registry = new ServiceRegistry();
  registry.register(() => createService(tool));

  const server = new McpServer({
    name: 'registry-contract-server',
    version: '1.0.0',
  });
  const client = new Client({
    name: 'registry-contract-client',
    version: '1.0.0',
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  registry.applyToServer(server);

  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return await client.callTool({
      name: tool.name,
      arguments: {},
    });
  } finally {
    await client.close();
    await server.close();
  }
}

describe('ServiceRegistry MCP SDK 오류 계약', () => {
  it('성공 출력 스키마가 있어도 예외 오류를 -32602 없이 전달한다', async () => {
    const result = await callRegisteredTool({
      name: 'contract_error_tool',
      metadata: {
        title: 'Contract Error Tool',
        description: 'MCP 오류 계약을 검증한다.',
        inputSchema: {},
        outputSchema: { value: z.string() },
      },
      handler: async () => {
        throw new Error('upstream failed');
      },
    });

    expect(result).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: 'upstream failed' }],
    });
    expect(result).not.toHaveProperty('structuredContent');
  });

  it('정상 결과에는 성공 출력 스키마에 맞는 structuredContent를 유지한다', async () => {
    const result = await callRegisteredTool({
      name: 'contract_success_tool',
      metadata: {
        title: 'Contract Success Tool',
        description: 'MCP 성공 계약을 검증한다.',
        inputSchema: {},
        outputSchema: { value: z.string() },
      },
      handler: async () => ({
        content: [{ type: 'text', text: '{"value":"ok"}' }],
      }),
    });

    expect(result).toMatchObject({
      content: [{ type: 'text', text: '{"value":"ok"}' }],
      structuredContent: { value: 'ok' },
    });
    expect(result).not.toHaveProperty('isError');
  });
});
