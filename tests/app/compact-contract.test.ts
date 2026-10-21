import { expect, it } from 'vitest';
import app from '../../src/index.js';
import { PUBLIC_TOOL_NAMES } from '../../src/core/compact/catalog.js';
function request(path: string, method: string, params?: unknown) {
  return app.fetch(
    new Request('https://local.test' + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }),
  );
}
it('루트 공개 목록과 발견 정보는 통합 도구10개만 표시한다', async () => {
  const root = await (await app.request('/root.json')).json();
  expect(root.totalTools).toBe(10);
  expect(root.tools).toEqual([...PUBLIC_TOOL_NAMES]);
  expect(
    root.services
      .flatMap((s: { tools: string[] }) => s.tools)
      .every((name: string) => PUBLIC_TOOL_NAMES.includes(name)),
  ).toBe(true);
  const r = await request('/', 'tools/list', {});
  expect(r.status).toBe(200);
  const line = (await r.text()).split('\n').find((l) => l.startsWith('data: '))!;
  const j = JSON.parse(line.slice(6));
  expect(j.result.tools.map((t: { name: string }) => t.name)).toEqual([...PUBLIC_TOOL_NAMES]);
  expect(
    JSON.stringify(
      j.result.tools.find((t: { name: string }) => t.name === 'submit_request').inputSchema,
    ),
  ).not.toContain('"propertyNames"');
  expect(
    j.result.tools.find((t: { name: string }) => t.name === 'submit_request').inputSchema.properties
      .request.properties.userContext,
  ).toBeDefined();
});
