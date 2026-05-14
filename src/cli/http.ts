/**
 * HTTP 요청 및 응답 처리 유틸리티
 */

import { renderApiEnvelope } from '../cliRenderer.js';
import { buildDaisoStoreKeywordVariants } from '../utils/daisoKeyword.js';
import type { FetchLike, WriteFn } from './types.js';
import { applyOptionsToQuery, toUrl } from './args.js';

export async function requestAndPrintResponse(
  fetchImpl: FetchLike,
  writeOut: WriteFn,
  writeErr: WriteFn,
  url: URL,
  command: string,
  asJson: boolean,
): Promise<number> {
  try {
    const response = await fetchImpl(url.toString());

    if (!response.ok) {
      const bodyText = await response.text();
      writeErr(`요청 실패: HTTP ${response.status}`);
      if (bodyText) {
        writeErr(bodyText);
      }
      return 1;
    }

    const payload = (await response.json()) as unknown;
    if (asJson) {
      writeOut(JSON.stringify(payload, null, 2));
    } else {
      writeOut(renderApiEnvelope(command, url, payload));
    }
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeErr(`요청 중 오류 발생: ${message}`);
    return 1;
  }
}

function toStoreCount(payload: unknown): number {
  if (typeof payload !== 'object' || payload === null) {
    return 0;
  }
  const record = payload as { success?: unknown; data?: unknown };
  if (record.success !== true || typeof record.data !== 'object' || record.data === null) {
    return 0;
  }
  const stores = (record.data as { stores?: unknown }).stores;
  return Array.isArray(stores) ? stores.length : 0;
}

export async function requestAndPrintStoresWithKeywordFallback(
  fetchImpl: FetchLike,
  writeOut: WriteFn,
  writeErr: WriteFn,
  options: Record<string, string>,
  asJson: boolean,
): Promise<number> {
  const originalKeyword = options.keyword;
  if (!originalKeyword) {
    const url = toUrl('/api/daiso/stores');
    applyOptionsToQuery(url, options);
    return await requestAndPrintResponse(fetchImpl, writeOut, writeErr, url, 'stores', asJson);
  }

  const keywords = buildDaisoStoreKeywordVariants(originalKeyword);
  const candidates = keywords.length > 0 ? keywords : [originalKeyword];

  try {
    let lastUrl = toUrl('/api/daiso/stores');
    let lastPayload: unknown = null;

    for (const keyword of candidates) {
      const targetUrl = toUrl('/api/daiso/stores');
      applyOptionsToQuery(targetUrl, { ...options, keyword });
      lastUrl = targetUrl;

      const response = await fetchImpl(targetUrl.toString());
      if (!response.ok) {
        const bodyText = await response.text();
        writeErr(`요청 실패: HTTP ${response.status}`);
        if (bodyText) {
          writeErr(bodyText);
        }
        return 1;
      }

      const payload = (await response.json()) as unknown;
      lastPayload = payload;

      if (toStoreCount(payload) > 0) {
        if (keyword !== originalKeyword) {
          writeOut(`입력 키워드 "${originalKeyword}" 대신 "${keyword}"로 매장을 찾았습니다.`);
        }
        if (asJson) {
          writeOut(JSON.stringify(payload, null, 2));
        } else {
          writeOut(renderApiEnvelope('stores', targetUrl, payload));
        }
        return 0;
      }
    }

    if (asJson) {
      writeOut(JSON.stringify(lastPayload, null, 2));
    } else {
      writeOut(renderApiEnvelope('stores', lastUrl, lastPayload));
    }
    writeOut('힌트: "안산 중앙역" 대신 "안산중앙" 또는 "고잔"으로 검색해보세요.');
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeErr(`요청 중 오류 발생: ${message}`);
    return 1;
  }
}
