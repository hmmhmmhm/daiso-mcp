import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const exec = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ execFile: exec }));
import { createHttpLifecycle } from '../../scripts/relay/http-lifecycle.js';
let child: EventEmitter & { stdin: PassThrough; kill: ReturnType<typeof vi.fn> };
let done: (error: Error | null, stdout: string) => void;
beforeEach(() => {
  exec.mockReset();
  exec.mockImplementation((_command, _args, _options, callback) => {
    done = callback;
    child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      kill: vi.fn(() => {
        callback(new Error('secret'), '');
        return true;
      }),
    });
    return child;
  });
});
afterEach(() => vi.unstubAllEnvs());
async function ready() {
  const lifecycle = createHttpLifecycle();
  const start = lifecycle.start();
  done(null, '{"ready":true}');
  await start;
  return lifecycle;
}
it('checks Python in isolated mode with an allowlisted environment and no browser', async () => {
  vi.stubEnv('OY_RELAY_TOKEN', 'secret');
  vi.stubEnv('PYTHONPATH', 'secret');
  vi.stubEnv('OY_HTTP_PYTHON', '/usr/bin/python3');
  const lifecycle = await ready();
  expect(exec.mock.calls[0][0]).toBe('/usr/bin/python3');
  expect(exec.mock.calls[0][1]).toEqual([
    '-I',
    expect.stringContaining('oliveyoung-http.py'),
    '--check',
  ]);
  expect(exec.mock.calls[0][2]).toMatchObject({ timeout: 18000, maxBuffer: 2 * 1024 * 1024 });
  expect(exec.mock.calls[0][2].env).not.toHaveProperty('OY_RELAY_TOKEN');
  expect(exec.mock.calls[0][2].env).not.toHaveProperty('PYTHONPATH');
  expect(lifecycle.status()).toMatchObject({
    state: 'ready',
    transport: 'http',
    browserRequired: false,
    pages: 0,
    calls: 0,
  });
  await lifecycle.start();
  expect(exec).toHaveBeenCalledTimes(1);
  await lifecycle.close();
});
it('sends only path/body over stdin and counts successful calls', async () => {
  const lifecycle = await ready();
  const call = lifecycle.run('/oystore/api/stock/stock-stores', { productId: 'x' });
  expect(lifecycle.status().active).toBe(true);
  expect(child.stdin.read().toString()).toBe(
    JSON.stringify({ path: '/oystore/api/stock/stock-stores', body: { productId: 'x' } }),
  );
  await expect(lifecycle.run('x', {})).rejects.toThrow('active');
  done(null, '{"status":"SUCCESS","data":{}}');
  await expect(call).resolves.toEqual({ status: 'SUCCESS', data: {} });
  expect(lifecycle.status()).toMatchObject({ active: false, calls: 1, totalCalls: 1 });
  await lifecycle.close();
});
it.each([
  'bad JSON',
  '{"status":"ERROR","data":{}}',
  '{"status":"SUCCESS","data":[]}',
  '{"status":"SUCCESS"}',
  'null',
])('rejects malformed helper output: %s', async (output) => {
  const lifecycle = await ready();
  const call = lifecycle.run('x', {});
  done(null, output);
  await expect(call).rejects.toThrow('HTTP relay request failed');
  expect(lifecycle.status()).toMatchObject({ active: false, calls: 1, totalCalls: 1 });
  await lifecycle.close();
});
it('hides child failures, including timeout and response overflow', async () => {
  const lifecycle = await ready();
  const call = lifecycle.run('x', {});
  done(new Error('secret body'), 'secret body');
  await expect(call).rejects.toThrow(/^HTTP relay request failed$/);
  await lifecycle.close();
});
it.each([null, new Error('missing python')])(
  'rejects startup failures without leaking output',
  async (error) => {
    const lifecycle = createHttpLifecycle();
    expect(lifecycle.status().state).toBe('starting');
    const start = lifecycle.start();
    done(error, 'secret');
    await expect(start).rejects.toThrow(/^HTTP relay request failed$/);
    await lifecycle.close();
  },
);
it('kills an in-flight child and prevents later calls or starts', async () => {
  const lifecycle = await ready();
  const call = lifecycle.run('x', {});
  const rejection = expect(call).rejects.toThrow();
  await lifecycle.close();
  await rejection;
  expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  expect(lifecycle.status().state).toBe('closed');
  await expect(lifecycle.run('x', {})).rejects.toThrow('closed');
  await expect(lifecycle.start()).rejects.toThrow('closed');
  await lifecycle.close();
});
it('rejects requests before startup', async () => {
  const lifecycle = createHttpLifecycle();
  await expect(lifecycle.run('x', {})).rejects.toThrow('ready');
  await lifecycle.close();
});
it('shares a pending startup and can close while starting', async () => {
  const lifecycle = createHttpLifecycle();
  const start = lifecycle.start();
  const another = lifecycle.start();
  const caught = Promise.allSettled([start, another]);
  expect(exec).toHaveBeenCalledTimes(1);
  await lifecycle.close();
  expect((await caught).every((result) => result.status === 'rejected')).toBe(true);
});
it('does not become ready when closed immediately after startup output', async () => {
  const lifecycle = createHttpLifecycle();
  const start = lifecycle.start();
  const rejection = expect(start).rejects.toThrow('closed');
  done(null, '{"ready":true}');
  await lifecycle.close();
  await rejection;
  expect(lifecycle.status().state).toBe('closed');
});
it('bounds serialized input before launching a request', async () => {
  const lifecycle = await ready();
  await expect(lifecycle.run('x', { value: 'x'.repeat(2 * 1024 * 1024) })).rejects.toThrow(
    'HTTP relay request failed',
  );
  expect(exec).toHaveBeenCalledTimes(1);
  await lifecycle.close();
});
it('kills the helper on a broken input pipe', async () => {
  const lifecycle = await ready();
  const call = lifecycle.run('x', {});
  const rejection = expect(call).rejects.toThrow('HTTP relay request failed');
  child.stdin.emit('error', new Error('private'));
  await rejection;
  expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  await lifecycle.close();
});
it('sanitizes serialization and synchronous spawn failures', async () => {
  const lifecycle = await ready();
  await expect(lifecycle.run('x', { value: 1n })).rejects.toThrow('HTTP relay request failed');
  exec.mockImplementationOnce(() => {
    throw new Error('private path');
  });
  await expect(lifecycle.run('x', {})).rejects.toThrow('HTTP relay request failed');
  await lifecycle.close();
});
it('uses a system executable search path when PATH is absent', async () => {
  vi.stubEnv('PATH', '');
  const lifecycle = await ready();
  expect(exec.mock.calls[0][2].env).toEqual({ PATH: '/usr/bin:/bin' });
  await lifecycle.close();
});
it('rejects a null startup envelope', async () => {
  const lifecycle = createHttpLifecycle();
  const start = lifecycle.start();
  done(null, 'null');
  await expect(start).rejects.toThrow('HTTP relay request failed');
  await lifecycle.close();
});
it('ignores input pipe errors after the child has already exited', async () => {
  const lifecycle = await ready();
  const call = lifecycle.run('x', {});
  const stdin = child.stdin;
  done(null, '{"status":"SUCCESS","data":{}}');
  stdin.emit('error', new Error('private'));
  await call;
  await lifecycle.close();
});
