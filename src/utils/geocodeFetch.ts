/** REST와 MCP에 같은 공급자 보호를 적용하고 좌표 결과는 캐시하지 않습니다. */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { AppBindings } from '../api/response.js';
import { GeocodeGate, type GeocodeReply } from './geocodeGate.js';
import {
  geocodeProvider,
  geocodeScope,
  geocodeCredentials,
  configuredGeocodeCredentials,
  validGeocodeCredentials,
  validGeocodeRequest,
  requestGeocodeProvider,
  waitGeocode,
  type GeocodeRequest,
} from './geocodeProvider.js';
const context = new AsyncLocalStorage<Partial<AppBindings>>();
const gates = new WeakMap<typeof fetch, GeocodeGate>();
export function withGeocodeProtection<T>(env: Partial<AppBindings> | undefined, work: () => T): T {
  return env?.GEOCODE_GATEWAY ? context.run(env, work) : context.exit(work);
}
function replyResponse(reply: GeocodeReply): Response {
  if (![204, 205, 304].includes(reply.status))
    return Response.json(reply.body, { status: reply.status });
  return new Response(null, { status: reply.status });
}
export function createGeocodeFetch(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10000,
): typeof fetch {
  const budget = Number.isFinite(timeoutMs)
    ? Math.max(1, Math.min(20000, Math.trunc(timeoutMs)))
    : 10000;
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const provider = geocodeProvider(url);
    if (!provider) return fetchImpl(input, init);
    if (
      url.username ||
      url.password ||
      (init?.method || (input instanceof Request ? input.method : 'GET')) !== 'GET'
    )
      throw new Error('GEOCODE_INVALID_REQUEST');
    const headers = new Headers(
      init?.headers || (input instanceof Request ? input.headers : undefined),
    );
    const credentials = geocodeCredentials(provider, headers);
    if (!validGeocodeCredentials(credentials)) throw new Error('GEOCODE_INVALID_CREDENTIAL');
    const signal = init?.signal || (input instanceof Request ? input.signal : undefined);
    if (signal?.aborted) throw new Error('GEOCODE_CANCELLED');
    const row: GeocodeRequest = {
      provider,
      params: Object.fromEntries(url.searchParams),
      scope: await geocodeScope(credentials),
      timeoutMs: budget,
    };
    if (!validGeocodeRequest(row)) throw new Error('GEOCODE_INVALID_REQUEST');
    if (signal?.aborted) throw new Error('GEOCODE_CANCELLED');
    const env = context.getStore();
    const configured = env && configuredGeocodeCredentials(provider, env);
    let work: Promise<GeocodeReply>;
    if (env?.GEOCODE_GATEWAY && configured?.every((key, index) => key === credentials[index])) {
      work = (async () => {
        const ns = env.GEOCODE_GATEWAY!;
        const response = await ns
          .get(ns.idFromName('geocode-gateway-v1'))
          .fetch('https://geocode.internal/lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(row),
            signal: AbortSignal.timeout(budget),
          });
        if (!response.ok) throw new Error('GEOCODE_GATEWAY_UNAVAILABLE');
        const packet = (await response.json()) as GeocodeReply;
        if (
          !packet ||
          !Number.isInteger(packet.status) ||
          packet.status < 200 ||
          packet.status > 599 ||
          !Object.hasOwn(packet, 'body')
        )
          throw new Error('GEOCODE_INVALID_RESPONSE');
        return packet;
      })();
    } else {
      let gate = gates.get(fetchImpl);
      if (!gate) {
        gate = new GeocodeGate();
        gates.set(fetchImpl, gate);
      }
      work = gate.run(
        row.scope,
        provider,
        JSON.stringify(Object.entries(row.params).sort()),
        budget,
        () => requestGeocodeProvider(row, credentials, fetchImpl),
      );
    }
    return replyResponse(await waitGeocode(work, budget, signal));
  };
}
