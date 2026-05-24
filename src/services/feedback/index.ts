import type { ServiceProvider } from '../../core/interfaces.js';
import type { ServiceMetadata, ToolRegistration } from '../../core/types.js';
import { createSubmitDeveloperRequestTool } from './tools/submitDeveloperRequest.js';
import type { DeveloperRequestConfig } from './types.js';

const FEEDBACK_METADATA: ServiceMetadata = {
  id: 'feedback',
  name: '개발자 요청',
  version: '1.0.0',
  description: 'AI 에이전트가 MCP 오류, 개선 요청, 신규 기능 요청을 개발자에게 전달하는 서비스',
};

class FeedbackService implements ServiceProvider {
  readonly metadata = FEEDBACK_METADATA;

  constructor(private readonly config: DeveloperRequestConfig = {}) {}

  getTools(): ToolRegistration[] {
    return [createSubmitDeveloperRequestTool(this.config)];
  }
}

export function createFeedbackService(config: DeveloperRequestConfig = {}): ServiceProvider {
  return new FeedbackService(config);
}

export * from './client.js';
export * from './types.js';
