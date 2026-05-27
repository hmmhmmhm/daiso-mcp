import { describe, expect, it, vi } from 'vitest';
import app from '../../src/index.js';
import { setupFetchMock } from './testHelpers.js';

const mockFetch = vi.fn();
setupFetchMock(mockFetch);

describe('GET /api/opinet', () => {
  it('전국 평균 유가 API를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ RESULT: { OIL: [{ PRODCD: 'B027', PRODNM: '휘발유', PRICE: '1667' }] } })),
    );

    const res = await app.request('/api/opinet/average', undefined, { OPINET_API_KEY: 'key' });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.prices[0].productName).toBe('휘발유');
  });

  it('최저가 주유소 API를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ RESULT: { OIL: [{ UNI_ID: 'A1', OS_NM: '주유소', PRICE: '1600' }] } })),
    );

    const res = await app.request('/api/opinet/lowest?prodcd=B027&area=0113&cnt=1&timeoutMs=1000', undefined, {
      OPINET_API_KEY: 'key',
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.stations[0].name).toBe('주유소');
  });

  it('반경 내 주유소 API는 KATEC 좌표를 요구한다', async () => {
    const res = await app.request('/api/opinet/stations/around?x=bad&y=1');
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe('MISSING_KATEC_COORDINATES');
  });

  it('반경 내 주유소 API를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ RESULT: { OIL: [{ UNI_ID: 'A1', OS_NM: '주유소', DISTANCE: '10' }] } })),
    );

    const res = await app.request('/api/opinet/stations/around?x=314681.8&y=544837&radius=1000&prodcd=B027&sort=distance', undefined, {
      OPINET_API_KEY: 'key',
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.sort).toBe('distance');
  });

  it('주유소 상세 API는 stationId를 요구한다', async () => {
    const res = await app.request('/api/opinet/station');
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error.code).toBe('MISSING_STATION_ID');
  });

  it('주유소 상세 API를 반환한다', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ RESULT: { OIL: [{ UNI_ID: 'A1', OS_NM: '주유소', TEL: '02' }] } })),
    );

    const res = await app.request('/api/opinet/station?id=A1', undefined, { OPINET_API_KEY: 'key' });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.station.phone).toBe('02');
  });

  it('주유소 상세 API는 결과가 없어도 빈 상세 결과를 반환한다', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ RESULT: {} })));

    const res = await app.request('/api/opinet/station?stationId=A0&timeoutMs=1000', undefined, {
      OPINET_API_KEY: 'key',
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.station).toBeNull();
    expect(data.meta.total).toBe(0);
  });

  it('키가 없으면 설정 오류를 반환한다', async () => {
    const res = await app.request('/api/opinet/average');
    const data = await res.json();

    expect(res.status).toBe(500);
    expect(data.error.code).toBe('OPINET_AVERAGE_FAILED');
    expect(data.error.message).toContain('OPINET_API_KEY');
  });

  it('최저가/반경/상세 조회 실패를 API 오류로 반환한다', async () => {
    const lowest = await app.request('/api/opinet/lowest?fuelCode=BAD', undefined, {
      OPINET_API_KEY: 'key',
    });
    const around = await app.request('/api/opinet/stations/around?x=1&y=2&fuelCode=BAD', undefined, {
      OPINET_API_KEY: 'key',
    });
    const detail = await app.request('/api/opinet/station?id=A1');

    expect(lowest.status).toBe(500);
    expect((await lowest.json()).error.code).toBe('OPINET_LOWEST_FAILED');
    expect(around.status).toBe(500);
    expect((await around.json()).error.code).toBe('OPINET_AROUND_FAILED');
    expect(detail.status).toBe(500);
    expect((await detail.json()).error.code).toBe('OPINET_DETAIL_FAILED');
  });
});
