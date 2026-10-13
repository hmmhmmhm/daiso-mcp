/** 외부 API의 응답 대신 공급자 쿼터 차단 시각만 SQLite에 남깁니다. */
import type { AppBindings } from '../api/response.js';
import { GeocodeGate } from '../utils/geocodeGate.js';
import {
  validGeocodeRequest,
  validGeocodeCredentials,
  configuredGeocodeCredentials,
  geocodeScope,
  requestGeocodeProvider,
} from '../utils/geocodeProvider.js';
export class GeocodeGateway {
  private readonly gate: GeocodeGate;
  constructor(
    state: DurableObjectState,
    private readonly env: AppBindings,
  ) {
    this.gate = new GeocodeGate({
      get: (key) => state.storage.get<number>(key),
      put: (key, value) => state.storage.put(key, value),
    });
  }
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/lookup')
      return new Response(null, { status: 404 });
    let input: unknown;
    try {
      const text = await request.text();
      if (text.length > 4096) return new Response(null, { status: 400 });
      input = JSON.parse(text);
    } catch {
      return new Response(null, { status: 400 });
    }
    if (!validGeocodeRequest(input)) return new Response(null, { status: 400 });
    const credentials = configuredGeocodeCredentials(input.provider, this.env);
    if (!validGeocodeCredentials(credentials) || input.scope !== (await geocodeScope(credentials)))
      return new Response(null, { status: 403 });
    try {
      const reply = await this.gate.run(
        input.scope,
        input.provider,
        JSON.stringify(Object.entries(input.params).sort()),
        input.timeoutMs,
        () => requestGeocodeProvider(input, credentials, fetch),
      );
      return Response.json(reply);
    } catch {
      return Response.json({ code: 'GEOCODE_GATEWAY_UNAVAILABLE' }, { status: 503 });
    }
  }
}
