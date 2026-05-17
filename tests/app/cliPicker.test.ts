/**
 * CLI 선택 유틸 테스트
 */

import { describe, expect, it } from 'vitest';
import { pickFromList } from '../../src/cliPicker.js';

function createPrompt(answers: string[]) {
  let index = 0;
  return {
    ask: async () => {
      const answer = answers[index];
      index += 1;
      return answer ?? '0';
    },
  };
}

describe('pickFromList', () => {
  it('번호 입력으로 항목을 선택한다', async () => {
    const selected = await pickFromList({
      prompt: createPrompt(['2']),
      writeOut: () => {},
      title: '제목',
      emptyText: '비어있음',
      cancelText: '취소',
      items: ['A', 'B', 'C'],
      renderItem: (item, index) => `${index + 1}. ${item}`,
    });

    expect(selected).toBe('B');
  });

  it('/필터 후 번호로 선택한다', async () => {
    const selected = await pickFromList({
      prompt: createPrompt(['/강남', '1']),
      writeOut: () => {},
      title: '제목',
      emptyText: '비어있음',
      cancelText: '취소',
      items: [
        { name: '강남점', addr: '서울 강남구' },
        { name: '홍대점', addr: '서울 마포구' },
      ],
      renderItem: (item, index) => `${index + 1}. ${item.name}`,
      filterText: (item) => `${item.name} ${item.addr}`,
    });

    expect(selected).toEqual({ name: '강남점', addr: '서울 강남구' });
  });

  it('0 입력 시 null을 반환한다', async () => {
    const selected = await pickFromList({
      prompt: createPrompt(['0']),
      writeOut: () => {},
      title: '제목',
      emptyText: '비어있음',
      cancelText: '취소',
      items: ['A'],
      renderItem: (item, index) => `${index + 1}. ${item}`,
    });

    expect(selected).toBeNull();
  });

  it('all 입력으로 전체 목록으로 복원한다', async () => {
    const selected = await pickFromList({
      prompt: createPrompt(['/강남', 'all', '2']),
      writeOut: () => {},
      title: '제목',
      emptyText: '비어있음',
      cancelText: '취소',
      items: ['강남점', '홍대점'],
      renderItem: (item, index) => `${index + 1}. ${item}`,
    });

    expect(selected).toBe('홍대점');
  });

  it('빈 목록이면 emptyText를 출력하고 null을 반환한다', async () => {
    const out: string[] = [];
    const selected = await pickFromList({
      prompt: createPrompt(['1']),
      writeOut: (message) => out.push(message),
      title: '제목',
      emptyText: '비어있음',
      cancelText: '취소',
      items: [],
      renderItem: (item, index) => `${index + 1}. ${item}`,
    });

    expect(selected).toBeNull();
    expect(out).toContain('비어있음');
  });

  it('필터 입력이 비어있으면 전체 목록을 유지한다', async () => {
    const selected = await pickFromList({
      prompt: createPrompt(['/', '2']),
      writeOut: () => {},
      title: '제목',
      emptyText: '비어있음',
      cancelText: '취소',
      items: ['강남점', '홍대점'],
      renderItem: (item, index) => `${index + 1}. ${item}`,
    });

    expect(selected).toBe('홍대점');
  });

  it('필터 결과가 없으면 안내 후 다시 입력받는다', async () => {
    const out: string[] = [];
    const selected = await pickFromList({
      prompt: createPrompt(['/부산', '1']),
      writeOut: (message) => out.push(message),
      title: '제목',
      emptyText: '비어있음',
      cancelText: '취소',
      items: ['강남점'],
      renderItem: (item, index) => `${index + 1}. ${item}`,
    });

    expect(selected).toBe('강남점');
    expect(out.join('\n')).toContain('검색 결과가 없습니다.');
  });

  it('잘못된 번호 입력 후 재입력으로 선택한다', async () => {
    const out: string[] = [];
    const selected = await pickFromList({
      prompt: createPrompt(['x', '9', '1']),
      writeOut: (message) => out.push(message),
      title: '제목',
      emptyText: '비어있음',
      cancelText: '취소',
      items: ['강남점'],
      renderItem: (item, index) => `${index + 1}. ${item}`,
    });

    expect(selected).toBe('강남점');
    expect(out.join('\n')).toContain('번호로 입력하세요');
    expect(out.join('\n')).toContain('1부터 1 사이');
  });

  it('filterText 미지정 시 객체를 JSON 문자열로 필터링한다', async () => {
    const selected = await pickFromList({
      prompt: createPrompt(['/"name":"강남점"', '1']),
      writeOut: () => {},
      title: '제목',
      emptyText: '비어있음',
      cancelText: '취소',
      items: [{ name: '강남점' }, { name: '홍대점' }],
      renderItem: (item, index) => `${index + 1}. ${item.name}`,
    });

    expect(selected).toEqual({ name: '강남점' });
  });
});
