/** 원본 컬렉션의 완전성 경계를 검증합니다. */
import { expect, it } from 'vitest';
import { SevenElevenSearchPagination } from '../../../src/services/seveneleven/searchPagination.js';
const collection = (id: string, total: number, ids: number[]) => ({
  CollectionId: id,
  Documentset: { totalCount: total, Document: ids.map((itemCd) => ({ itemCd })) },
});
it.each([
  [collection('A', -1, [])],
  [collection('A', 1.5, [])],
  [collection('A', 0, [1])],
  [collection('A', 1, []), collection('A', 1, [1])],
])('잘못된 최초 컬렉션은 거절한다', (...collections) => {
  expect(() => new SevenElevenSearchPagination().append(collections)).toThrow();
});
it('진행 중에 새 컬렉션이 나타나면 거절한다', () => {
  const state = new SevenElevenSearchPagination();
  state.append([collection('A', 2, [1])]);
  expect(() => state.append([collection('A', 2, [2]), collection('B', 1, [3])])).toThrow();
});
it('미완료 컬렉션의 빈 다음 페이지는 거절한다', () => {
  const state = new SevenElevenSearchPagination();
  state.append([collection('A', 2, [1])]);
  expect(() => state.append([collection('A', 2, [])])).toThrow();
});
it('빈 컬렉션과 컬렉션 식별자 없는 결과도 처리한다', () => {
  expect(new SevenElevenSearchPagination().append([])).toBe(true);
  expect(
    new SevenElevenSearchPagination().append([{ Documentset: { totalCount: 0, Document: [] } }]),
  ).toBe(true);
});
it('상품 코드를 우선하고 번호와 이름과 원본을 식별자로 보완한다', () => {
  const documents = [
    { field: { itemCd: 'a' } },
    { prdNo: 'b' },
    { itemOnm: 'c' },
    { other: 'd' },
    null,
  ];
  const state = new SevenElevenSearchPagination();
  expect(state.append([{ Documentset: { totalCount: 6, Document: documents } }])).toBe(false);
  expect(() => state.append([{ Documentset: { totalCount: 6, Document: [null] } }])).toThrow();
});
it.each([
  {},
  { Documentset: {} },
  { Documentset: { totalCount: 0 } },
  { Documentset: { Document: [] } },
])('완전성 메타데이터가 누락되면 거절한다', (collection) => {
  expect(() => new SevenElevenSearchPagination().append([collection])).toThrow();
});
it('같은 원본 페이지 안의 상품 중복도 거절한다', () => {
  expect(() => new SevenElevenSearchPagination().append([collection('A', 2, [1, 1])])).toThrow();
});
