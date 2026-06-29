/**
 * 인터랙티브 CLI 기본 프롬프트 경로 테스트
 */

import { describe, expect, it, vi } from 'vitest';

const questionMock = vi.fn().mockResolvedValue('0');
const closeMock = vi.fn();

vi.mock('node:readline/promises', () => ({
  createInterface: vi.fn(() => ({
    question: questionMock,
    close: closeMock,
  })),
}));

describe('runInteractiveCli default prompt', () => {
  it('createPrompt 기본 경로로 즉시 종료할 수 있다', async () => {
    const { runInteractiveCli } = await import('../../src/cliInteractive.js');

    const exitCode = await runInteractiveCli({
      fetchImpl: vi.fn<typeof fetch>(),
      writeOut: () => {},
      writeErr: () => {},
    });

    expect(exitCode).toBe(0);
    expect(questionMock).toHaveBeenCalled();
    expect(closeMock).toHaveBeenCalled();
  }, 15000);
});
