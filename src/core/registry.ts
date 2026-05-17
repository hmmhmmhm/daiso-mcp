/**
 * 서비스 레지스트리
 *
 * 서비스 프로바이더를 등록하고 MCP 서버에 도구를 연결합니다.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServiceProvider, ServiceFactory } from './interfaces.js';
import type { ServiceInfo, ToolRegistration } from './types.js';

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
    server.registerTool(tool.name, tool.metadata, async (args) => {
      const result = await tool.handler(args);
      const response: {
        content: Array<{ type: 'text'; text: string }>;
        structuredContent?: Record<string, unknown>;
      } = {
        content: result.content.map((item) => ({
          type: item.type as 'text',
          text: item.text,
        })),
      };
      if (result.structuredContent) {
        response.structuredContent = result.structuredContent;
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
