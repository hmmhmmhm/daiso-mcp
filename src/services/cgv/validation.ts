/** 영화관 REST와 MCP 공통 입력 검증 */
import * as z from 'zod';

export const cinemaDateSchema = z.string().refine((value) => {
  if (!/^\d{8}$/.test(value)) return false;
  const dashed = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const date = new Date(`${dashed}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === dashed;
});
export const cinemaLimitSchema = z.number().int().positive();
export const cinemaLatitudeSchema = z.number().min(-90).max(90);
export const cinemaLongitudeSchema = z.number().min(-180).max(180);
const optionsSchema = z
  .object({
    playDate: cinemaDateSchema.optional(),
    limit: cinemaLimitSchema.optional(),
    latitude: cinemaLatitudeSchema.optional(),
    longitude: cinemaLongitudeSchema.optional(),
  })
  .refine((value) => (value.latitude === undefined) === (value.longitude === undefined));
export const CINEMA_INVALID_INPUT =
  '입력 오류: 날짜는 유효한 YYYYMMDD, limit은 양의 정수, 좌표는 유효한 위도·경도 쌍이어야 합니다.';

export function validateCinemaOptions(options: unknown): void {
  if (!optionsSchema.safeParse(options).success) throw new Error(CINEMA_INVALID_INPUT);
}

export function hasInvalidCinemaQuery(query: (key: string) => string | undefined): boolean {
  const number = (key: string) => {
    const value = query(key);
    return value === undefined ? undefined : value.trim() ? Number(value) : NaN;
  };
  return !optionsSchema.safeParse({
    playDate: query('playDate'),
    limit: number('limit'),
    latitude: number('lat'),
    longitude: number('lng'),
  }).success;
}
