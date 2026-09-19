import { describe, expect, it } from 'vitest';
import { buildConfigStatus } from '../../src/api/configStatus.js';

describe('Zyte 설정 상태', () => {
  it('키 설정 여부와 비용 정책에 따른 비활성화를 구분한다', () => {
    expect(buildConfigStatus({ ZYTE_API_KEY: 'test-key' }).zyteApiKey).toEqual({
      configured: true,
      enabled: false,
      usedBy: [],
    });
  });

  it('키가 없어도 유료 호출은 비활성화되어 있다', () => {
    expect(buildConfigStatus().zyteApiKey).toEqual({
      configured: false,
      enabled: false,
      usedBy: [],
    });
  });
});

describe('올리브영 릴레이 설정 상태', () => {
  it('미설정 상태는 값이나 연결 상태를 노출하지 않는다', () => {
    expect(buildConfigStatus().oliveyoungRelay).toEqual({
      configured: false,
      urlConfigured: false,
      urlValid: false,
      tokenConfigured: false,
      accessClientIdConfigured: false,
      accessClientSecretConfigured: false,
      accessConfigured: false,
      accessPairValid: true,
      usedBy: ['oliveyoung'],
    });
  });

  it.each([
    [{ OY_RELAY_URL: 'https://relay.example' }, false],
    [{ OY_RELAY_TOKEN: 'test-token' }, false],
    [{ OY_RELAY_URL: ' ', OY_RELAY_TOKEN: ' ' }, false],
    [{ OY_RELAY_URL: 'https://relay.example', OY_RELAY_TOKEN: 'test-token' }, true],
  ])('URL과 토큰의 완전성을 구분한다: %j', (bindings, configured) => {
    expect(buildConfigStatus(bindings).oliveyoungRelay.configured).toBe(configured);
  });

  it.each([
    ['https://relay.example', true],
    ['http://localhost:4319', true],
    ['http://127.0.0.1:4319/base', true],
    ['invalid', false],
    ['http://relay.example', false],
    ['ftp://localhost', false],
    ['https://user@relay.example', false],
    ['https://:password@relay.example', false],
    ['https://relay.example?token=secret', false],
    ['https://relay.example#fragment', false],
  ])('전송 계층과 같은 URL 규칙을 적용한다: %s', (url, valid) => {
    const status = buildConfigStatus({
      OY_RELAY_URL: url,
      OY_RELAY_TOKEN: 'test-token',
    }).oliveyoungRelay;
    expect(status.urlConfigured).toBe(true);
    expect(status.urlValid).toBe(valid);
    expect(status.configured).toBe(valid);
    expect(JSON.stringify(status)).not.toContain(url);
    expect(JSON.stringify(status)).not.toContain('test-token');
  });

  it.each([
    [undefined, undefined, false, true],
    ['test-id', undefined, false, false],
    [undefined, 'test-secret', false, false],
    ['', '', false, false],
    [' ', 'test-secret', false, false],
    ['test-id', ' ', false, false],
    ['test-id', 'test-secret', true, true],
  ])('선택적 Access 쌍의 완전성을 확인한다: %s/%s', (id, secret, configured, valid) => {
    const status = buildConfigStatus({
      OY_RELAY_URL: 'https://relay.example',
      OY_RELAY_TOKEN: 'test-token',
      OY_ACCESS_CLIENT_ID: id,
      OY_ACCESS_CLIENT_SECRET: secret,
    }).oliveyoungRelay;
    expect(status.accessClientIdConfigured).toBe(Boolean(id?.trim()));
    expect(status.accessClientSecretConfigured).toBe(Boolean(secret?.trim()));
    expect(status.accessConfigured).toBe(configured);
    expect(status.accessPairValid).toBe(valid);
    expect(status.configured).toBe(valid);
    expect(JSON.stringify(status)).not.toContain('test-secret');
  });
});
