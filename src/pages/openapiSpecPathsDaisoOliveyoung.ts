/**
 * OpenAPI 경로 정의 (다이소/올리브영)
 */

import { OPENAPI_PATHS_DAISO } from './openapiSpecPathsDaiso.js';
import { OPENAPI_PATHS_OLIVEYOUNG } from './openapiSpecPathsOliveyoung.js';

export const OPENAPI_PATHS_DAISO_OLIVEYOUNG = {
  ...OPENAPI_PATHS_DAISO,
  ...OPENAPI_PATHS_OLIVEYOUNG,
};
