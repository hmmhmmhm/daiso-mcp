/**
 * 도메인별 GET API 라우트 일괄 등록
 *
 * `src/index.ts` 의 길이 제한(450줄)을 유지하기 위해 분리했습니다.
 */

import type { Hono } from 'hono';
import type { AppBindings } from '../response.js';
import { registerCgvRoutes } from './cgvRoutes.js';
import { registerCompareRoutes } from './compareRoutes.js';
import { registerCuRoutes } from './cuRoutes.js';
import { registerDaisoRoutes } from './daisoRoutes.js';
import { registerDtryxRoutes } from './dtryxRoutes.js';
import { registerEmart24Routes } from './emart24Routes.js';
import { registerFeedbackRoutes } from './feedbackRoutes.js';
import { registerGs25Routes } from './gs25Routes.js';
import { registerLotteCinemaRoutes } from './lottecinemaRoutes.js';
import { registerLotteMartRoutes } from './lottemartRoutes.js';
import { registerMegaboxRoutes } from './megaboxRoutes.js';
import { registerOliveyoungRoutes } from './oliveyoungRoutes.js';
import { registerOpinetRoutes } from './opinetRoutes.js';
import { registerPlacesRoutes } from './placesRoutes.js';
import { registerSevenElevenRoutes } from './sevenelevenRoutes.js';

export function registerServiceRoutes(app: Hono<{ Bindings: AppBindings }>): void {
  registerDaisoRoutes(app);
  registerGs25Routes(app);
  registerSevenElevenRoutes(app);
  registerCompareRoutes(app);
  registerFeedbackRoutes(app);
  registerPlacesRoutes(app);
  registerOpinetRoutes(app);
  registerCuRoutes(app);
  registerEmart24Routes(app);
  registerLotteMartRoutes(app);
  registerOliveyoungRoutes(app);
  registerDtryxRoutes(app);
  registerMegaboxRoutes(app);
  registerLotteCinemaRoutes(app);
  registerCgvRoutes(app);
}
