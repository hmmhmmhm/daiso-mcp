import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestByZyte } from '../../src/utils/zyte.js';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('requestByZyte', () => {
  it('AbortError가 발생하면 한 번 재시도한다', async () => {
    mockFetch
      .mockRejectedValueOnce(new DOMException('aborted', 'AbortError'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ statusCode: 200, httpResponseBody: 'e30=' })));

    const result = await requestByZyte({
      apiKey: 'test-key',
      url: 'https://example.com/api',
      timeout: 1000,
      retryDelayMs: 0,
    });

    expect(result.statusCode).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
