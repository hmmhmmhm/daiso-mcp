import { requestOliveyoung } from '../../src/services/oliveyoung/transport.js';
import { afterEach, vi } from 'vitest';
import { ServiceError } from '../../src/core/errors.js';
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

it('표준 서비스 오류의 진단을 성공 스키마 검증 없이 MCP 텍스트로 전달한다', async () => {
  const result = await callRegisteredTool({
    name: 'oliveyoung_search_products',
    metadata: { title: '오류 진단', description: '릴레이 진단', inputSchema: {}, outputSchema: { value: z.string() } },
    handler: async () => { throw new ServiceError('OLIVEYOUNG_RELAY_HTTP_ERROR', '안전한 오류', 503, true, 503); },
  });
  expect(result.isError).toBe(true);
  expect(result).not.toHaveProperty('structuredContent');
  const content = result.content as Array<{ text: string }>;
  expect(JSON.parse(content[0].text)).toMatchObject({
    error: { code: 'OLIVEYOUNG_RELAY_HTTP_ERROR', message: '안전한 오류' },
    diagnostics: { status: 503, upstreamStatus: 503, retryable: true, service: 'oliveyoung', operation: 'search_products' },
  });
});

afterEach(() => vi.unstubAllGlobals());
it.each([429, 502, 503])('실제 릴레이 HTTP %i를 MCP 클라이언트 진단까지 전달한다', async (status) => {
  const fetch = vi.fn().mockResolvedValue(new Response('private-token', { status }));
  vi.stubGlobal('fetch', fetch);
  const result = await callRegisteredTool({
    name: 'oliveyoung_search_products',
    metadata: { title: '릴레이 오류', description: '릴레이 오류 진단', inputSchema: {}, outputSchema: { value: z.string() } },
    handler: async () => {
      await requestOliveyoung('/p', {}, { relayUrl: 'https://private-relay.example', relayToken: 'private-token' });
      return { content: [] };
    },
  });
  expect(result.isError).toBe(true);
  expect(result).not.toHaveProperty('structuredContent');
  const content = result.content as Array<{ text: string }>;
  expect(JSON.parse(content[0].text)).toMatchObject({ diagnostics: { code: 'OLIVEYOUNG_RELAY_HTTP_ERROR', status, upstreamStatus: status, retryable: true } });
  expect(JSON.stringify(result)).not.toContain('private-');
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('consumer-busy 사유와 재시도 시간을 MCP 클라이언트에 전달한다', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429,
    headers: { 'x-relay-quota-reason': 'consumer-busy', 'retry-after': '1' } })));
  const result = await callRegisteredTool({
    name: 'oliveyoung_search_products',
    metadata: { title: '릴레이 오류', description: '릴레이 오류 진단', inputSchema: {} },
    handler: async () => {
      await requestOliveyoung('/p', {}, { relayUrl: 'https://mcp-busy.example', relayToken: 'private-token', timeout: 500 });
      return { content: [] };
    },
  });
  expect(result.isError).toBe(true);
  const content = result.content as Array<{ text: string }>;
  expect(JSON.parse(content[0].text)).toMatchObject({ diagnostics: { status: 429, upstreamStatus: 429, quotaReason: 'consumer-busy', retryAfter: 1 } });
  expect(JSON.stringify(result)).not.toContain('private-');
});
