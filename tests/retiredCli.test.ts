import { expect, it, vi } from 'vitest';
import { runCli } from '../src/cli.js';
it.each(['lottemart-stores', 'lottemart-products'])(
  '종료된 명령 %s는 원격 조회 없이 종료를 알린다',
  async (command) => {
    const fetchImpl = vi.fn();
    const writeErr = vi.fn();
    expect(await runCli([command, '콜라'], { fetchImpl, writeErr, writeOut: vi.fn() })).toBe(1);
    expect(writeErr).toHaveBeenCalledWith(expect.stringContaining('지원이 종료'));
    expect(fetchImpl).not.toHaveBeenCalled();
  },
);
