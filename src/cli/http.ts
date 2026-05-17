/**
 * HTTP 요청 및 응답 처리 유틸리티
 */

import { renderApiEnvelope } from '../cliRenderer.js';
import { buildDaisoStoreKeywordVariants } from '../utils/daisoKeyword.js';
import type { FetchLike, WriteFn } from './types.js';
import { applyOptionsToQuery, toUrl } from './args.js';

function parseErrorCode(bodyText: string): string {
  try {
    const parsed = JSON.parse(bodyText) as { error?: { code?: unknown } };
    return typeof parsed.error?.code === 'string' ? parsed.error.code : '';
  } catch {
    return '';
  }
}

function buildCliHint(command: string, url: URL, bodyText: string): string[] {
  if (command !== 'get') {
    return [];
  }

  const code = parseErrorCode(bodyText);
  if (url.pathname === '/api/daiso/inventory' || code === 'MISSING_PRODUCT_ID') {
    return [
      '힌트: 제품명만 알면 먼저 daiso products <상품명> 명령으로 productId를 확인하세요.',
      '다음 명령 예시: daiso inventory <productId> --keyword 강남역',
    ];
  }

  if (url.pathname === '/api/daiso/products') {
    return ['힌트: 제품 검색은 daiso products <상품명> 명령을 사용할 수 있습니다.'];
  }

  if (url.pathname === '/api/daiso/display-location' || code === 'MISSING_STORE_CODE') {
    return [
      '힌트: storeCode는 daiso inventory <productId> --keyword <매장명> 결과에서 확인하세요.',
      '다음 명령 예시: daiso display-location <productId> <storeCode>',
    ];
  }

  if (url.pathname === '/api/lottemart/products') {
    return [
      '힌트: 롯데마트 상품 조회는 매장 정보가 필요합니다.',
      '다음 명령 예시: daiso lottemart-products <상품명> --storeName <매장명>',
    ];
  }

  if (url.pathname === '/api/gs25/inventory') {
    return [
      '힌트: GS25 상품명만 알면 daiso gs25-inventory <상품명> --storeKeyword <매장명> 명령을 사용하세요.',
      'itemCode만 알면 daiso gs25-inventory <itemCode> 형식 대신 daiso get /api/gs25/inventory --itemCode <itemCode> --storeKeyword <매장명> 을 사용하세요.',
    ];
  }

  if (url.pathname === '/api/emart24/inventory') {
    return [
      '힌트: 이마트24 상품명만 알면 daiso emart24-products <상품명> 명령으로 pluCd를 확인하세요.',
      '다음 명령 예시: daiso emart24-inventory <pluCd> --storeKeyword 강남',
    ];
  }

  if (url.pathname === '/api/seveneleven/inventory') {
    return [
      '힌트: 세븐일레븐 재고는 매장 키워드가 필요합니다.',
      '다음 명령 예시: daiso get /api/seveneleven/inventory --keyword <상품명> --storeKeyword 강남',
    ];
  }

  return [];
}

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
        for (const hint of buildCliHint(command, url, bodyText)) {
          writeErr(hint);
        }
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
