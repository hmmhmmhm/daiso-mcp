import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  browser: vi.fn(() => 'browser'),
  http: vi.fn(() => 'http'),
  launch: vi.fn(),
}));
vi.mock('../../scripts/relay/lifecycle.js', () => ({ createBrowserLifecycle: mocks.browser }));
vi.mock('../../scripts/relay/http-lifecycle.js', () => ({ createHttpLifecycle: mocks.http }));
vi.mock('../../scripts/relay/supervisor.js', () => ({ launchGuardedBrowser: mocks.launch }));
import { createTransportLifecycle } from '../../scripts/relay/transport-lifecycle.js';
it('defaults to the existing browser lifecycle and forwards observer/ownership path', async () => {
  const observer = vi.fn();
  expect(await createTransportLifecycle(undefined, '/state', observer)).toBe('browser');
  const [launch, observed] = mocks.browser.mock.calls[0] as unknown as [() => unknown, unknown];
  launch();
  expect(mocks.launch).toHaveBeenCalledWith('/state/browser-owner.json');
  expect(observed).toBe(observer);
});
it('selects HTTP without importing or launching browser modules', async () => {
  mocks.browser.mockClear();
  mocks.launch.mockClear();
  expect(await createTransportLifecycle('http', '/state')).toBe('http');
  expect(mocks.browser).not.toHaveBeenCalled();
  expect(mocks.launch).not.toHaveBeenCalled();
});
it('accepts explicit browser and rejects unknown transport', async () => {
  expect(await createTransportLifecycle('browser', '/state')).toBe('browser');
  await expect(createTransportLifecycle('bogus', '/state')).rejects.toThrow('OY_RELAY_TRANSPORT');
});
