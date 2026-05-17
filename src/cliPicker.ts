/**
 * 인터랙티브 목록 선택 유틸리티
 *
 * 번호 선택, /키워드 필터, all(전체 복원), 0(취소)을 지원합니다.
 */

type WriteFn = (message: string) => void;

export interface ChoicePrompt {
  ask: (question: string) => Promise<string>;
}

interface PickerOptions<T> {
  prompt: ChoicePrompt;
  writeOut: WriteFn;
  title: string;
  emptyText: string;
  cancelText: string;
  items: T[];
  renderItem: (item: T, index: number) => string;
  indexText?: string;
  filterText?: (item: T) => string;
}

function normalize(value: string): string {
  return value.toLowerCase();
}

function defaultFilterText<T>(item: T): string {
  return typeof item === 'string' ? item : JSON.stringify(item);
}

export async function pickFromList<T>(options: PickerOptions<T>): Promise<T | null> {
  const {
    prompt,
    writeOut,
    title,
    emptyText,
    cancelText,
    items,
    renderItem,
    indexText = '입력: 번호 선택 | /키워드 필터 | all 전체보기 | 0 취소',
    filterText = defaultFilterText,
  } = options;

  if (items.length === 0) {
    writeOut(emptyText);
    return null;
  }

  let visibleItems = items;
  while (true) {
    writeOut('');
    writeOut(title);
    for (let i = 0; i < visibleItems.length; i += 1) {
      writeOut(renderItem(visibleItems[i], i));
    }
    writeOut(indexText);

    const answer = await prompt.ask('선택: ');
    if (answer === '0') {
      writeOut(cancelText);
      return null;
    }

    if (answer === 'all') {
      visibleItems = items;
      continue;
    }

    if (answer.startsWith('/')) {
      const query = answer.slice(1).trim();
      if (!query) {
        visibleItems = items;
        continue;
      }

      const needle = normalize(query);
      const filtered = items.filter((item) => normalize(filterText(item)).includes(needle));
      if (filtered.length === 0) {
        writeOut(`"${query}" 검색 결과가 없습니다.`);
        continue;
      }

      visibleItems = filtered;
      continue;
    }

    const picked = Number.parseInt(answer, 10);
    if (Number.isNaN(picked) || picked < 1 || picked > visibleItems.length) {
      writeOut(`번호로 입력하세요. 1부터 ${visibleItems.length} 사이에서 선택하거나 0으로 취소하세요.`);
      continue;
    }

    return visibleItems[picked - 1];
  }
}
