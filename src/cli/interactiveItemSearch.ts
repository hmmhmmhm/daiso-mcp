/**
 * 인터랙티브 CLI 상품/극장 조회 절차
 */

import { pickFromList } from '../cliPicker.js';
import { isRecord, parseDaisoProducts, toText } from '../utils/cliInteractiveHelpers.js';
import type { InteractiveCliDeps, InteractivePrompt, InteractiveStore, InteractiveTheater, WriteFn } from './interactiveTypes.js';
import { askNonEmpty } from './interactivePrompt.js';
import { fetchEnvelope } from './interactiveFetch.js';

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

export function parseLotteCinemaTheaters(payload: unknown): InteractiveTheater[] {
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

export function printTheaterDetail(writeOut: WriteFn, theater: InteractiveTheater): void {
  writeOut('');
  writeOut('[선택한 극장 정보]');
  writeOut(`- 극장명: ${theater.name}`);
  writeOut(`- 극장 ID: ${theater.theaterId}`);
  writeOut(`- 주소: ${theater.address || '정보 없음'}`);
  writeOut(`- 거리: ${theater.distanceKm ? `${theater.distanceKm}km` : '정보 없음'}`);
  writeOut('');
}

export async function runLotteCinemaSearch(
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

export async function runDaisoItemSearch(
  deps: InteractiveCliDeps,
  prompt: InteractivePrompt,
  store: InteractiveStore,
  initialKeyword?: string,
): Promise<void> {
  const keyword = initialKeyword && initialKeyword.trim().length > 0
    ? initialKeyword.trim()
    : await askNonEmpty(prompt, '찾을 상품 키워드를 입력하세요: ');
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

export async function runOliveyoungItemSearch(
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

export async function runCuItemSearch(
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
