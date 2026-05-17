/**
 * 인터랙티브 CLI 입력/출력 헬퍼
 */

import type { InteractivePrompt, InteractiveStore, WriteFn } from './interactiveTypes.js';

export async function askMenu(
  prompt: InteractivePrompt,
  title: string,
  options: string[],
  writeOut?: WriteFn,
): Promise<number> {
  while (true) {
    const answer = await prompt.ask(`${title} `);
    const picked = Number.parseInt(answer, 10);
    if (Number.isNaN(picked) || picked < 0 || picked > options.length) {
      writeOut?.(`번호로 입력하세요. 0부터 ${options.length} 사이에서 선택할 수 있습니다.`);
      continue;
    }
    return picked;
  }
}

export async function askYesNo(prompt: InteractivePrompt, question: string): Promise<boolean> {
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

export async function askNonEmpty(prompt: InteractivePrompt, question: string): Promise<string> {
  while (true) {
    const answer = await prompt.ask(question);
    if (answer.length > 0) {
      return answer;
    }
  }
}

export async function askNextAction(
  prompt: InteractivePrompt,
  writeOut: WriteFn,
): Promise<'same-store' | 'change-store' | 'exit'> {
  writeOut('');
  writeOut('[다음 동작]');
  writeOut('1. 같은 매장에서 다른 상품 찾기');
  writeOut('2. 다른 매장/서비스 다시 선택하기');
  writeOut('3. 종료하기');

  const choice = await askMenu(prompt, '번호를 선택하세요:', ['same-store', 'change-store', 'exit'], writeOut);
  return choice === 1 ? 'same-store' : choice === 2 ? 'change-store' : 'exit';
}

export function printStoreDetail(writeOut: WriteFn, store: InteractiveStore): void {
  writeOut('');
  writeOut('[선택한 매장 정보]');
  writeOut(`- 매장명: ${store.name}`);
  writeOut(`- 주소: ${store.address || '정보 없음'}`);
  writeOut(`- 전화: ${store.phone || '정보 없음'}`);
  writeOut('');
}
