import { expect, it, vi } from 'vitest';
import { createConvenienceRelay } from '../../scripts/relay/convenience.js';
import { requestConvenienceRelay } from '../../src/utils/convenienceTransport.js';
import { ServiceError, toServiceErrorDiagnostics } from '../../src/core/errors.js';

const message = '정상적인 점포 조회 요청이 아닙니다.';
const hint = '일시적인 외부 서비스 오류입니다. 잠시 후 재시도해주세요.';
const body = {
  smCd: '1',
  stokMngCd: '1',
  stokMngQty: 1,
  stockApplicationRate: '100',
  storeList: ['a', 'b'],
};
it('원본의 점포 조회 거부 문구와 상태를 중계·Worker·MCP 공통 진단까지 전달한다', async () => {
  const relay = createConvenienceRelay('token', {
    takeQuota: async () => true,
    fetcher: async () =>
      Response.json({ success: false, message, code: 501, secret: 'hidden' }, { status: 400 }),
  });
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => relay(new Request(url, init)));
  try {
    await requestConvenienceRelay('seven-stock', body, {
      convenienceRelayUrl: 'https://relay.example',
      convenienceRelayToken: 'token',
    });
    expect.fail('조회 거부가 성공으로 반환되면 안 됩니다.');
  } catch (error) {
    expect(error).toBeInstanceOf(ServiceError);
    expect(toServiceErrorDiagnostics(error as ServiceError, 'seveneleven_request')).toMatchObject({
      message: `${message} ${hint}`,
      status: 502,
      upstreamStatus: 400,
      upstreamCode: 501,
      upstreamMessage: message,
      retryable: false,
      hint,
    });
    expect(JSON.stringify(error)).not.toContain('hidden');
  } finally {
    vi.unstubAllGlobals();
  }
});
it.each(['token=private', '<html>secret</html>'])(
  '알 수 없는 원문은 공개하지 않는다: %s',
  async (message) => {
    const relay = createConvenienceRelay('token', {
      takeQuota: async () => true,
      fetcher: async () => Response.json({ success: false, message, code: 501 }, { status: 400 }),
    });
    const response = await relay(
      new Request('http://localhost/v1/convenience/seven-stock', {
        method: 'POST',
        headers: { Authorization: 'Bearer token' },
        body: JSON.stringify(body),
      }),
    );
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain(message);
  },
);
import { parseSevenStockFailure } from '../../src/utils/sevenStockFailure.js';
it.each([
  null,
  1,
  {},
  { status: 500 },
  { status: 400, code: 500 },
  { status: 400, code: 501, message: 'private' },
])('검증되지 않은 원본 진단은 제외한다 %j', (value) => {
  expect(parseSevenStockFailure(value)).toBeUndefined();
});
it.each([
  null,
  1,
  {},
  { upstreamError: { status: 400, code: 501, message: 'private' } },
  'invalid JSON',
])('중계의 잘못된 오류 본문은 일반 오류로 처리한다 %j', async (value) => {
  vi.stubGlobal('fetch', async () =>
    typeof value === 'string'
      ? new Response(value, { status: 502 })
      : Response.json(value, { status: 502 }),
  );
  try {
    await expect(
      requestConvenienceRelay('seven-stock', body, {
        convenienceRelayUrl: 'https://relay.example',
        convenienceRelayToken: 'token',
      }),
    ).rejects.toMatchObject({ message: '편의점 릴레이 요청에 실패했습니다.', status: 502 });
  } finally {
    vi.unstubAllGlobals();
  }
});
it('원본 400의 오류 형식이 다르면 본문을 전달하지 않는다', async () => {
  const relay = createConvenienceRelay('token', {
    takeQuota: async () => true,
    fetcher: async () => Response.json({ message: 'private' }, { status: 400 }),
  });
  const response = await relay(
    new Request('http://localhost/v1/convenience/seven-stock', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
      body: JSON.stringify(body),
    }),
  );
  expect(await response.json()).toEqual({ error: 'Relay request failed' });
});
it('원본 조회 거부는 HTTP 중계 오류 페이지 대신 실패 envelope로 전달한다', async () => {
  const relay = createConvenienceRelay('token', {
    takeQuota: async () => true,
    fetcher: async () => Response.json({ success: false, message, code: 501 }, { status: 400 }),
  });
  const response = await relay(
    new Request('http://localhost/v1/convenience/seven-stock', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
      body: JSON.stringify(body),
    }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    success: false,
    upstreamError: { status: 400, code: 501, message },
  });
});
it.each([null, 1, {}, { upstreamError: { status: 400, code: 501, message: 'private' } }])(
  '정상 HTTP에서도 검증되지 않은 진단을 전달하지 않는다 %j',
  async (value) => {
    vi.stubGlobal('fetch', async () => Response.json(value));
    try {
      if (!value || typeof value !== 'object')
        await expect(
          requestConvenienceRelay('seven-stock', body, {
            convenienceRelayUrl: 'https://relay.example',
            convenienceRelayToken: 'token',
          }),
        ).rejects.toThrow('실패');
      else
        expect(
          await requestConvenienceRelay('seven-stock', body, {
            convenienceRelayUrl: 'https://relay.example',
            convenienceRelayToken: 'token',
          }),
        ).toEqual(value);
    } finally {
      vi.unstubAllGlobals();
    }
  },
);
it('구버전 중계의 HTTP 502 원본 진단도 보존한다', async () => {
  vi.stubGlobal('fetch', async () =>
    Response.json(
      { error: 'Relay request failed', upstreamError: { status: 400, code: 501, message } },
      { status: 502 },
    ),
  );
  try {
    await expect(
      requestConvenienceRelay('seven-stock', body, {
        convenienceRelayUrl: 'https://relay.example',
        convenienceRelayToken: 'token',
      }),
    ).rejects.toMatchObject({ upstreamStatus: 400, retryable: false });
  } finally {
    vi.unstubAllGlobals();
  }
});
