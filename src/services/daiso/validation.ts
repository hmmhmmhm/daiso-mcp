/** 다이소 REST/MCP 공통 입력 검증 */
import * as z from 'zod';

export const positiveIntegerSchema = z.number().finite().int().positive();
export const latitudeSchema = z.number().finite().min(-90).max(90);
export const longitudeSchema = z.number().finite().min(-180).max(180);

export class DaisoValidationError extends Error {}

export function validatePositiveInteger(value: number, name: string): void {
  if (!positiveIntegerSchema.safeParse(value).success) {
    throw new DaisoValidationError(`${name}는 유한한 양의 정수여야 합니다.`);
  }
}

export function validatePagination(page: number, pageSize: number): void {
  validatePositiveInteger(page, 'page');
  validatePositiveInteger(pageSize, 'pageSize');
}

export function resolveCoordinates(latitude?: number, longitude?: number) {
  if (latitude === undefined && longitude === undefined) {
    return { latitude: 37.5665, longitude: 126.978 };
  }
  if (
    !latitudeSchema.safeParse(latitude).success ||
    !longitudeSchema.safeParse(longitude).success
  ) {
    throw new DaisoValidationError(
      '위도(-90~90)와 경도(-180~180)를 유한한 숫자로 함께 입력해주세요.',
    );
  }
  return { latitude: latitude as number, longitude: longitude as number };
}

export function parseNumericQuery(
  value: string | undefined,
  fallback?: number,
): number | undefined {
  if (value === undefined) return fallback;
  return value.trim().length === 0 ? NaN : Number(value);
}
