/**
 * 서비스 레지스트리
 *
 * 서비스 프로바이더를 등록하고 MCP 서버에 도구를 연결합니다.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import type { ServiceProvider, ServiceFactory } from './interfaces.js';
import type { ServiceInfo, ToolRegistration } from './types.js';
import { getErrorMessage, toStandardErrorDiagnostics } from './errors.js';

const DEFAULT_OUTPUT_SCHEMA = z.object({}).loose().describe('도구 실행 결과(JSON 객체)');

function parseJsonText(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value.replace(/km$/i, ''));
      if (Number.isFinite(parsed)) {
        return value.trim().toLowerCase().endsWith('km') ? Math.round(parsed * 1000) : parsed;
      }
    }
  }
  return null;
}

function normalizeProducts(products: unknown[]): Array<Record<string, unknown>> {
  return products
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      code: firstString(item.itemCode, item.productCode, item.pluCd, item.id, item.productNo),
      name: firstString(item.itemName, item.shortItemName, item.goodsName, item.productName, item.name),
      price: firstNumber(item.viewPrice, item.salePrice, item.sellPrice, item.price, item.originPrice, item.searchItemSellPrice),
      imageUrl: firstString(item.imageUrl),
      raw: item,
    }));
}

function normalizeStores(stores: unknown[]): Array<Record<string, unknown>> {
  return stores
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      code: firstString(item.storeCode, item.code, item.id),
      name: firstString(item.storeName, item.name, item.theaterName),
      address: firstString(item.address, item.storeAddress),
      distanceMeters: firstNumber(item.distanceM, item.distanceMeters, item.distance),
      raw: item,
    }));
}

function withStandardCollections(payload: Record<string, unknown>): Record<string, unknown> {
  const standard: Record<string, unknown> = {};
  if (Array.isArray(payload.products)) {
    standard.products = normalizeProducts(payload.products);
  }
  if (Array.isArray(payload.stores)) {
    standard.stores = normalizeStores(payload.stores);
  }
  if (Array.isArray(payload.theaters)) {
    standard.theaters = normalizeStores(payload.theaters);
  }
  if (Array.isArray(payload.movies)) {
    standard.movies = normalizeProducts(payload.movies);
  }

  if (Object.keys(standard).length === 0) {
    return payload;
  }

  return {
    ...payload,
    standard,
  };
}

function buildStructuredContent(result: { content: Array<{ text: string }>; structuredContent?: Record<string, unknown> }) {
  if (result.structuredContent) {
    return withStandardCollections(result.structuredContent);
  }

  const text = result.content[0]?.text || '';
  const parsed = parseJsonText(text);
  if (parsed) {
    return withStandardCollections(parsed);
  }

  return { text };
}

/**
 * 서비스 레지스트리 클래스
 *
 * 여러 서비스 프로바이더를 관리하고 MCP 서버에 등록합니다.
 *
 * @example
 * ```typescript
 * const registry = new ServiceRegistry();
 * registry.register(createDaisoService);
 * registry.register(createCuService);
 * await registry.applyToServer(mcpServer);
 * ```
 */
export class ServiceRegistry {
  private services: Map<string, ServiceProvider> = new Map();

  /**
   * 서비스 팩토리 등록
   * @param factory 서비스 인스턴스를 생성하는 팩토리 함수
   */
  register(factory: ServiceFactory): void {
    const service = factory();
    const { id } = service.metadata;

    if (this.services.has(id)) {
      throw new Error(`서비스 '${id}'가 이미 등록되어 있습니다.`);
    }

    this.services.set(id, service);
  }

  /**
   * 여러 서비스 팩토리를 한 번에 등록
   * @param factories 서비스 팩토리 함수 배열
   */
  registerAll(factories: ServiceFactory[]): void {
    for (const factory of factories) {
      this.register(factory);
    }
  }

  /**
   * 모든 서비스 초기화
   */
  async initializeAll(): Promise<void> {
    const initPromises = Array.from(this.services.values())
      .filter((service) => service.initialize)
      .map((service) => service.initialize!());

    await Promise.all(initPromises);
  }

  /**
   * 모든 서비스 정리
   */
  async cleanupAll(): Promise<void> {
    const cleanupPromises = Array.from(this.services.values())
      .filter((service) => service.cleanup)
      .map((service) => service.cleanup!());

    await Promise.all(cleanupPromises);
  }

  /**
   * 모든 도구를 MCP 서버에 등록
   * @param server MCP 서버 인스턴스
   */
  applyToServer(server: McpServer): void {
    for (const service of this.services.values()) {
      const tools = service.getTools();

      for (const tool of tools) {
        this.registerTool(server, tool);
      }
    }
  }

  /**
   * 단일 도구를 MCP 서버에 등록
   */
  private registerTool(server: McpServer, tool: ToolRegistration): void {
    const metadata = {
      ...tool.metadata,
      outputSchema: tool.metadata.outputSchema || DEFAULT_OUTPUT_SCHEMA,
    };

    server.registerTool(tool.name, metadata as never, async (args) => {
      let result;
      try {
        result = await tool.handler(args);
      } catch (error) {
        const message = getErrorMessage(error);
        return {
          isError: true,
          content: [{ type: 'text' as const, text: message }],
          structuredContent: {
            error: toStandardErrorDiagnostics('TOOL_EXECUTION_FAILED', message, {
              operation: tool.name,
            }),
          },
        };
      }

      const response: {
        content: Array<{ type: 'text'; text: string }>;
        structuredContent?: Record<string, unknown>;
        isError?: boolean;
      } = {
        content: result.content.map((item) => ({
          type: item.type as 'text',
          text: item.text,
        })),
        structuredContent: buildStructuredContent(result),
      };
      if (result.isError) {
        response.isError = true;
      }
      return response;
    });
  }

  /**
   * 등록된 서비스 정보 목록 반환
   * API 응답용으로 사용됩니다.
   */
  getServicesInfo(): ServiceInfo[] {
    return Array.from(this.services.values()).map((service) => ({
      id: service.metadata.id,
      name: service.metadata.name,
      version: service.metadata.version,
      description: service.metadata.description,
      tools: service.getTools().map((tool) => tool.name),
    }));
  }

  /**
   * 등록된 모든 도구 이름 반환
   */
  getAllToolNames(): string[] {
    const toolNames: string[] = [];
    for (const service of this.services.values()) {
      toolNames.push(...service.getTools().map((tool) => tool.name));
    }
    return toolNames;
  }

  /**
   * 서비스 개수 반환
   */
  get size(): number {
    return this.services.size;
  }

  /**
   * 특정 서비스 조회
   */
  getService(id: string): ServiceProvider | undefined {
    return this.services.get(id);
  }
}
