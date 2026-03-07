/**
 * CLI 테스트
 */

import { describe, expect, it, vi } from 'vitest';
import { isDirectExecution, runCli } from '../../src/cli.js';

function createDeps() {
  const output: string[] = [];
  const errors: string[] = [];

  return {
    output,
    errors,
    deps: {
      fetchImpl: vi.fn<typeof fetch>(),
      writeOut: (message: string) => {
        output.push(message);
      },
      writeErr: (message: string) => {
        errors.push(message);
      },
      getVersion: () => '9.9.9',
      nowIso: () => '2026-03-07T00:00:00.000Z',
      runCommand: vi.fn<(command: string, args: string[]) => Promise<number>>(),
      isInteractiveTerminal: () => false,
      runInteractive: vi.fn<(deps: { fetchImpl: typeof fetch }) => Promise<number>>(),
    },
  };
}

describe('CLI', () => {
  it('명령어 없이 TTY 환경이면 인터랙티브 모드를 실행한다', async () => {
    const { deps } = createDeps();
    deps.isInteractiveTerminal = () => true;
    deps.runInteractive = vi.fn().mockResolvedValue(0);

    const exitCode = await runCli([], deps);

    expect(exitCode).toBe(0);
    expect(deps.runInteractive).toHaveBeenCalledTimes(1);
  });

  it('--non-interactive 옵션이 있으면 TTY에서도 인터랙티브 모드를 실행하지 않는다', async () => {
    const { output, deps } = createDeps();
    deps.isInteractiveTerminal = () => true;
    deps.runInteractive = vi.fn().mockResolvedValue(0);

    const exitCode = await runCli(['--non-interactive'], deps);

    expect(exitCode).toBe(0);
    expect(deps.runInteractive).not.toHaveBeenCalled();
    expect(output.join('\n')).toContain('사용법:');
  });

  it('기본 실행 시 도움말을 출력한다', async () => {
    const { output, deps } = createDeps();

    const exitCode = await runCli([], deps);

    expect(exitCode).toBe(0);
    expect(output.join('\n')).toContain('사용법:');
  });

  it('help <command>는 상세 도움말을 출력한다', async () => {
    const { output, deps } = createDeps();

    const exitCode = await runCli(['help', 'products'], deps);

    expect(exitCode).toBe(0);
    expect(output.join('\n')).toContain('명령: products');
    expect(output.join('\n')).toContain('옵션: --page, --pageSize');
  });

  it('help <unknown>은 오류를 반환한다', async () => {
    const { errors, deps } = createDeps();

    const exitCode = await runCli(['help', 'unknown'], deps);

    expect(exitCode).toBe(1);
    expect(errors.join('\n')).toContain('도움말을 찾을 수 없는 명령어');
  });

  it('version 명령은 버전을 출력한다', async () => {
    const { output, deps } = createDeps();

    const exitCode = await runCli(['version'], deps);

    expect(exitCode).toBe(0);
    expect(output).toEqual(['9.9.9']);
  });

  it('url 명령은 MCP URL을 출력한다', async () => {
    const { output, deps } = createDeps();

    const exitCode = await runCli(['url'], deps);

    expect(exitCode).toBe(0);
    expect(output).toEqual(['https://mcp.aka.page/mcp']);
  });

  it('get 명령은 임의 API를 호출한다', async () => {
    const { deps, output } = createDeps();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true, data: { products: [] }, meta: { total: 0 } }),
    } as unknown as Response);
    deps.fetchImpl = fetchImpl;

    const exitCode = await runCli(['get', '/api/daiso/products', '--q', '수납박스'], deps);

    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith('https://mcp.aka.page/api/daiso/products?q=%EC%88%98%EB%82%A9%EB%B0%95%EC%8A%A4');
    expect(output.join('\n')).toContain('요청 성공');
    expect(output.join('\n')).toContain('원본 JSON은 --json 옵션으로 확인하세요.');
  });

  it('get --json은 원본 JSON을 출력하고 쿼리에 json을 추가하지 않는다', async () => {
    const { deps, output } = createDeps();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true, data: { value: 1 } }),
    } as unknown as Response);
    deps.fetchImpl = fetchImpl;

    const exitCode = await runCli(['get', '/api/daiso/products', '--q', '수납박스', '--json'], deps);

    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith('https://mcp.aka.page/api/daiso/products?q=%EC%88%98%EB%82%A9%EB%B0%95%EC%8A%A4');
    expect(output[0]).toContain('"success": true');
  });

  it('products 명령은 검색어로 제품 API를 호출한다', async () => {
    const { deps, output } = createDeps();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: { products: [{ name: '수납박스', id: '1', price: 1000 }] },
      }),
    } as unknown as Response);
    deps.fetchImpl = fetchImpl;

    const exitCode = await runCli(['products', '수납박스', '--page', '2', '--pageSize', '10'], deps);

    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://mcp.aka.page/api/daiso/products?q=%EC%88%98%EB%82%A9%EB%B0%95%EC%8A%A4&page=2&pageSize=10',
    );
    expect(output.join('\n')).toContain('제품 목록: 1건');
  });

  it('--non-interactive 옵션은 일반 명령 호출 시 쿼리에 포함되지 않는다', async () => {
    const { deps } = createDeps();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as Response);
    deps.fetchImpl = fetchImpl;

    const exitCode = await runCli(['products', '수납박스', '--non-interactive', '--page', '1'], deps);

    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://mcp.aka.page/api/daiso/products?q=%EC%88%98%EB%82%A9%EB%B0%95%EC%8A%A4&page=1',
    );
  });

  it('product 명령은 제품 상세 API를 호출한다', async () => {
    const { deps } = createDeps();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as Response);
    deps.fetchImpl = fetchImpl;

    const exitCode = await runCli(['product', '1034604'], deps);

    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith('https://mcp.aka.page/api/daiso/products/1034604');
  });

  it('stores 명령은 keyword 없이도 sido로 호출할 수 있다', async () => {
    const { deps } = createDeps();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as Response);
    deps.fetchImpl = fetchImpl;

    const exitCode = await runCli(['stores', '--sido', '서울', '--gugun', '강남구'], deps);

    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://mcp.aka.page/api/daiso/stores?sido=%EC%84%9C%EC%9A%B8&gugun=%EA%B0%95%EB%82%A8%EA%B5%AC',
    );
  });

  it('stores --help는 상세 도움말을 출력한다', async () => {
    const { output, deps } = createDeps();

    const exitCode = await runCli(['stores', '--help'], deps);

    expect(exitCode).toBe(0);
    expect(output.join('\n')).toContain('명령: stores');
    expect(output.join('\n')).toContain('옵션: --keyword, --sido, --gugun, --dong, --limit');
  });

  it('inventory 명령은 productId로 재고 API를 호출한다', async () => {
    const { deps } = createDeps();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as Response);
    deps.fetchImpl = fetchImpl;

    const exitCode = await runCli(['inventory', '1034604', '--keyword', '강남역'], deps);

    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://mcp.aka.page/api/daiso/inventory?productId=1034604&keyword=%EA%B0%95%EB%82%A8%EC%97%AD',
    );
  });

  it('health 명령은 서버 상태를 출력한다', async () => {
    const { output, deps } = createDeps();

    deps.fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ status: 'ok' }),
    } as unknown as Response);

    const exitCode = await runCli(['health'], deps);

    expect(exitCode).toBe(0);
    expect(output[0]).toContain('"status": "ok"');
    expect(output[0]).toContain('"checkedAt": "2026-03-07T00:00:00.000Z"');
  });

  it('health 명령은 status 누락 시 unknown으로 출력한다', async () => {
    const { output, deps } = createDeps();

    deps.fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({}),
    } as unknown as Response);

    const exitCode = await runCli(['health'], deps);

    expect(exitCode).toBe(0);
    expect(output[0]).toContain('"status": "unknown"');
  });

  it('health 명령은 HTTP 오류를 처리한다', async () => {
    const { errors, deps } = createDeps();

    deps.fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 503,
    } as Response);

    const exitCode = await runCli(['health'], deps);

    expect(exitCode).toBe(1);
    expect(errors[0]).toContain('HTTP 503');
  });

  it('get 명령은 경로가 없으면 실패한다', async () => {
    const { errors, deps } = createDeps();

    const exitCode = await runCli(['get'], deps);

    expect(exitCode).toBe(1);
    expect(errors[0]).toContain('경로가 필요합니다');
  });

  it('products 명령은 검색어가 없으면 실패한다', async () => {
    const { errors, deps } = createDeps();

    const exitCode = await runCli(['products'], deps);

    expect(exitCode).toBe(1);
    expect(errors[0]).toContain('검색어가 필요합니다');
  });

  it('health 명령은 예외를 처리한다', async () => {
    const { errors, deps } = createDeps();

    deps.fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error('network down'));

    const exitCode = await runCli(['health'], deps);

    expect(exitCode).toBe(1);
    expect(errors[0]).toContain('network down');
  });

  it('health 명령은 문자열 예외를 처리한다', async () => {
    const { errors, deps } = createDeps();

    deps.fetchImpl = vi.fn<typeof fetch>().mockRejectedValue('network down');

    const exitCode = await runCli(['health'], deps);

    expect(exitCode).toBe(1);
    expect(errors[0]).toContain('network down');
  });

  it('claude 명령은 등록 명령을 출력한다', async () => {
    const { output, deps } = createDeps();

    const exitCode = await runCli(['claude'], deps);

    expect(exitCode).toBe(0);
    expect(output).toEqual(['claude mcp add daiso https://mcp.aka.page --transport sse']);
  });

  it('claude --exec 명령은 실제 실행 함수를 호출한다', async () => {
    const { deps } = createDeps();

    deps.runCommand = vi.fn().mockResolvedValue(0);

    const exitCode = await runCli(['claude', '--exec'], deps);

    expect(exitCode).toBe(0);
    expect(deps.runCommand).toHaveBeenCalledWith('claude', [
      'mcp',
      'add',
      'daiso',
      'https://mcp.aka.page',
      '--transport',
      'sse',
    ]);
  });

  it('claude --exec 명령은 실행 예외를 처리한다', async () => {
    const { errors, deps } = createDeps();

    deps.runCommand = vi.fn().mockRejectedValue(new Error('not found'));

    const exitCode = await runCli(['claude', '--exec'], deps);

    expect(exitCode).toBe(1);
    expect(errors[0]).toContain('not found');
  });

  it('claude --exec 명령은 문자열 예외를 처리한다', async () => {
    const { errors, deps } = createDeps();

    deps.runCommand = vi.fn().mockRejectedValue('not found');

    const exitCode = await runCli(['claude', '--exec'], deps);

    expect(exitCode).toBe(1);
    expect(errors[0]).toContain('not found');
  });

  it('기본 의존성으로도 version 명령이 동작한다', async () => {
    const writeOut = vi.fn<(message: string) => void>();
    const writeErr = vi.fn<(message: string) => void>();

    const exitCode = await runCli(['version'], { writeOut, writeErr });

    expect(exitCode).toBe(0);
    expect(writeOut).toHaveBeenCalledTimes(1);
    expect(writeErr).not.toHaveBeenCalled();
  });

  it('기본 nowIso 의존성으로 health 명령이 동작한다', async () => {
    const writeOut = vi.fn<(message: string) => void>();
    const writeErr = vi.fn<(message: string) => void>();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ status: 'ok' }),
    } as unknown as Response);

    const exitCode = await runCli(['health'], { fetchImpl, writeOut, writeErr });

    expect(exitCode).toBe(0);
    expect(writeOut).toHaveBeenCalledTimes(1);
    expect(writeErr).not.toHaveBeenCalled();
  });

  it('알 수 없는 명령은 에러를 반환한다', async () => {
    const { errors, deps } = createDeps();

    const exitCode = await runCli(['unknown'], deps);

    expect(exitCode).toBe(1);
    expect(errors.join('\n')).toContain('알 수 없는 명령어');
  });

  it('직접 실행 여부를 올바르게 판별한다', () => {
    expect(isDirectExecution('', 'file:///tmp/test.js')).toBe(false);
    expect(isDirectExecution('/tmp/test.js', 'file:///tmp/test.js')).toBe(true);
    expect(isDirectExecution('/tmp/other.js', 'file:///tmp/test.js')).toBe(false);
  });
});
