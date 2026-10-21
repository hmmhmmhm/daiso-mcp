import { expect, it } from 'vitest';
import { parseSevenElevenPopwords } from '../../../src/services/seveneleven/popwords.js';
it.each([
  [['커피'], ['커피']],
  [
    [{ keyword: '커피' }, { word: '과자' }, { text: '도시락' }, { name: '음료' }],
    ['커피', '과자', '도시락', '음료'],
  ],
  [{ keywords: ['커피'] }, ['커피']],
  [{ popwords: ['커피'] }, ['커피']],
  [{ wordList: ['커피'] }, ['커피']],
  [{ list: ['커피'] }, ['커피']],
  [[], []],
  [{ keywords: [], list: ['커피'] }, ['커피']],
  [{ keywords: [], popwords: [], wordList: [], list: [] }, []],
])('공개 검색어 배열/이름을 명시적으로 해석한다: %j', (input, output) => {
  expect(parseSevenElevenPopwords(input)).toEqual(output);
});
it.each([
  {},
  null,
  { surprise: [] },
  { list: [null] },
  { keywords: [''] },
  { list: [{ name: 4 }] },
])('모르는 형식을 빈 목록으로 위장하지 않는다: %j', (input) => {
  expect(() => parseSevenElevenPopwords(input)).toThrow('인기 검색어 응답');
});
