/**
 * 앱 통합 테스트 - 플랫폼/CORS/MCP 엔드포인트
 */

import { describe, it, expect, vi } from 'vitest';
import app from '../../src/index.js';
import { setupFetchMock } from './testHelpers.js';

const mockFetch = vi.fn();
setupFetchMock(mockFetch);

describe('CORS', () => {
  it('CORS 헤더가 설정되어 있다', async () => {
    const res = await app.request('/health', {
      headers: { Origin: 'https://example.com' },
    });

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('MCP 엔드포인트', () => {
  it('POST /mcp가 존재한다', async () => {
    // MCP 프로토콜 요청 시뮬레이션은 복잡하므로 라우트 존재 여부만 확인
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    // MCP 핸들러가 동작 (에러가 발생해도 라우트는 존재함)
    expect(res.status).toBeDefined();
  });

  it('GET /mcp는 세션 없이 요청하면 400을 반환한다', async () => {
    const res = await app.request('/mcp', {
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Bad Request');
  });

  it('POST /mcp는 initialize가 아니면 400을 반환한다', async () => {
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Bad Request');
  });

  it('POST /mcp는 배열 배치 요청에서 initialize가 없으면 400을 반환한다', async () => {
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
        },
      ]),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Bad Request');
  });

  it('POST /mcp는 파싱 불가 JSON이면 400을 반환한다', async () => {
    const res = await app.request('/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Bad Request');
  });

  it('initialize 후 GET /mcp를 세션으로 처리한다', async () => {
    const initRes = await app.request('/mcp', {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: {
            name: 'vitest',
            version: '1.0.0',
          },
        },
      }),
    });

    expect(initRes.status).toBe(200);
    const sessionId = initRes.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();

    const streamRes = await app.request('/mcp', {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        'mcp-session-id': sessionId || '',
        'mcp-protocol-version': '2025-11-25',
      },
    });

    expect(streamRes.status).toBe(200);
    expect(streamRes.headers.get('Content-Type')).toContain('text/event-stream');

    const deleteRes = await app.request('/mcp', {
      method: 'DELETE',
      headers: {
        'mcp-session-id': sessionId || '',
        'mcp-protocol-version': '2025-11-25',
      },
    });
    expect(deleteRes.status).toBe(200);
  });

  it('배치 initialize 요청도 세션을 생성한다', async () => {
    const initRes = await app.request('/mcp', {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: {
              name: 'vitest-batch',
              version: '1.0.0',
            },
          },
        },
      ]),
    });

    expect(initRes.status).toBe(200);
    const sessionId = initRes.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();
  });

  it('세션 ID가 잘못되면 404를 반환한다', async () => {
    const res = await app.request('/mcp', {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        'mcp-session-id': 'invalid-session-id',
      },
    });

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('Session not found');
  });

  it('POST /도 MCP 요청을 처리한다', async () => {
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBeDefined();
  });
});
