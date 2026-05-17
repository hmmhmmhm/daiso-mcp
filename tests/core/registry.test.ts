/**
 * ServiceRegistry 테스트
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServiceRegistry } from '../../src/core/registry.js';
import type { ServiceProvider } from '../../src/core/interfaces.js';
import type { ToolRegistration, McpToolResponse } from '../../src/core/types.js';

// 테스트용 mock 서비스 생성
function createMockService(id: string, tools: ToolRegistration[] = []): ServiceProvider {
  return {
    metadata: {
      id,
      name: `${id} Service`,
      version: '1.0.0',
      description: `${id} 테스트 서비스`,
    },
    getTools: () => tools,
  };
}

// initialize/cleanup이 있는 mock 서비스
function createMockServiceWithLifecycle(
  id: string,
  initialize?: () => Promise<void>,
  cleanup?: () => Promise<void>
): ServiceProvider {
  return {
    metadata: {
      id,
      name: `${id} Service`,
      version: '1.0.0',
    },
    getTools: () => [],
    initialize,
    cleanup,
  };
}

// mock 도구 생성
function createMockTool(name: string): ToolRegistration {
  return {
    name,
    metadata: {
      title: `${name} Tool`,
      description: `${name} 도구 설명`,
      inputSchema: {},
    },
    handler: async (): Promise<McpToolResponse> => ({
      content: [{ type: 'text', text: 'test result' }],
    }),
  };
}

function createJsonMockTool(name: string): ToolRegistration {
  return {
    name,
    metadata: {
      title: `${name} Tool`,
      description: `${name} 도구 설명`,
      inputSchema: {},
    },
    handler: async (): Promise<McpToolResponse> => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            products: [{ itemCode: '8801', itemName: '콜라', viewPrice: 1500 }],
            stores: [{ storeCode: 'S1', storeName: '강남점', distanceM: 120 }],
          }),
        },
      ],
    }),
  };
}

function createJsonTextTool(name: string, payload: unknown): ToolRegistration {
  return {
    name,
    metadata: {
      title: `${name} Tool`,
      description: `${name} 도구 설명`,
      inputSchema: {},
    },
    handler: async (): Promise<McpToolResponse> => ({
      content: [{ type: 'text', text: JSON.stringify(payload) }],
    }),
  };
}

describe('ServiceRegistry', () => {
  let registry: ServiceRegistry;

  beforeEach(() => {
    registry = new ServiceRegistry();
  });

  describe('register', () => {
    it('서비스 팩토리를 등록할 수 있다', () => {
      const factory = () => createMockService('test');
      registry.register(factory);

      expect(registry.size).toBe(1);
    });

    it('동일한 ID의 서비스를 중복 등록하면 에러가 발생한다', () => {
      const factory = () => createMockService('test');
      registry.register(factory);

      expect(() => registry.register(factory)).toThrow(
        "서비스 'test'가 이미 등록되어 있습니다."
      );
    });
  });

  describe('registerAll', () => {
    it('여러 서비스를 한 번에 등록할 수 있다', () => {
      const factories = [
        () => createMockService('service1'),
        () => createMockService('service2'),
        () => createMockService('service3'),
      ];

      registry.registerAll(factories);

      expect(registry.size).toBe(3);
    });
  });

  describe('initializeAll', () => {
    it('모든 서비스의 initialize 메서드를 호출한다', async () => {
      const init1 = vi.fn().mockResolvedValue(undefined);
      const init2 = vi.fn().mockResolvedValue(undefined);

      registry.register(() => createMockServiceWithLifecycle('svc1', init1));
      registry.register(() => createMockServiceWithLifecycle('svc2', init2));

      await registry.initializeAll();

      expect(init1).toHaveBeenCalledTimes(1);
      expect(init2).toHaveBeenCalledTimes(1);
    });

    it('initialize가 없는 서비스는 건너뛴다', async () => {
      registry.register(() => createMockService('no-init'));
      registry.register(() => createMockServiceWithLifecycle('with-init', vi.fn().mockResolvedValue(undefined)));

      // 에러 없이 완료되어야 함
      await expect(registry.initializeAll()).resolves.not.toThrow();
    });
  });

  describe('cleanupAll', () => {
    it('모든 서비스의 cleanup 메서드를 호출한다', async () => {
      const cleanup1 = vi.fn().mockResolvedValue(undefined);
      const cleanup2 = vi.fn().mockResolvedValue(undefined);

      registry.register(() => createMockServiceWithLifecycle('svc1', undefined, cleanup1));
      registry.register(() => createMockServiceWithLifecycle('svc2', undefined, cleanup2));

      await registry.cleanupAll();

      expect(cleanup1).toHaveBeenCalledTimes(1);
      expect(cleanup2).toHaveBeenCalledTimes(1);
    });

    it('cleanup이 없는 서비스는 건너뛴다', async () => {
      registry.register(() => createMockService('no-cleanup'));
      registry.register(() => createMockServiceWithLifecycle('with-cleanup', undefined, vi.fn().mockResolvedValue(undefined)));

      await expect(registry.cleanupAll()).resolves.not.toThrow();
    });
  });

  describe('applyToServer', () => {
    it('모든 도구를 MCP 서버에 등록한다', () => {
      const tool1 = createMockTool('tool1');
      const tool2 = createMockTool('tool2');
      const service = createMockService('test', [tool1, tool2]);

      registry.register(() => service);

      // mock MCP server
      const mockServer = {
        registerTool: vi.fn(),
      };

      registry.applyToServer(mockServer as never);

      expect(mockServer.registerTool).toHaveBeenCalledTimes(2);
      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'tool1',
        expect.objectContaining(tool1.metadata),
        expect.any(Function),
      );
      expect(mockServer.registerTool).toHaveBeenCalledWith(
        'tool2',
        expect.objectContaining(tool2.metadata),
        expect.any(Function),
      );
    });

    it('등록된 핸들러가 올바른 형식으로 결과를 반환한다', async () => {
      const tool = createMockTool('test-tool');
      const service = createMockService('test', [tool]);

      registry.register(() => service);

      const mockServer = {
        registerTool: vi.fn(),
      };

      registry.applyToServer(mockServer as never);

      // 등록된 핸들러 가져오기
      const registeredHandler = mockServer.registerTool.mock.calls[0][2];
      const result = await registeredHandler({});

      expect(result).toEqual({
        content: [{ type: 'text', text: 'test result' }],
        structuredContent: { text: 'test result' },
      });
    });

    it('outputSchema가 없는 도구에도 느슨한 기본 스키마를 등록한다', () => {
      const tool = createMockTool('test-tool');
      const service = createMockService('test', [tool]);

      registry.register(() => service);

      const mockServer = {
        registerTool: vi.fn(),
      };

      registry.applyToServer(mockServer as never);

      const metadata = mockServer.registerTool.mock.calls[0][1];
      expect(metadata.outputSchema).toBeDefined();
      expect(typeof metadata.outputSchema.safeParse).toBe('function');
      expect(metadata.outputSchema.safeParse({ arbitrary: 'value' }).success).toBe(true);
    });

    it('JSON text 응답을 structuredContent로 승격하고 공통 결과 모델을 덧붙인다', async () => {
      const tool = createJsonMockTool('json-tool');
      registry.register(() => createMockService('test', [tool]));

      const mockServer = {
        registerTool: vi.fn(),
      };

      registry.applyToServer(mockServer as never);
      const registeredHandler = mockServer.registerTool.mock.calls[0][2];

      const result = await registeredHandler({});

      expect(result.structuredContent).toEqual(
        expect.objectContaining({
          products: expect.any(Array),
          stores: expect.any(Array),
          standard: {
            products: [
              expect.objectContaining({
                code: '8801',
                name: '콜라',
                price: 1500,
              }),
            ],
            stores: [
              expect.objectContaining({
                code: 'S1',
                name: '강남점',
                distanceMeters: 120,
              }),
            ],
          },
        }),
      );
    });

    it('영화/극장 컬렉션과 문자열 거리도 공통 결과 모델로 정규화한다', async () => {
      const tool = createJsonTextTool('media-tool', {
        movies: [
          null,
          {
            id: 'M1',
            movieName: '테스트 영화',
            price: '12000',
          },
        ],
        theaters: [
          [],
          {
            id: 'T1',
            theaterName: '강남',
            storeAddress: '서울 강남구',
            distance: '0.2km',
          },
        ],
      });
      registry.register(() => createMockService('test', [tool]));

      const mockServer = {
        registerTool: vi.fn(),
      };

      registry.applyToServer(mockServer as never);
      const registeredHandler = mockServer.registerTool.mock.calls[0][2];

      const result = await registeredHandler({});

      expect(result.structuredContent.standard).toEqual({
        movies: [
          expect.objectContaining({
            code: 'M1',
            name: '테스트 영화',
            price: 12000,
          }),
        ],
        theaters: [
          expect.objectContaining({
            code: 'T1',
            name: '강남',
            address: '서울 강남구',
            distanceMeters: 200,
          }),
        ],
      });
    });

    it('컬렉션 없는 JSON 객체는 원본 structuredContent만 반환한다', async () => {
      const tool = createJsonTextTool('plain-json-tool', { ok: true });
      registry.register(() => createMockService('test', [tool]));

      const mockServer = {
        registerTool: vi.fn(),
      };

      registry.applyToServer(mockServer as never);
      const registeredHandler = mockServer.registerTool.mock.calls[0][2];

      await expect(registeredHandler({})).resolves.toEqual(
        expect.objectContaining({
          structuredContent: { ok: true },
        }),
      );
    });

    it('숫자로 바꿀 수 없는 가격은 null로 정규화한다', async () => {
      const tool = createJsonTextTool('invalid-price-tool', {
        products: [{ itemCode: 'P1', itemName: '상품', viewPrice: 'bad' }],
      });
      registry.register(() => createMockService('test', [tool]));

      const mockServer = {
        registerTool: vi.fn(),
      };

      registry.applyToServer(mockServer as never);
      const registeredHandler = mockServer.registerTool.mock.calls[0][2];

      const result = await registeredHandler({});
      expect(result.structuredContent.standard.products[0].price).toBeNull();
    });

    it('JSON 배열 text 응답은 text 필드로 구조화한다', async () => {
      const tool = createJsonTextTool('array-json-tool', ['not-object']);
      registry.register(() => createMockService('test', [tool]));

      const mockServer = {
        registerTool: vi.fn(),
      };

      registry.applyToServer(mockServer as never);
      const registeredHandler = mockServer.registerTool.mock.calls[0][2];

      await expect(registeredHandler({})).resolves.toEqual(
        expect.objectContaining({
          structuredContent: { text: '["not-object"]' },
        }),
      );
    });

    it('content가 비어 있으면 빈 text structuredContent를 반환한다', async () => {
      const tool: ToolRegistration = {
        ...createMockTool('empty-content-tool'),
        handler: async () => ({ content: [] }),
      };
      registry.register(() => createMockService('test', [tool]));

      const mockServer = {
        registerTool: vi.fn(),
      };

      registry.applyToServer(mockServer as never);
      const registeredHandler = mockServer.registerTool.mock.calls[0][2];

      await expect(registeredHandler({})).resolves.toEqual(
        expect.objectContaining({
          structuredContent: { text: '' },
        }),
      );
    });

    it('핸들러가 isError를 반환하면 MCP 응답에도 유지한다', async () => {
      const tool: ToolRegistration = {
        ...createMockTool('handled-error-tool'),
        handler: async () => ({
          isError: true,
          content: [{ type: 'text', text: 'handled' }],
        }),
      };
      registry.register(() => createMockService('test', [tool]));

      const mockServer = {
        registerTool: vi.fn(),
      };

      registry.applyToServer(mockServer as never);
      const registeredHandler = mockServer.registerTool.mock.calls[0][2];

      await expect(registeredHandler({})).resolves.toEqual(
        expect.objectContaining({
          isError: true,
          structuredContent: { text: 'handled' },
        }),
      );
    });

    it('도구 예외를 표준 MCP 에러 구조로 반환한다', async () => {
      const tool: ToolRegistration = {
        ...createMockTool('error-tool'),
        handler: async () => {
          throw new Error('upstream failed');
        },
      };
      registry.register(() => createMockService('test', [tool]));

      const mockServer = {
        registerTool: vi.fn(),
      };

      registry.applyToServer(mockServer as never);
      const registeredHandler = mockServer.registerTool.mock.calls[0][2];

      const result = await registeredHandler({});

      expect(result).toEqual(
        expect.objectContaining({
          isError: true,
          content: [{ type: 'text', text: 'upstream failed' }],
          structuredContent: {
            error: expect.objectContaining({
              code: 'TOOL_EXECUTION_FAILED',
              message: 'upstream failed',
              operation: 'error-tool',
              retryable: true,
            }),
          },
        }),
      );
    });

    it('문자열 예외도 표준 MCP 에러 구조로 반환한다', async () => {
      const tool: ToolRegistration = {
        ...createMockTool('string-error-tool'),
        handler: async () => {
          throw 'boom';
        },
      };
      registry.register(() => createMockService('test', [tool]));

      const mockServer = {
        registerTool: vi.fn(),
      };

      registry.applyToServer(mockServer as never);
      const registeredHandler = mockServer.registerTool.mock.calls[0][2];

      const result = await registeredHandler({});
      expect(result.structuredContent.error.message).toBe('알 수 없는 오류가 발생했습니다.');
    });
  });

  describe('getServicesInfo', () => {
    it('등록된 서비스 정보 목록을 반환한다', () => {
      const tool = createMockTool('test_tool');
      registry.register(() => createMockService('svc1', [tool]));
      registry.register(() => createMockService('svc2', []));

      const info = registry.getServicesInfo();

      expect(info).toHaveLength(2);
      expect(info[0]).toEqual({
        id: 'svc1',
        name: 'svc1 Service',
        version: '1.0.0',
        description: 'svc1 테스트 서비스',
        tools: ['test_tool'],
      });
      expect(info[1]).toEqual({
        id: 'svc2',
        name: 'svc2 Service',
        version: '1.0.0',
        description: 'svc2 테스트 서비스',
        tools: [],
      });
    });
  });

  describe('getAllToolNames', () => {
    it('모든 도구 이름을 반환한다', () => {
      registry.register(() => createMockService('svc1', [createMockTool('tool1'), createMockTool('tool2')]));
      registry.register(() => createMockService('svc2', [createMockTool('tool3')]));

      const toolNames = registry.getAllToolNames();

      expect(toolNames).toEqual(['tool1', 'tool2', 'tool3']);
    });

    it('등록된 서비스가 없으면 빈 배열을 반환한다', () => {
      expect(registry.getAllToolNames()).toEqual([]);
    });
  });

  describe('size', () => {
    it('등록된 서비스 개수를 반환한다', () => {
      expect(registry.size).toBe(0);

      registry.register(() => createMockService('svc1'));
      expect(registry.size).toBe(1);

      registry.register(() => createMockService('svc2'));
      expect(registry.size).toBe(2);
    });
  });

  describe('getService', () => {
    it('ID로 서비스를 조회할 수 있다', () => {
      const service = createMockService('test');
      registry.register(() => service);

      const retrieved = registry.getService('test');

      expect(retrieved).toBe(service);
    });

    it('존재하지 않는 ID는 undefined를 반환한다', () => {
      expect(registry.getService('nonexistent')).toBeUndefined();
    });
  });
});
