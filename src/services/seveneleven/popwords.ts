/** 정상 빈 목록과 해석할 수 없는 원본 응답을 구분합니다. */
import * as z from 'zod';
import { ServiceError } from '../../core/errors.js';
const text = z.string().trim().min(1);
const entry = z.union([
  text,
  z.object({ keyword: text }).transform((v) => v.keyword),
  z.object({ word: text }).transform((v) => v.word),
  z.object({ text }).transform((v) => v.text),
  z.object({ name: text }).transform((v) => v.name),
]);
const words = z.array(entry);
const dataSchema = z.union([
  words,
  z
    .object({})
    .strict()
    .transform(() => []),
  z
    .object({
      keywords: words.optional(),
      popwords: words.optional(),
      wordList: words.optional(),
      list: words.optional(),
    })
    .transform((v) => [v.keywords, v.popwords, v.wordList, v.list].filter((v) => v !== undefined))
    .refine((lists) => lists.length > 0)
    .transform((lists) => lists.find((list) => list.length > 0) ?? []),
]);
const response = z.object({
  success: z.literal(true).optional(),
  code: z.number().int().min(200).max(299).optional(),
  data: dataSchema,
});
export function parseSevenElevenPopwords(envelope: unknown): string[] {
  const parsed = response.safeParse(envelope);
  if (!parsed.success)
    throw new ServiceError(
      'SEVENELEVEN_INVALID_RESPONSE',
      '세븐일레븐 인기 검색어 응답 형식을 확인할 수 없습니다.',
      502,
      true,
    );
  return parsed.data.data;
}
