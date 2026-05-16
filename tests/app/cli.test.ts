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

  it('기본 도움말은 정보가 부족한 사용자를 위한 탐색 흐름을 안내한다', async () => {
    const { output, deps } = createDeps();

    const exitCode = await runCli([], deps);
    const text = output.join('\n');

    expect(exitCode).toBe(0);
    expect(text).toContain('정보가 부족할 때');
    expect(text).toContain('제품명을 먼저 검색해 productId를 확인');
    expect(text).toContain('매장을 먼저 검색해 storeName 또는 storeCode를 확인');
    expect(text).toContain('npx daiso products');
    expect(text).toContain('npx daiso inventory');
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

  it('stores 명령은 다이소 키워드 보정으로 재검색한다', async () => {
    const { deps, output } = createDeps();
    deps.fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ success: true, data: { stores: [] } }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: { stores: [{ name: '안산중앙본점', address: '경기 안산', phone: '1522-4400' }] },
        }),
      } as unknown as Response);

    const exitCode = await runCli(['stores', '안산 중앙역'], deps);

    expect(exitCode).toBe(0);
    expect(deps.fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://mcp.aka.page/api/daiso/stores?keyword=%EC%95%88%EC%82%B0+%EC%A4%91%EC%95%99%EC%97%AD',
    );
    expect(deps.fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://mcp.aka.page/api/daiso/stores?keyword=%EC%95%88%EC%82%B0%EC%A4%91%EC%95%99%EC%97%AD',
    );
    expect(output.join('\n')).toContain('입력 키워드 "안산 중앙역" 대신 "안산중앙역"로 매장을 찾았습니다.');
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

  it('display-location 명령은 진열 위치 API를 호출한다', async () => {
    const { deps } = createDeps();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as Response);
    deps.fetchImpl = fetchImpl;

    const exitCode = await runCli(['display-location', '1034604', '04515'], deps);

    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://mcp.aka.page/api/daiso/display-location?productId=1034604&storeCode=04515',
    );
  });

  it('display-location 일반 출력은 실제 진열 위치를 보여준다', async () => {
    const { output, deps } = createDeps();
    deps.fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: {
          productId: '1034604',
          storeCode: '04515',
          hasLocation: true,
          locations: [{ zoneNo: 'A12', stairNo: '2F', storeErp: '04515' }],
        },
      }),
    } as unknown as Response);

    const exitCode = await runCli(['display-location', '1034604', '04515'], deps);

    expect(exitCode).toBe(0);
    expect(output.join('\n')).toContain('진열 위치: 있음');
    expect(output.join('\n')).toContain('A12');
    expect(output.join('\n')).toContain('2F');
  });

  it('display-location 명령은 인자가 부족하면 실패한다', async () => {
    const { errors, deps } = createDeps();

    const exitCode = await runCli(['display-location', '1034604'], deps);

    expect(exitCode).toBe(1);
    expect(errors[0]).toContain('productId와 storeCode가 필요합니다');
    expect(errors[0]).toContain('storeCode를 모르면 먼저 daiso inventory 1034604 --keyword 매장명');
  });

  it('stores 일반 출력은 매장 코드와 주소를 보여준다', async () => {
    const { output, deps } = createDeps();
    deps.fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: {
          stores: [{ name: '강남역점', storeCode: '11199', address: '서울 강남구 강남대로' }],
        },
      }),
    } as unknown as Response);

    const exitCode = await runCli(['stores', '강남역'], deps);

    expect(exitCode).toBe(0);
    expect(output.join('\n')).toContain('강남역점 [11199]');
    expect(output.join('\n')).toContain('서울 강남구 강남대로');
  });

  it('cu-stores 명령은 CU 매장 API를 호출한다', async () => {
    const { deps } = createDeps();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as Response);
    deps.fetchImpl = fetchImpl;

    const exitCode = await runCli(['cu-stores', '강남', '--limit', '5'], deps);

    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith('https://mcp.aka.page/api/cu/stores?limit=5&keyword=%EA%B0%95%EB%82%A8');
  });

  it('cu-inventory 명령은 CU 재고 API를 호출한다', async () => {
    const { deps } = createDeps();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as Response);
    deps.fetchImpl = fetchImpl;

    const exitCode = await runCli(['cu-inventory', '과자', '--storeKeyword', '강남'], deps);

    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://mcp.aka.page/api/cu/inventory?keyword=%EA%B3%BC%EC%9E%90&storeKeyword=%EA%B0%95%EB%82%A8',
    );
  });

  it('cu-inventory 명령은 검색어가 없으면 실패한다', async () => {
    const { errors, deps } = createDeps();

    const exitCode = await runCli(['cu-inventory'], deps);

    expect(exitCode).toBe(1);
    expect(errors[0]).toContain('검색어가 필요합니다');
  });

  it('lottecinema-theaters 명령은 롯데시네마 주변 지점 API를 호출한다', async () => {
    const { deps } = createDeps();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true, data: { theaters: [] }, meta: { total: 0 } }),
    } as unknown as Response);
    deps.fetchImpl = fetchImpl;

    const exitCode = await runCli(
      ['lottecinema-theaters', '--lat', '37.3154', '--lng', '126.8388', '--limit', '5'],
      deps,
    );

    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://mcp.aka.page/api/lottecinema/theaters?lat=37.3154&lng=126.8388&limit=5',
    );
  });

  it('lottecinema-theaters 명령은 위치 검색어를 positional 인자로 받는다', async () => {
    const { deps } = createDeps();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true, data: { theaters: [] }, meta: { total: 0 } }),
    } as unknown as Response);
    deps.fetchImpl = fetchImpl;

    const exitCode = await runCli(['lottecinema-theaters', '잠실', '--limit', '5'], deps);

    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://mcp.aka.page/api/lottecinema/theaters?limit=5&keyword=%EC%9E%A0%EC%8B%A4',
    );
  });

  it('lottecinema-movies 명령은 롯데시네마 영화/회차 API를 호출한다', async () => {
    const { deps } = createDeps();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true, data: { movies: [], showtimes: [] }, meta: { total: 0 } }),
    } as unknown as Response);
    deps.fetchImpl = fetchImpl;

    const exitCode = await runCli(['lottecinema-movies', '--playDate', '20260310', '--theaterId', '3012'], deps);

    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://mcp.aka.page/api/lottecinema/movies?playDate=20260310&theaterId=3012',
    );
  });

  it('lottecinema-movies 명령은 위치 검색어를 positional 인자로 받는다', async () => {
    const { deps } = createDeps();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true, data: { movies: [], showtimes: [] }, meta: { total: 0 } }),
    } as unknown as Response);
    deps.fetchImpl = fetchImpl;

    const exitCode = await runCli(['lottecinema-movies', '잠실', '--playDate', '20260310'], deps);

    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://mcp.aka.page/api/lottecinema/movies?playDate=20260310&keyword=%EC%9E%A0%EC%8B%A4',
    );
  });

  it('lottecinema-seats 명령은 롯데시네마 잔여 좌석 API를 호출한다', async () => {
    const { deps } = createDeps();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true, data: { seats: [] }, meta: { total: 0 } }),
    } as unknown as Response);
    deps.fetchImpl = fetchImpl;

    const exitCode = await runCli(
      ['lottecinema-seats', '--playDate', '20260310', '--theaterId', '3012', '--movieId', '23816', '--limit', '10'],
      deps,
    );

    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://mcp.aka.page/api/lottecinema/seats?playDate=20260310&theaterId=3012&movieId=23816&limit=10',
    );
  });

  it('lottecinema-seats 명령은 위치 검색어를 positional 인자로 받는다', async () => {
    const { deps } = createDeps();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true, data: { seats: [] }, meta: { total: 0 } }),
    } as unknown as Response);
    deps.fetchImpl = fetchImpl;

    const exitCode = await runCli(['lottecinema-seats', '잠실', '--movieId', '23816', '--limit', '10'], deps);

    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://mcp.aka.page/api/lottecinema/seats?movieId=23816&limit=10&keyword=%EC%9E%A0%EC%8B%A4',
    );
  });

  it('emart24-stores 명령은 이마트24 매장 API를 호출한다', async () => {
    const { deps } = createDeps();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as Response);
    deps.fetchImpl = fetchImpl;

    const exitCode = await runCli(['emart24-stores', '강남', '--service24h', 'true', '--limit', '5'], deps);

    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://mcp.aka.page/api/emart24/stores?service24h=true&limit=5&keyword=%EA%B0%95%EB%82%A8',
    );
  });

  it('emart24-products 명령은 이마트24 상품 API를 호출한다', async () => {
    const { deps } = createDeps();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as Response);
    deps.fetchImpl = fetchImpl;

    const exitCode = await runCli(['emart24-products', '두바이', '--page', '2', '--pageSize', '20'], deps);

    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://mcp.aka.page/api/emart24/products?keyword=%EB%91%90%EB%B0%94%EC%9D%B4&page=2&pageSize=20',
    );
  });

  it('emart24-products 명령은 검색어가 없으면 실패한다', async () => {
    const { errors, deps } = createDeps();

    const exitCode = await runCli(['emart24-products'], deps);

    expect(exitCode).toBe(1);
    expect(errors[0]).toContain('검색어가 필요합니다');
  });

  it('emart24-inventory 명령은 이마트24 재고 API를 호출한다', async () => {
    const { deps } = createDeps();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as Response);
    deps.fetchImpl = fetchImpl;

    const exitCode = await runCli(
      ['emart24-inventory', '8800244010504', '--bizNoArr', '28339,05015'],
      deps,
    );

    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://mcp.aka.page/api/emart24/inventory?pluCd=8800244010504&bizNoArr=28339%2C05015',
    );
  });

  it('emart24-inventory 명령은 필수 인자가 없으면 실패한다', async () => {
    const { errors, deps } = createDeps();

    const exitCode = await runCli(['emart24-inventory', '8800244010504'], deps);

    expect(exitCode).toBe(1);
    expect(errors[0]).toContain('pluCd와 --bizNoArr가 필요합니다');
  });

  it('lottemart-stores 명령은 롯데마트 매장 API를 호출한다', async () => {
    const { deps } = createDeps();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as Response);
    deps.fetchImpl = fetchImpl;

    const exitCode = await runCli(['lottemart-stores', '잠실', '--area', '서울', '--limit', '5'], deps);

    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://mcp.aka.page/api/lottemart/stores?area=%EC%84%9C%EC%9A%B8&limit=5&keyword=%EC%9E%A0%EC%8B%A4',
    );
  });

  it('lottemart-products 명령은 롯데마트 상품 API를 호출한다', async () => {
    const { deps } = createDeps();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as Response);
    deps.fetchImpl = fetchImpl;

    const exitCode = await runCli(['lottemart-products', '콜라', '--storeName', '강변점', '--area', '서울'], deps);

    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://mcp.aka.page/api/lottemart/products?keyword=%EC%BD%9C%EB%9D%BC&storeName=%EA%B0%95%EB%B3%80%EC%A0%90&area=%EC%84%9C%EC%9A%B8',
    );
  });

  it('lottemart-products 명령은 store 정보가 없으면 실패한다', async () => {
    const { errors, deps } = createDeps();

    const exitCode = await runCli(['lottemart-products', '콜라'], deps);

    expect(exitCode).toBe(1);
    expect(errors[0]).toContain('--storeCode 또는 --storeName이 필요합니다');
    expect(errors[0]).toContain('매장을 모르면 먼저 daiso lottemart-stores 잠실 --area 서울');
  });

  it('gs25-stores 명령은 GS25 매장 API를 호출한다', async () => {
    const { deps } = createDeps();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as Response);
    deps.fetchImpl = fetchImpl;

    const exitCode = await runCli(['gs25-stores', '강남', '--limit', '5'], deps);

    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith('https://mcp.aka.page/api/gs25/stores?limit=5&keyword=%EA%B0%95%EB%82%A8');
  });

  it('gs25-products 명령은 GS25 상품 API를 호출한다', async () => {
    const { deps } = createDeps();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as Response);
    deps.fetchImpl = fetchImpl;

    const exitCode = await runCli(['gs25-products', '오감자', '--limit', '10'], deps);

    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://mcp.aka.page/api/gs25/products?keyword=%EC%98%A4%EA%B0%90%EC%9E%90&limit=10',
    );
  });

  it('gs25-inventory 명령은 GS25 재고 API를 호출한다', async () => {
    const { deps } = createDeps();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as Response);
    deps.fetchImpl = fetchImpl;

    const exitCode = await runCli(['gs25-inventory', '오감자', '--storeKeyword', '강남'], deps);

    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://mcp.aka.page/api/gs25/inventory?keyword=%EC%98%A4%EA%B0%90%EC%9E%90&storeKeyword=%EA%B0%95%EB%82%A8',
    );
  });

  it('seveneleven-products 명령은 세븐일레븐 상품 API를 호출한다', async () => {
    const { deps } = createDeps();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as Response);
    deps.fetchImpl = fetchImpl;

    const exitCode = await runCli(['seveneleven-products', '삼각김밥', '--size', '20'], deps);

    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://mcp.aka.page/api/seveneleven/products?query=%EC%82%BC%EA%B0%81%EA%B9%80%EB%B0%A5&size=20',
    );
  });

  it('seveneleven-stores 명령은 세븐일레븐 매장 API를 호출한다', async () => {
    const { deps } = createDeps();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as Response);
    deps.fetchImpl = fetchImpl;

    const exitCode = await runCli(['seveneleven-stores', '안산 중앙역', '--limit', '10'], deps);

    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://mcp.aka.page/api/seveneleven/stores?keyword=%EC%95%88%EC%82%B0+%EC%A4%91%EC%95%99%EC%97%AD&limit=10',
    );
  });

  it('seveneleven-popwords 명령은 세븐일레븐 인기 검색어 API를 호출한다', async () => {
    const { deps } = createDeps();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as Response);
    deps.fetchImpl = fetchImpl;

    const exitCode = await runCli(['seveneleven-popwords', '--label', 'home'], deps);

    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith('https://mcp.aka.page/api/seveneleven/popwords?label=home');
  });

  it('seveneleven-catalog 명령은 세븐일레븐 카탈로그 API를 호출한다', async () => {
    const { deps } = createDeps();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as Response);
    deps.fetchImpl = fetchImpl;

    const exitCode = await runCli(
      ['seveneleven-catalog', '--includeIssues', 'true', '--includeExhibition', 'true', '--limit', '10'],
      deps,
    );

    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://mcp.aka.page/api/seveneleven/catalog?includeIssues=true&includeExhibition=true&limit=10',
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

  it('inventory 명령은 제품 ID가 없으면 제품명 검색부터 안내한다', async () => {
    const { errors, deps } = createDeps();

    const exitCode = await runCli(['inventory'], deps);

    expect(exitCode).toBe(1);
    expect(errors[0]).toContain('제품 ID가 필요합니다');
    expect(errors[0]).toContain('제품명만 알면 먼저 daiso products 수납박스');
  });

  it('inventory 명령은 알 수 없는 옵션을 거부한다', async () => {
    const { errors, deps } = createDeps();

    const exitCode = await runCli(['inventory', '1034604', '--store', '강남역점'], deps);

    expect(exitCode).toBe(1);
    expect(errors.join('\n')).toContain('알 수 없는 옵션: --store');
    expect(errors.join('\n')).toContain('매장명은 --keyword로 전달하세요');
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

  it('search 명령처럼 흔한 오입력은 대체 명령을 제안한다', async () => {
    const { errors, deps } = createDeps();

    const exitCode = await runCli(['search', '수납박스'], deps);

    expect(exitCode).toBe(1);
    expect(errors.join('\n')).toContain('알 수 없는 명령어: search');
    expect(errors.join('\n')).toContain('혹시 찾으신 명령: daiso products 수납박스');
  });

  it('직접 실행 여부를 올바르게 판별한다', () => {
    expect(isDirectExecution('', 'file:///tmp/test.js')).toBe(false);
    expect(isDirectExecution('/tmp/test.js', 'file:///tmp/test.js')).toBe(true);
    expect(isDirectExecution('/tmp/other.js', 'file:///tmp/test.js')).toBe(false);
  });
});
