/**
 * CLI smoke 스크립트 테스트
 */

import { describe, expect, it, vi } from 'vitest';
import { runCliSmoke } from '../../scripts/cli-smoke.ts';

describe('runCliSmoke', () => {
  it('필수 CLI 명령이 모두 성공하면 0을 반환한다', async () => {
    const runCommand = vi.fn().mockResolvedValue(0);
    const writeOut = vi.fn();
    const writeErr = vi.fn();

    const exitCode = await runCliSmoke({
      runCommand,
      writeOut,
      writeErr,
      command: 'node',
      cliPath: 'dist/bin.js',
    });

    expect(exitCode).toBe(0);
    expect(runCommand).toHaveBeenCalledWith('node', ['dist/bin.js', 'health']);
    expect(runCommand).toHaveBeenCalledWith('node', ['dist/bin.js', 'products', '수납박스', '--pageSize', '1', '--json']);
    expect(runCommand).toHaveBeenCalledWith('node', [
      'dist/bin.js',
      'lottemart-products',
      '콜라',
      '--storeCode',
      '2301',
      '--area',
      '서울',
      '--pageLimit',
      '1',
      '--json',
    ]);
    expect(writeErr).not.toHaveBeenCalled();
  });

  it('하나라도 실패하면 즉시 non-zero를 반환한다', async () => {
    const runCommand = vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    const writeOut = vi.fn();
    const writeErr = vi.fn();

    const exitCode = await runCliSmoke({
      runCommand,
      writeOut,
      writeErr,
      command: 'node',
      cliPath: 'dist/bin.js',
    });

    expect(exitCode).toBe(1);
    expect(runCommand).toHaveBeenCalledTimes(2);
    expect(writeErr).toHaveBeenCalledWith(expect.stringContaining('CLI smoke 실패'));
  });
});
