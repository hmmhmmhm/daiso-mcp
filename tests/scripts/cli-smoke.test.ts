/**
 * CLI smoke 스크립트 테스트
 */

import { describe, expect, it, vi } from 'vitest';
import { CLI_SMOKE_COMMANDS, runCliSmoke } from '../../scripts/ops/cli-smoke.ts';

describe('runCliSmoke', () => {
  it('최소 정보 사용자 시나리오를 smoke 목록에 포함한다', () => {
    expect(CLI_SMOKE_COMMANDS.map((command) => command.scenario)).toEqual(
      expect.arrayContaining([
        '상품명만 아는 사용자',
        '위치를 대강 말하는 사용자',
        '잘못된 옵션을 입력한 사용자',
      ]),
    );
  });

  it('서비스별 matrix 실행을 위해 각 명령에 service를 지정한다', () => {
    expect(CLI_SMOKE_COMMANDS.map((command) => command.service)).toEqual(
      expect.arrayContaining([
        'daiso',
        'gs25',
        'seveneleven',
        'emart24',
        'lottemart',
        'oliveyoung',
        'megabox',
        'lottecinema',
        'cgv',
        'opinet',
      ]),
    );
  });

  it('필수 CLI 명령이 모두 성공하면 0을 반환한다', async () => {
    const runCommand = vi.fn((_command: string, args: string[]) => {
      const command = args[1];
      if (command === 'health') {
        return Promise.resolve({ exitCode: 0, stdout: JSON.stringify({ status: 'ok' }), stderr: '' });
      }

      const stdoutByCommand: Record<string, unknown> = {
        stores: { success: true, data: { stores: [] } },
        'gs25-products': { success: true, data: { keyword: '콜라' } },
        'gs25-stores': { success: true, data: { keyword: '강남' } },
        'seveneleven-products': { success: true, data: { query: '커피' } },
        'emart24-products': { success: true, data: { keyword: '커피' } },
        'lottemart-products': { success: true, data: { keyword: '콜라' } },
        'lottecinema-theaters': { success: true, data: { keyword: '잠실' } },
      };
      const path = args[2];
      const getPayload =
        path === '/api/oliveyoung/products'
          ? { success: true, data: { keyword: '선크림' } }
          : path === '/api/megabox/theaters' || path === '/api/cgv/theaters'
            ? { success: true, data: { keyword: '강남' } }
            : path === '/api/opinet/average'
              ? { success: true, data: { provider: 'opinet' } }
            : undefined;
      const payload = stdoutByCommand[command] || getPayload || { success: true, data: {} };
      const stderr = args.includes('--store') ? '알 수 없는 옵션: --store\n매장명은 --keyword로 전달하세요' : '';
      return Promise.resolve({
        exitCode: args.includes('--store') ? 1 : 0,
        stdout: args.includes('--store') ? '' : JSON.stringify(payload),
        stderr,
      });
    });
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
    expect(runCommand).toHaveBeenCalledWith('node', ['dist/bin.js', 'stores', '안산 중앙역', '--limit', '1', '--json']);
    expect(runCommand).toHaveBeenCalledWith('node', [
      'dist/bin.js',
      'inventory',
      '1034604',
      '--store',
      '강남역점',
    ]);
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

  it('service가 지정되면 해당 서비스 명령만 실행한다', async () => {
    const runCommand = vi.fn((_command: string, args: string[]) => {
      const command = args[1];
      const payloadByCommand: Record<string, unknown> = {
        'gs25-products': { success: true, data: { keyword: '콜라' } },
        'gs25-stores': { success: true, data: { keyword: '강남' } },
      };

      return Promise.resolve({
        exitCode: 0,
        stdout: JSON.stringify(payloadByCommand[command]),
        stderr: '',
      });
    });

    const exitCode = await runCliSmoke({
      runCommand,
      writeOut: vi.fn(),
      writeErr: vi.fn(),
      command: 'node',
      cliPath: 'dist/bin.js',
      service: 'gs25',
    });

    expect(exitCode).toBe(0);
    expect(runCommand).toHaveBeenCalledTimes(2);
    expect(runCommand.mock.calls.map(([, args]) => args[1])).toEqual(['gs25-products', 'gs25-stores']);
  });

  it('하나라도 실패하면 즉시 non-zero를 반환한다', async () => {
    const runCommand = vi
      .fn()
      .mockResolvedValueOnce({ exitCode: 0, stdout: JSON.stringify({ status: 'ok' }), stderr: '' })
      .mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'boom' });
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

  it('JSON 응답이 기대한 사용자 입력을 반영하지 않으면 실패한다', async () => {
    const runCommand = vi.fn((_command: string, args: string[]) => {
      const command = args[1];
      const payloadByCommand: Record<string, unknown> = {
        health: { status: 'ok' },
        stores: { success: true, data: { stores: [] } },
        'gs25-products': { success: true, data: { keyword: '콜라' } },
        'gs25-stores': { success: true, data: { keyword: '강남' } },
        'seveneleven-products': { success: true, data: { query: '커피' } },
        'emart24-products': { success: true, data: { keyword: '커피' } },
        'lottemart-products': { success: true, data: { keyword: '콜라' } },
        'lottecinema-theaters': { success: true, data: { keyword: null } },
      };
      const path = args[2];
      const getPayload =
        path === '/api/oliveyoung/products'
          ? { success: true, data: { keyword: '선크림' } }
          : path === '/api/megabox/theaters' || path === '/api/cgv/theaters'
            ? { success: true, data: { keyword: '강남' } }
            : path === '/api/opinet/average'
              ? { success: true, data: { provider: 'opinet' } }
            : undefined;
      const payload = payloadByCommand[command] || getPayload || { success: true, data: {} };

      return Promise.resolve({
        exitCode: args.includes('--store') ? 1 : 0,
        stdout: args.includes('--store') ? '' : JSON.stringify(payload),
        stderr: args.includes('--store') ? '알 수 없는 옵션: --store' : '',
      });
    });
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
    expect(writeErr).toHaveBeenCalledWith(expect.stringContaining('CLI smoke 검증 실패'));
  });
});
