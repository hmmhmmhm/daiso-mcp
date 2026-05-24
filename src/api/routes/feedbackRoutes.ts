import type { Hono } from 'hono';
import type { AppBindings } from '../response.js';
import { handleSubmitDeveloperRequest } from '../feedbackHandlers.js';

export function registerFeedbackRoutes(app: Hono<{ Bindings: AppBindings }>): void {
  app.post('/api/feedback/requests', handleSubmitDeveloperRequest);
  app.get('/api/feedback/requests', handleSubmitDeveloperRequest);
}
