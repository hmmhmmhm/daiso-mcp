/** 편의점의 파일 원장과 캐시·진행 요청 병합을 함께 검증합니다. */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { createConvenienceRelay } from '../../scripts/relay/convenience.js';
import { CONVENIENCE_QUOTA_LIMITS, createFileQuota } from '../../scripts/relay/quota.js';

it('분당 69회 원본 호출 후에도 캐시는 응답하며 최초 동시 조회는 한 번만 차감한다', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'convenience-quota-'));
  try {
    let now = Date.UTC(2026, 9, 5);
    const path = join(directory, 'quota.json');
    const takeQuota = await createFileQuota(path, () => now, CONVENIENCE_QUOTA_LIMITS);
    const fetcher = vi.fn(async () => Response.json({ SearchQueryResult: {} }));
    const relay = createConvenienceRelay('test-token', { takeQuota, fetcher });
    const request = (index: number) => new Request('http://localhost/v1/convenience/gs25-products', {
      method: 'POST', headers: { Authorization: 'Bearer test-token' }, body: JSON.stringify({ query: `item${index}` }),
    });
    const responses = await Promise.all(Array.from({ length: 8 }, () => relay(request(0))));
    expect(responses.every(response => response.status === 200)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    for (let index = 1; index < 69; index++) expect((await relay(request(index))).status).toBe(200);
    expect((await relay(request(0))).status).toBe(200);
    const denied = await relay(request(69));
    expect(denied.status).toBe(429);
    expect(denied.headers.get('x-relay-quota-reason')).toBe('minute');
    expect(denied.headers.get('Retry-After')).toBe('60');
    expect(fetcher).toHaveBeenCalledTimes(69);
    expect(JSON.parse(await readFile(path, 'utf8')).dayCount).toBe(69);
    now += 60000;
    expect((await relay(request(69))).status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(70);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
