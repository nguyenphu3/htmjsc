import type { MaterialRequestDto } from '@htm/shared';
import type { Db } from '../../db/pool.js';

export const MR_SELECT = `
  SELECT mr.id, mr.code, mr.project_id, p.code AS project_code, p.name AS project_name, mr.title,
         mr.fulfillment, mr.status, mr.needed_by, mr.note, mr.requested_by, u.full_name AS requested_by_name,
         p.manager_id AS project_manager_id,
         (SELECT count(*)::int FROM material_request_items i WHERE i.request_id = mr.id) AS item_count,
         mr.version, mr.created_at, mr.created_at::text AS cursor_ts, mr.updated_at
    FROM material_requests mr
    JOIN projects p ON p.id = mr.project_id
    LEFT JOIN users u ON u.id = mr.requested_by`;

export interface MrRow {
  id: string;
  code: string;
  project_id: string;
  project_code: string;
  project_name: string;
  title: string;
  fulfillment: MaterialRequestDto['fulfillment'];
  status: MaterialRequestDto['status'];
  needed_by: string | null;
  note: string | null;
  requested_by: string;
  requested_by_name: string | null;
  project_manager_id: string | null;
  item_count: number;
  version: number;
  created_at: Date;
  cursor_ts: string;
  updated_at: Date;
}

export const toMrDto = (r: MrRow): MaterialRequestDto => ({
  id: r.id,
  code: r.code,
  projectId: r.project_id,
  projectCode: r.project_code,
  projectName: r.project_name,
  title: r.title,
  fulfillment: r.fulfillment,
  status: r.status,
  neededBy: r.needed_by,
  note: r.note,
  requestedBy: r.requested_by,
  requestedByName: r.requested_by_name,
  projectManagerId: r.project_manager_id,
  itemCount: r.item_count,
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});

/** Cấp số chứng từ tuần tự theo tenant + năm, ví dụ VT-2026-00042. Khoá dòng đảm bảo không trùng. */
export async function nextDocNumber(db: Db, tenantId: string, kind: string, prefix: string): Promise<string> {
  const year = new Date().getFullYear();
  const { rows } = await db.query<{ value: number }>(
    `INSERT INTO doc_counters (tenant_id, kind, year, value) VALUES ($1, $2, $3, 1)
     ON CONFLICT (tenant_id, kind, year) DO UPDATE SET value = doc_counters.value + 1
     RETURNING value`,
    [tenantId, kind, year],
  );
  return `${prefix}-${year}-${String(rows[0]!.value).padStart(5, '0')}`;
}

export async function replaceItems(
  db: Db,
  tenantId: string,
  requestId: string,
  items: { name: string; spec?: string; unit: string; quantity: number }[],
) {
  await db.query('DELETE FROM material_request_items WHERE request_id = $1', [requestId]);
  // Một câu INSERT nhiều dòng qua unnest: 1 round-trip dù 200 dòng.
  await db.query(
    `INSERT INTO material_request_items (tenant_id, request_id, position, name, spec, unit, quantity)
     SELECT $1, $2, t.pos, t.name, t.spec, t.unit, t.qty
       FROM unnest($3::int[], $4::text[], $5::text[], $6::text[], $7::numeric[]) AS t(pos, name, spec, unit, qty)`,
    [
      tenantId,
      requestId,
      items.map((_, i) => i + 1),
      items.map((i) => i.name),
      items.map((i) => i.spec ?? null),
      items.map((i) => i.unit),
      items.map((i) => i.quantity),
    ],
  );
}
