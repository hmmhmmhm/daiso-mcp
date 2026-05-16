/**
 * CLI 인터랙티브 모드
 *
 * 좌표 입력 없이 서비스/매장/상품을 순차 선택해 재고를 확인합니다.
 */

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { pickFromList } from './cliPicker.js';
import { fetchEnvelope, fetchStoresWithKeywordFallback } from './cli/interactiveFetch.js';
import { askMenu, askNextAction, askNonEmpty, askYesNo, printStoreDetail } from './cli/interactivePrompt.js';
import type { InteractiveCliDeps, InteractivePrompt } from './cli/interactiveTypes.js';
import {
  parseLotteCinemaTheaters,
  printTheaterDetail,
  runCuItemSearch,
  runDaisoItemSearch,
  runLotteCinemaSearch,
  runOliveyoungItemSearch,
} from './cli/interactiveItemSearch.js';
import { buildDaisoStoreKeywordVariants, isRecord, parseDaisoProducts, parseStores, toText } from './utils/cliInteractiveHelpers.js';

export type { InteractiveCliDeps } from './cli/interactiveTypes.js';

function createPrompt(): InteractivePrompt {
  const rl = createInterface({ input, output });

  return {
    ask: async (question: string) => {
      const answer = await rl.question(question);
      return answer.trim();
    },
    close: () => {
      rl.close();
    },
  };
}

/**
 * 테스트 전용 내부 헬퍼 노출
 */
export const cliInteractiveTestables = {
  isRecord,
  toText,
  buildDaisoStoreKeywordVariants,
  fetchEnvelope,
  fetchStoresWithKeywordFallback,
  parseStores,
  parseDaisoProducts,
  askMenu,
  askYesNo,
  askNonEmpty,
  askNextAction,
  printStoreDetail,
  runDaisoItemSearch,
  runOliveyoungItemSearch,
  runCuItemSearch,
  runLotteCinemaSearch,
};

export async function runInteractiveCli(deps: InteractiveCliDeps): Promise<number> {
  const prompt = deps.createPrompt ? deps.createPrompt() : createPrompt();

  try {
    deps.writeOut('daiso 인터랙티브 모드');

    let keepRunning = true;
    while (keepRunning) {
      deps.writeOut('');
      deps.writeOut('[서비스 선택]');
      deps.writeOut('1. 다이소');
      deps.writeOut('2. 올리브영');
      deps.writeOut('3. CU');
      deps.writeOut('4. 롯데시네마');

      const serviceChoice = await askMenu(prompt, '서비스 번호를 선택하세요 (0: 종료):', [
        '다이소',
        '올리브영',
        'CU',
        '롯데시네마',
      ]);

      if (serviceChoice === 0) {
        break;
      }

      if (serviceChoice === 4) {
        const theaterKeyword = await askNonEmpty(prompt, '극장 검색 키워드를 입력하세요: ');
        const payload = await fetchEnvelope(deps.fetchImpl, '/api/lottecinema/theaters', {
          keyword: theaterKeyword,
          limit: '10',
        });
        const theaters = parseLotteCinemaTheaters(payload).filter((entry) =>
          `${entry.name} ${entry.address}`.includes(theaterKeyword),
        );

        if (theaters.length === 0) {
          deps.writeOut('검색된 극장이 없습니다.');
          keepRunning = await askYesNo(prompt, '다시 시도할까요? (y/n): ');
          continue;
        }

        const selectedTheater = await pickFromList({
          prompt,
          writeOut: deps.writeOut,
          title: '[극장 선택]',
          emptyText: '검색된 극장이 없습니다.',
          cancelText: '극장 검색으로 돌아갑니다.',
          items: theaters,
          renderItem: (theater, index) =>
            `${index + 1}. ${theater.name} | ${theater.address || '주소 정보 없음'} | ${theater.distanceKm}km`,
          filterText: (theater) => `${theater.name} ${theater.address} ${theater.theaterId}`,
          indexText: '입력: 번호 선택 | /키워드 필터 | all 전체보기 | 0 다시 검색',
        });
        if (!selectedTheater) {
          continue;
        }

        printTheaterDetail(deps.writeOut, selectedTheater);

        let keepTheaterSearch = true;
        while (keepTheaterSearch) {
          await runLotteCinemaSearch(deps, prompt, selectedTheater);

          const nextAction = await askNextAction(prompt, deps.writeOut);
          if (nextAction === 'same-store') {
            continue;
          }

          if (nextAction === 'change-store') {
            keepTheaterSearch = false;
            continue;
          }

          keepRunning = false;
          keepTheaterSearch = false;
        }
        continue;
      }

      const service = serviceChoice === 1 ? 'daiso' : serviceChoice === 2 ? 'oliveyoung' : 'cu';
      const storeKeyword = await askNonEmpty(prompt, '매장 검색 키워드를 입력하세요: ');
      const storeResult = await fetchStoresWithKeywordFallback(deps.fetchImpl, service, storeKeyword);
      const stores = storeResult.stores;

      if (service === 'daiso' && stores.length > 0 && storeResult.matchedKeyword !== storeKeyword) {
        deps.writeOut(
          `입력 키워드 "${storeKeyword}" 대신 "${storeResult.matchedKeyword}"로 매장을 찾았습니다.`,
        );
      }
      if (stores.length === 0) {
        deps.writeOut('검색된 매장이 없습니다.');
        if (service === 'daiso') {
          deps.writeOut('힌트: "안산 중앙역" 대신 "안산중앙" 또는 "고잔"으로 검색해보세요.');
        }
        keepRunning = await askYesNo(prompt, '다시 시도할까요? (y/n): ');
        continue;
      }

      const selectedStore = await pickFromList({
        prompt,
        writeOut: deps.writeOut,
        title: '[매장 선택]',
        emptyText: '검색된 매장이 없습니다.',
        cancelText: '매장 검색으로 돌아갑니다.',
        items: stores,
        renderItem: (store, index) =>
          `${index + 1}. ${store.name} | ${store.address || '주소 정보 없음'}`,
        filterText: (store) => `${store.name} ${store.address} ${store.phone}`,
        indexText: '입력: 번호 선택 | /키워드 필터 | all 전체보기 | 0 다시 검색',
      });
      if (!selectedStore) {
        continue;
      }
      printStoreDetail(deps.writeOut, selectedStore);

      let keepItemSearch = true;
      while (keepItemSearch) {
        if (service === 'daiso') {
          await runDaisoItemSearch(deps, prompt, selectedStore);
        } else if (service === 'oliveyoung') {
          await runOliveyoungItemSearch(deps, prompt, selectedStore);
        } else {
          await runCuItemSearch(deps, prompt, selectedStore);
        }

        const nextAction = await askNextAction(prompt, deps.writeOut);
        if (nextAction === 'same-store') {
          continue;
        }

        if (nextAction === 'change-store') {
          keepItemSearch = false;
          continue;
        }

        keepRunning = false;
        keepItemSearch = false;
      }
    }

    deps.writeOut('인터랙티브 모드를 종료합니다.');
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deps.writeErr(`인터랙티브 실행 중 오류 발생: ${message}`);
    return 1;
  } finally {
    prompt.close();
  }
}
