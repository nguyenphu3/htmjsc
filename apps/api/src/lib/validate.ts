import type { ZodType, ZodTypeDef } from 'zod';
import { AppError } from './errors.js';

export function parse<T>(schema: ZodType<T, ZodTypeDef, unknown>, input: unknown): T {
  const r = schema.safeParse(input ?? {});
  if (!r.success) {
    throw new AppError(
      422,
      'VALIDATION_FAILED',
      'Dữ liệu không hợp lệ',
      r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return r.data;
}
