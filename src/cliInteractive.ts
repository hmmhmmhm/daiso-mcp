/**
 * CLI 인터랙티브 모드
 *
 * 좌표 입력 없이 서비스/매장/상품을 순차 선택해 재고를 확인합니다.
 */

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { pickFromList } from './cliPicker.js';
import {
  buildDaisoStoreKeywordVariants,
  isRecord,
  parseDaisoProducts,
  parseStores,
  toText,
} from './utils/cliInteractiveHelpers.js';

type FetchLike = typeof fetch;
type WriteFn = (message: string) => void;

export interface InteractiveCliDeps {
  fetchImpl: FetchLike;
  writeOut: WriteFn;
  writeErr: WriteFn;
  createPrompt?: () => InteractivePrompt;
}

interface InteractivePrompt {
  ask: (question: string) => Promise<string>;
  close: () => void;
}

interface InteractiveStore {
  name: string;
  address: string;
  phone: string;
}

interface InteractiveTheater {
  theaterId: string;
  name: string;
  address: string;
  distanceKm: string;
}

interface OliveyoungProductPreview {
  goodsNumber: string;
  goodsName: string;
  priceToPay: number;
  o2oRemainQuantity: number;
}

interface CuInventoryPreview {
  itemCode: string;
  itemName: string;
  price: number;
  pickupYn: boolean;
  deliveryYn: boolean;
  reserveYn: boolean;
}

interface LotteCinemaMoviePreview {
  movieId: string;
  movieName: string;
}

interface LotteCinemaSeatPreview {
  movieName: string;
  screenName: string;
  startTime: string;
  remainingSeats: string;
  totalSeats: string;
}

const BASE_URL = 'https://mcp.aka.page';

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

async function fetchEnvelope(
  fetchImpl: FetchLike,
  path: string,
  query: Record<string, string> = {},
): Promise<unknown> {
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  const response = await fetchImpl(url.toString());
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} (${url.pathname})`);
  }

  return (await response.json()) as unknown;
}

async function fetchStoresWithKeywordFallback(
  fetchImpl: FetchLike,
  service: 'daiso' | 'oliveyoung' | 'cu',
  keyword: string,
): Promise<{ stores: InteractiveStore[]; matchedKeyword: string }> {
  const candidates = service === 'daiso' ? buildDaisoStoreKeywordVariants(keyword) : [keyword];
  const keywords = candidates.length > 0 ? candidates : [keyword];

  for (const currentKeyword of keywords) {
    const payload = await fetchEnvelope(fetchImpl, `/api/${service}/stores`, {
      keyword: currentKeyword,
      limit: '10',
    });
    const stores = parseStores(payload);
    if (stores.length > 0) {
      return { stores, matchedKeyword: currentKeyword };
    }
  }

  return { stores: [], matchedKeyword: keyword };
}

async function askMenu(prompt: InteractivePrompt, title: string, options: string[]): Promise<number> {
  while (true) {
    const answer = await prompt.ask(`${title} `);
    const picked = Number.parseInt(answer, 10);
    if (Number.isNaN(picked) || picked < 0 || picked > options.length) {
      continue;
    }
    return picked;
  }
}

async function askYesNo(prompt: InteractivePrompt, question: string): Promise<boolean> {
  while (true) {
    const answer = (await prompt.ask(question)).toLowerCase();
    if (answer === 'y' || answer === 'yes') {
      return true;
    }
    if (answer === 'n' || answer === 'no') {
      return false;
    }
  }
}

async function askNonEmpty(prompt: InteractivePrompt, question: string): Promise<string> {
  while (true) {
    const answer = await prompt.ask(question);
    if (answer.length > 0) {
      return answer;
    }
  }
}

async function askNextAction(
  prompt: InteractivePrompt,
  writeOut: WriteFn,
): Promise<'same-store' | 'change-store' | 'exit'> {
  writeOut('');
  writeOut('[다음 동작]');
  writeOut('1. 같은 매장에서 다른 상품 찾기');
  writeOut('2. 다른 매장/서비스 다시 선택하기');
  writeOut('3. 종료하기');

  const choice = await askMenu(prompt, '번호를 선택하세요:', ['same-store', 'change-store', 'exit']);
  return choice === 1 ? 'same-store' : choice === 2 ? 'change-store' : 'exit';
}

function printStoreDetail(writeOut: WriteFn, store: InteractiveStore): void {
  writeOut('');
  writeOut('[선택한 매장 정보]');
  writeOut(`- 매장명: ${store.name}`);
  writeOut(`- 주소: ${store.address || '정보 없음'}`);
  writeOut(`- 전화: ${store.phone || '정보 없음'}`);
  writeOut('');
}

function parseLotteCinemaTheaters(payload: unknown): InteractiveTheater[] {
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.data)) {
    return [];
  }

  const theaters = payload.data.theaters;
  if (!Array.isArray(theaters)) {
    return [];
  }

  return theaters
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .map((entry) => ({
      theaterId: toText(entry.theaterId),
      name: toText(entry.theaterName),
      address: toText(entry.address),
      distanceKm: toText(entry.distanceKm),
    }))
    .filter((entry) => entry.theaterId.length > 0 && entry.name.length > 0);
}

function printTheaterDetail(writeOut: WriteFn, theater: InteractiveTheater): void {
  writeOut('');
  writeOut('[선택한 극장 정보]');
  writeOut(`- 극장명: ${theater.name}`);
  writeOut(`- 극장 ID: ${theater.theaterId}`);
  writeOut(`- 주소: ${theater.address || '정보 없음'}`);
  writeOut(`- 거리: ${theater.distanceKm ? `${theater.distanceKm}km` : '정보 없음'}`);
  writeOut('');
}

async function runLotteCinemaSearch(
  deps: InteractiveCliDeps,
  prompt: InteractivePrompt,
  theater: InteractiveTheater,
): Promise<void> {
  const playDate = await askNonEmpty(prompt, '조회 날짜를 입력하세요 (YYYYMMDD): ');
  const payload = await fetchEnvelope(deps.fetchImpl, '/api/lottecinema/movies', {
    playDate,
    theaterId: theater.theaterId,
  });

  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.data)) {
    deps.writeOut('롯데시네마 응답을 해석하지 못했습니다.');
    return;
  }

  const moviesRaw = payload.data.movies;
  const showtimesRaw = payload.data.showtimes;
  const movies: LotteCinemaMoviePreview[] = Array.isArray(moviesRaw)
    ? moviesRaw
        .filter((entry): entry is Record<string, unknown> => isRecord(entry))
        .map((entry) => ({
          movieId: toText(entry.movieId),
          movieName: toText(entry.movieName),
        }))
        .filter((entry) => entry.movieId.length > 0 && entry.movieName.length > 0)
    : [];
  const seats: LotteCinemaSeatPreview[] = Array.isArray(showtimesRaw)
    ? showtimesRaw
        .filter((entry): entry is Record<string, unknown> => isRecord(entry))
        .map((entry) => ({
          movieName: toText(entry.movieName),
          screenName: toText(entry.screenName),
          startTime: toText(entry.startTime),
          remainingSeats: toText(entry.remainingSeats),
          totalSeats: toText(entry.totalSeats),
        }))
        .filter((entry) => entry.movieName.length > 0)
    : [];

  deps.writeOut('');
  deps.writeOut('[롯데시네마 상영 결과]');
  deps.writeOut(`- 극장: ${theater.name}`);
  deps.writeOut(`- 날짜: ${playDate}`);
  deps.writeOut(`- 상영 영화 수: ${movies.length}`);

  if (movies.length === 0) {
    deps.writeOut('- 상영 중인 영화가 없습니다.');
  } else {
    for (const movie of movies.slice(0, 10)) {
      deps.writeOut(`- 영화: ${movie.movieName} (${movie.movieId})`);
    }
    if (movies.length > 10) {
      deps.writeOut(`- 영화: ...외 ${movies.length - 10}편`);
    }
  }

  if (seats.length === 0) {
    deps.writeOut('- 회차/좌석 정보가 없습니다.');
    return;
  }

  deps.writeOut('- 회차/좌석:');
  for (const seat of seats.slice(0, 15)) {
    deps.writeOut(
      `  ${seat.startTime} | ${seat.movieName} | ${seat.screenName || '상영관 정보 없음'} | ${seat.remainingSeats}/${seat.totalSeats}`,
    );
  }
  if (seats.length > 15) {
    deps.writeOut(`  ...외 ${seats.length - 15}건`);
  }
}

async function runDaisoItemSearch(
  deps: InteractiveCliDeps,
  prompt: InteractivePrompt,
  store: InteractiveStore,
): Promise<void> {
  const keyword = await askNonEmpty(prompt, '찾을 상품 키워드를 입력하세요: ');
  const productsPayload = await fetchEnvelope(deps.fetchImpl, '/api/daiso/products', {
    q: keyword,
    pageSize: '10',
  });

  const products = parseDaisoProducts(productsPayload);
  if (products.length === 0) {
    deps.writeOut('검색된 다이소 상품이 없습니다.');
    return;
  }

  const selectedProduct = await pickFromList({
    prompt,
    writeOut: deps.writeOut,
    title: '[상품 선택]',
    emptyText: '검색된 다이소 상품이 없습니다.',
    cancelText: '상품 선택을 취소했습니다.',
    items: products,
    renderItem: (product, index) =>
      `${index + 1}. ${product.name} (${product.price}원, ID: ${product.id})`,
    filterText: (product) => `${product.name} ${product.id}`,
    indexText: '입력: 번호 선택 | /키워드 필터 | all 전체보기 | 0 취소',
  });
  if (!selectedProduct) {
    return;
  }
  const inventoryPayload = await fetchEnvelope(deps.fetchImpl, '/api/daiso/inventory', {
    productId: selectedProduct.id,
    keyword: store.name,
    pageSize: '50',
  });

  if (!isRecord(inventoryPayload) || inventoryPayload.success !== true || !isRecord(inventoryPayload.data)) {
    deps.writeOut('재고 응답을 해석하지 못했습니다.');
    return;
  }

  const storeInventory = inventoryPayload.data.storeInventory;
  if (!isRecord(storeInventory) || !Array.isArray(storeInventory.stores)) {
    deps.writeOut('매장 재고 데이터가 없습니다.');
    return;
  }

  const match = storeInventory.stores.find((entry) => {
    if (!isRecord(entry)) {
      return false;
    }
    const storeName = toText(entry.storeName);
    return storeName === store.name || storeName.includes(store.name);
  });

  deps.writeOut('');
  deps.writeOut('[재고 결과]');
  deps.writeOut(`- 상품: ${selectedProduct.name}`);
  deps.writeOut(`- 매장: ${store.name}`);

  if (isRecord(match)) {
    const quantity = toText(match.quantity) || '0';
    deps.writeOut(`- 재고 수량: ${quantity}`);
    return;
  }

  deps.writeOut('- 선택 매장에 대한 재고 정보를 찾지 못했습니다.');
}

async function runOliveyoungItemSearch(
  deps: InteractiveCliDeps,
  prompt: InteractivePrompt,
  store: InteractiveStore,
): Promise<void> {
  const keyword = await askNonEmpty(prompt, '찾을 상품 키워드를 입력하세요: ');
  const payload = await fetchEnvelope(deps.fetchImpl, '/api/oliveyoung/inventory', {
    keyword,
    storeKeyword: store.name,
    size: '10',
  });

  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.data)) {
    deps.writeOut('재고 응답을 해석하지 못했습니다.');
    return;
  }

  const inventory = payload.data.inventory;
  if (!isRecord(inventory) || !Array.isArray(inventory.products)) {
    deps.writeOut('올리브영 상품 데이터가 없습니다.');
    return;
  }

  const products: OliveyoungProductPreview[] = inventory.products
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .map((entry) => ({
      goodsNumber: toText(entry.goodsNumber),
      goodsName: toText(entry.goodsName),
      priceToPay: Number.parseInt(toText(entry.priceToPay), 10) || 0,
      o2oRemainQuantity: Number.parseInt(toText(entry.o2oRemainQuantity), 10) || 0,
    }))
    .filter((entry) => entry.goodsName.length > 0);

  deps.writeOut('');
  deps.writeOut('[재고 결과]');
  deps.writeOut(`- 매장: ${store.name}`);
  deps.writeOut(`- 검색어: ${keyword}`);

  if (products.length === 0) {
    deps.writeOut('- 검색된 상품이 없습니다.');
    return;
  }

  const selected = await pickFromList({
    prompt,
    writeOut: deps.writeOut,
    title: '[상품 선택]',
    emptyText: '검색된 상품이 없습니다.',
    cancelText: '상품 선택을 취소했습니다.',
    items: products,
    renderItem: (product, index) =>
      `${index + 1}. ${product.goodsName} (${product.priceToPay}원, 남은수량 ${product.o2oRemainQuantity})`,
    filterText: (product) => `${product.goodsName} ${product.goodsNumber}`,
    indexText: '입력: 번호 선택 | /키워드 필터 | all 전체보기 | 0 취소',
  });

  if (!selected) {
    return;
  }

  deps.writeOut(`- 상품: ${selected.goodsName}`);
  deps.writeOut(`- 가격: ${selected.priceToPay}원`);
  deps.writeOut(`- 남은수량: ${selected.o2oRemainQuantity}`);
}

async function runCuItemSearch(
  deps: InteractiveCliDeps,
  prompt: InteractivePrompt,
  store: InteractiveStore,
): Promise<void> {
  const keyword = await askNonEmpty(prompt, '찾을 상품 키워드를 입력하세요: ');
  const payload = await fetchEnvelope(deps.fetchImpl, '/api/cu/inventory', {
    keyword,
    storeKeyword: store.name,
    size: '10',
    storeLimit: '10',
  });

  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.data)) {
    deps.writeOut('재고 응답을 해석하지 못했습니다.');
    return;
  }

  const inventory = payload.data.inventory;
  if (!isRecord(inventory) || !Array.isArray(inventory.items)) {
    deps.writeOut('CU 상품 데이터가 없습니다.');
    return;
  }

  const items: CuInventoryPreview[] = inventory.items
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .map((entry) => ({
      itemCode: toText(entry.itemCode),
      itemName: toText(entry.itemName),
      price: Number.parseInt(toText(entry.price), 10) || 0,
      pickupYn: toText(entry.pickupYn).toLowerCase() === 'true',
      deliveryYn: toText(entry.deliveryYn).toLowerCase() === 'true',
      reserveYn: toText(entry.reserveYn).toLowerCase() === 'true',
    }))
    .filter((entry) => entry.itemName.length > 0);

  deps.writeOut('');
  deps.writeOut('[재고 결과]');
  deps.writeOut(`- 매장: ${store.name}`);
  deps.writeOut(`- 검색어: ${keyword}`);

  if (items.length === 0) {
    deps.writeOut('- 검색된 상품이 없습니다.');
    return;
  }

  const selected = await pickFromList({
    prompt,
    writeOut: deps.writeOut,
    title: '[상품 선택]',
    emptyText: '검색된 상품이 없습니다.',
    cancelText: '상품 선택을 취소했습니다.',
    items,
    renderItem: (item, index) => `${index + 1}. ${item.itemName} (${item.price}원)`,
    filterText: (item) => `${item.itemName} ${item.itemCode}`,
    indexText: '입력: 번호 선택 | /키워드 필터 | all 전체보기 | 0 취소',
  });

  if (!selected) {
    return;
  }

  deps.writeOut(`- 상품: ${selected.itemName}`);
  deps.writeOut(`- 가격: ${selected.price}원`);
  deps.writeOut(`- 픽업 가능: ${selected.pickupYn ? '예' : '아니오'}`);
  deps.writeOut(`- 배달 가능: ${selected.deliveryYn ? '예' : '아니오'}`);
  deps.writeOut(`- 예약 가능: ${selected.reserveYn ? '예' : '아니오'}`);
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
