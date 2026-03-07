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
});
