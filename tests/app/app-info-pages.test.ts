/**
 * 앱 통합 테스트 - 기본/문서 페이지
 */

import { describe, it, expect, vi } from 'vitest';
import app from '../../src/index.js';
import { setupFetchMock } from './testHelpers.js';

const mockFetch = vi.fn();
setupFetchMock(mockFetch);

describe('GET /', () => {
  it('서버 정보를 반환한다', async () => {
    const res = await app.request('/');

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.name).toBe('multi-service-mcp');
    expect(data.version).toBe('1.0.0');
    expect(data.services).toBeDefined();
    expect(data.tools).toBeDefined();
    expect(data.totalServices).toBeGreaterThan(0);
    expect(data.totalTools).toBeGreaterThan(0);
  });

  it('다이소 서비스가 등록되어 있다', async () => {
    const res = await app.request('/');
    const data = await res.json();

    const daisoService = data.services.find((s: { id: string }) => s.id === 'daiso');
    expect(daisoService).toBeDefined();
    expect(daisoService.name).toBe('다이소');
  });

  it('올리브영 서비스가 등록되어 있다', async () => {
    const res = await app.request('/');
    const data = await res.json();

    const oliveyoungService = data.services.find((s: { id: string }) => s.id === 'oliveyoung');
    expect(oliveyoungService).toBeDefined();
    expect(oliveyoungService.name).toBe('올리브영');
  });

  it('CU 서비스가 등록되어 있다', async () => {
    const res = await app.request('/');
    const data = await res.json();

    const cuService = data.services.find((s: { id: string }) => s.id === 'cu');
    expect(cuService).toBeDefined();
    expect(cuService.name).toBe('CU 편의점');
  });

  it('GS25 서비스가 등록되어 있다', async () => {
    const res = await app.request('/');
    const data = await res.json();

    const gs25Service = data.services.find((s: { id: string }) => s.id === 'gs25');
    expect(gs25Service).toBeDefined();
    expect(gs25Service.name).toBe('GS25');
  });

  it('이마트24 서비스가 등록되어 있다', async () => {
    const res = await app.request('/');
    const data = await res.json();

    const emart24Service = data.services.find((s: { id: string }) => s.id === 'emart24');
    expect(emart24Service).toBeDefined();
    expect(emart24Service.name).toBe('이마트24');
  });

  it('롯데마트 서비스가 등록되어 있다', async () => {
    const res = await app.request('/');
    const data = await res.json();

    const lotteMartService = data.services.find((s: { id: string }) => s.id === 'lottemart');
    expect(lotteMartService).toBeDefined();
    expect(lotteMartService.name).toBe('롯데마트');
  });

  it('메가박스 서비스가 등록되어 있다', async () => {
    const res = await app.request('/');
    const data = await res.json();

    const megaboxService = data.services.find((s: { id: string }) => s.id === 'megabox');
    expect(megaboxService).toBeDefined();
    expect(megaboxService.name).toBe('메가박스');
  });

  it('CGV 서비스가 등록되어 있다', async () => {
    const res = await app.request('/');
    const data = await res.json();

    const cgvService = data.services.find((s: { id: string }) => s.id === 'cgv');
    expect(cgvService).toBeDefined();
    expect(cgvService.name).toBe('CGV');
  });

  it('롯데시네마 서비스가 등록되어 있다', async () => {
    const res = await app.request('/');
    const data = await res.json();

    const lotteCinemaService = data.services.find((s: { id: string }) => s.id === 'lottecinema');
    expect(lotteCinemaService).toBeDefined();
    expect(lotteCinemaService.name).toBe('롯데시네마');
  });

  it('세븐일레븐 서비스가 등록되어 있다', async () => {
    const res = await app.request('/');
    const data = await res.json();

    const sevenElevenService = data.services.find((s: { id: string }) => s.id === 'seveneleven');
    expect(sevenElevenService).toBeDefined();
    expect(sevenElevenService.name).toBe('세븐일레븐');
  });

  it('다이소 도구들이 포함되어 있다', async () => {
    const res = await app.request('/');
    const data = await res.json();

    expect(data.tools).toContain('daiso_search_products');
    expect(data.tools).toContain('daiso_find_stores');
    expect(data.tools).toContain('daiso_check_inventory');
    expect(data.tools).toContain('daiso_get_price_info');
  });

  it('올리브영 도구들이 포함되어 있다', async () => {
    const res = await app.request('/');
    const data = await res.json();

    expect(data.tools).toContain('oliveyoung_find_nearby_stores');
    expect(data.tools).toContain('oliveyoung_check_inventory');
  });

  it('CU 도구들이 포함되어 있다', async () => {
    const res = await app.request('/');
    const data = await res.json();

    expect(data.tools).toContain('cu_find_nearby_stores');
    expect(data.tools).toContain('cu_check_inventory');
  });

  it('GS25 도구들이 포함되어 있다', async () => {
    const res = await app.request('/');
    const data = await res.json();

    expect(data.tools).toContain('gs25_find_nearby_stores');
    expect(data.tools).toContain('gs25_search_products');
    expect(data.tools).toContain('gs25_check_inventory');
  });

  it('이마트24 도구들이 포함되어 있다', async () => {
    const res = await app.request('/');
    const data = await res.json();

    expect(data.tools).toContain('emart24_find_nearby_stores');
    expect(data.tools).toContain('emart24_search_products');
    expect(data.tools).toContain('emart24_check_inventory');
  });

  it('롯데마트 도구들이 포함되어 있다', async () => {
    const res = await app.request('/');
    const data = await res.json();

    expect(data.tools).toContain('lottemart_find_nearby_stores');
    expect(data.tools).toContain('lottemart_search_products');
  });

  it('메가박스 도구들이 포함되어 있다', async () => {
    const res = await app.request('/');
    const data = await res.json();

    expect(data.tools).toContain('megabox_find_nearby_theaters');
    expect(data.tools).toContain('megabox_list_now_showing');
    expect(data.tools).toContain('megabox_get_remaining_seats');
  });

  it('CGV 도구들이 포함되어 있다', async () => {
    const res = await app.request('/');
    const data = await res.json();

    expect(data.tools).toContain('cgv_find_theaters');
    expect(data.tools).toContain('cgv_search_movies');
    expect(data.tools).toContain('cgv_get_timetable');
  });

  it('롯데시네마 도구들이 포함되어 있다', async () => {
    const res = await app.request('/');
    const data = await res.json();

    expect(data.tools).toContain('lottecinema_find_nearby_theaters');
    expect(data.tools).toContain('lottecinema_list_now_showing');
    expect(data.tools).toContain('lottecinema_get_remaining_seats');
  });

  it('세븐일레븐 도구들이 포함되어 있다', async () => {
    const res = await app.request('/');
    const data = await res.json();

    expect(data.tools).toContain('seveneleven_search_products');
    expect(data.tools).toContain('seveneleven_search_stores');
    expect(data.tools).toContain('seveneleven_get_search_popwords');
    expect(data.tools).toContain('seveneleven_get_catalog_snapshot');
  });

  it('엔드포인트 정보를 포함한다', async () => {
    const res = await app.request('/');
    const data = await res.json();

    expect(data.endpoints).toBeDefined();
    expect(data.endpoints.mcp).toBeDefined();
    expect(data.endpoints.health).toBeDefined();
  });
});

describe('기본 페이지', () => {
  it('GET /health는 헬스 체크 응답을 반환한다', async () => {
    const res = await app.request('/health');

    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe('ok');
  });

  it('GET /prompt는 프롬프트 페이지를 반환한다', async () => {
    const res = await app.request('/prompt');

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/plain');

    const text = await res.text();
    expect(text).toContain('다이소 MCP API');
  });
});

describe('문서 페이지', () => {
  it('GET /openapi.json 응답을 반환한다', async () => {
    const res = await app.request('/openapi.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');

    const data = await res.json();
    expect(data.openapi).toBe('3.1.0');
  });

  it('GET /openapi.yaml 응답을 반환한다', async () => {
    const res = await app.request('/openapi.yaml');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/yaml');

    const text = await res.text();
    expect(text).toContain('openapi: 3.1.0');
  });

  it('GET /privacy 응답을 반환한다', async () => {
    const res = await app.request('/privacy');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');

    const text = await res.text();
    expect(text).toContain('개인정보 처리방침');
  });
});
