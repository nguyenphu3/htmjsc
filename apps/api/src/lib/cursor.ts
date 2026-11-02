import type { Page } from '@htm/shared';
import { badRequest } from './errors.js';

/**
 * Keyset pagination theo (created_at, id): ổn định khi có dữ liệu mới chèn vào và
 * O(log n) ở mọi độ sâu trang (không dùng OFFSET).
 * `cursor_ts` là created_at dạng text của Postgres, giữ đủ độ chính xác micro giây.
 */
export interface Cursor {
  ts: string;
  id: string;
}

const TS_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?([+-]\d{2}(:?\d{2})?|Z)$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(c: Cursor): string {
  return Buffer.from(`${c.ts}|${c.id}`, 'utf8').toString('base64url');
}

export function decodeCursor(raw: string | undefined): Cursor | null {
  if (!raw) return null;
  const [ts, id] = Buffer.from(raw, 'base64url').toString('utf8').split('|');
  if (!ts || !id || !TS_RE.test(ts) || !UUID_RE.test(id)) throw badRequest('Cursor không hợp lệ');
  return { ts, id };
}

export function pageOf<R extends { id: string; cursor_ts: string }, T>(
  rows: R[],
  limit: number,
  map: (r: R) => T,
): Page<T> {
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const last = slice[slice.length - 1];
  return {
    data: slice.map(map),
    nextCursor: hasMore && last ? encodeCursor({ ts: last.cursor_ts, id: last.id }) : null,
  };
}
