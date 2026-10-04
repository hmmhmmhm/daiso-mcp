/** 롯데마트 기존 주소에는 지원 종료 응답을 제공합니다. */
import type { Hono } from 'hono';
import { handleLotteMartFindStores } from '../lottemartHandlers.js';
import type { AppBindings } from '../response.js';
export function registerLotteMartRoutes(app: Hono<{ Bindings: AppBindings }>): void {
  for (const endpoint of ['stores', 'products', 'debug']) {
    app.get(`/api/lottemart/${endpoint}`, handleLotteMartFindStores);
  }
}
