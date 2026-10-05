import { expect, test, vi } from 'vitest';
import { createCgvService } from '../../../src/services/cgv/index.js';
import { createMegaboxService } from '../../../src/services/megabox/index.js';
import { createLotteCinemaService } from '../../../src/services/lottecinema/index.js';
import * as cgv from '../../../src/api/cgvHandlers.js';
import * as mega from '../../../src/api/megaboxHandlers.js';
import * as lotte from '../../../src/api/lottecinemaHandlers.js';

vi.stubGlobal(
  'fetch',
  vi.fn(async () => {
    throw new Error('offline fetch should not run');
  }),
);
const invalid = [
  { playDate: '20260230' },
  { playDate: 'garbage' },
  { limit: -1 },
  { limit: 1.5 },
  { latitude: 91, longitude: 127 },
  { latitude: 37 },
  { latitude: 37, longitude: 181 },
];
for (const factory of [createCgvService, createMegaboxService, createLotteCinemaService]) {
  for (const tool of factory().getTools()) {
    test.each(invalid)(`${tool.name} rejects %j`, async (args) => {
      await expect(tool.handler(args)).rejects.toThrow(/입력|날짜|limit|좌표/);
    });
  }
}
for (const handler of [...Object.values(cgv), ...Object.values(mega), ...Object.values(lotte)]) {
  test.each([
    { playDate: '20260230' },
    { limit: '-1' },
    { limit: '2junk' },
    { limit: '' },
    { lat: 'NaN', lng: '127' },
    { lat: '91', lng: '127' },
    { lat: '37' },
  ])(`${handler.name} rejects %j`, async (args) => {
    const result = await handler({
      req: { query: (key: string) => args[key as keyof typeof args] },
      env: {},
      json: (body: unknown, status: number) => ({ body, status }),
    } as never);
    expect((result as unknown as { status: number }).status).toBe(400);
  });
}
