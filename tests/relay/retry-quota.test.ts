/** 재시도도 실제 중계 입구의 파일 원장을 소비하는지 확인합니다. */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { createConvenienceRelay } from '../../scripts/relay/convenience.js';
import { CONVENIENCE_QUOTA_LIMITS, createFileQuota } from '../../scripts/relay/quota.js';
import { requestConvenienceRelay } from '../../src/utils/convenienceTransport.js';

it('GS 읽기 재시도는 원장을 두 번 소비하고 후속 캐시 조회는 소비하지 않는다', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'relay-retry-quota-'));
  const path = join(directory, 'quota.json');
  const upstream = vi.fn()
    .mockResolvedValueOnce(new Response('', { status: 503 }))
    .mockResolvedValueOnce(Response.json({ SearchQueryResult: {} }));
  const quota = await createFileQuota(path, Date.now, CONVENIENCE_QUOTA_LIMITS);
  const relay = createConvenienceRelay('test-token', { takeQuota: quota, fetcher: upstream });
  vi.stubGlobal('fetch', async (url: string, options?: RequestInit) => relay(new Request(url, options)));
  try {
    const options = { convenienceRelayUrl: 'https://relay.example', convenienceRelayToken: 'test-token' };
    expect(await requestConvenienceRelay('gs25-products', { query: 'cola' }, options))
      .toEqual({ SearchQueryResult: {} });
    expect(upstream).toHaveBeenCalledTimes(2);
    expect(JSON.parse(await readFile(path, 'utf8')).dayCount).toBe(2);
    expect(await requestConvenienceRelay('gs25-products', { query: 'cola' }, options))
      .toEqual({ SearchQueryResult: {} });
    expect(upstream).toHaveBeenCalledTimes(2);
    expect(JSON.parse(await readFile(path, 'utf8')).dayCount).toBe(2);
  } finally {
    vi.unstubAllGlobals();
    await rm(directory, { recursive: true, force: true });
  }
});
