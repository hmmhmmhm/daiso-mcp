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
