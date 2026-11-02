import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  availableActions,
  canPerform,
  createMaterialRequestSchema,
  listMaterialRequestsQuery,
  MR_TRANSITIONS,
  transitionSchema,
  updateMaterialRequestSchema,
  type MaterialRequestDto,
  type MrAction,
} from '@htm/shared';
import type { Db } from '../../db/pool.js';
import { decodeCursor, pageOf } from '../../lib/cursor.js';
import { AppError, conflict, forbidden, notFound } from '../../lib/errors.js';
import { WITH_ME } from '../../lib/sql.js';
import { parse } from '../../lib/validate.js';
import { requireAuth, type AuthContext } from '../../plugins/auth.js';
import { canSeeAllProjects, getProjectAccess } from '../projects/repo.js';
import { MR_SELECT, nextDocNumber, replaceItems, toMrDto, type MrRow } from './repo.js';

const idParam = z.object({ id: z.string().uuid() });

const actorOf = (auth: AuthContext) => ({ id: auth.userId, roles: auth.roles });
const ctxOf = (r: MrRow) => ({
  status: r.status,
  fulfillment: r.fulfillment,
  requestedBy: r.requested_by,
  projectManagerId: r.project_manager_id,
});

/** Điều kiện SQL "người dùng được xem đề nghị này". $1 = userId. */
export function visibilitySql(auth: AuthContext): string | null {
  if (canSeeAllProjects(auth)) return null;
  return `(mr.requested_by = $1 OR p.manager_id = $1
           OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $1))`;
}

/** Điều kiện SQL "đang chờ chính người dùng xử lý" — khớp với canPerform() ở @htm/shared. */
export function inboxSql(auth: AuthContext): string {
  const has = (r: string) => auth.roles.includes(r);
  const parts = [`(mr.status IN ('draft', 'rejected') AND mr.requested_by = $1)`];
  parts.push(
    has('director')
      ? `mr.status = 'submitted'`
      : `(mr.status = 'submitted' AND p.manager_id = $1 AND mr.requested_by <> $1)`,
  );
  if (has('procurement') || has('admin')) parts.push(`(mr.status IN ('approved', 'in_progress') AND mr.fulfillment = 'purchase')`);
  if (has('workshop') || has('admin')) parts.push(`(mr.status IN ('approved', 'in_progress') AND mr.fulfillment = 'production')`);
  return `(${parts.join(' OR ')})`;
}

async function loadForUser(db: Db, id: string, auth: AuthContext, lock = false): Promise<MrRow> {
  const vis = visibilitySql(auth);
  const { rows } = await db.query<MrRow>(
    `${WITH_ME}${MR_SELECT} WHERE mr.id = $2 ${vis ? `AND ${vis}` : ''} ${lock ? 'FOR UPDATE OF mr' : ''}`,
    [auth.userId, id],
  );
  if (!rows[0]) throw notFound('Đề nghị vật tư');
  return rows[0];
}

async function loadDetail(db: Db, id: string, auth: AuthContext): Promise<MaterialRequestDto> {
  const row = await loadForUser(db, id, auth);
  const [items, events] = await Promise.all([
    db.query<{ id: string; name: string; spec: string | null; unit: string; quantity: number }>(
      'SELECT id, name, spec, unit, quantity FROM material_request_items WHERE request_id = $1 ORDER BY position',
      [id],
    ),
    db.query<{
      id: string;
      action: string;
      from_status: string | null;
      to_status: string;
      comment: string | null;
      actor_id: string;
      actor_name: string | null;
      created_at: Date;
    }>(
      `SELECT e.id, e.action, e.from_status, e.to_status, e.comment, e.actor_id, u.full_name AS actor_name, e.created_at
         FROM material_request_events e LEFT JOIN users u ON u.id = e.actor_id
        WHERE e.request_id = $1 ORDER BY e.created_at, e.id`,
      [id],
    ),
  ]);
  return {
    ...toMrDto(row),
    items: items.rows,
    events: events.rows.map((e) => ({
      id: e.id,
      action: e.action,
      fromStatus: e.from_status,
      toStatus: e.to_status,
      comment: e.comment,
      actorId: e.actor_id,
      actorName: e.actor_name,
      createdAt: e.created_at.toISOString(),
    })),
    actions: availableActions(ctxOf(row), actorOf(auth)),
  };
}

async function recordEvent(
  db: Db,
  auth: AuthContext,
  row: { id: string; code: string; project_id: string; requested_by: string },
  action: MrAction | 'create',
  from: string | null,
  to: string,
  comment?: string,
) {
  await db.query(
    `INSERT INTO material_request_events (tenant_id, request_id, actor_id, action, from_status, to_status, comment)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [auth.tenantId, row.id, auth.userId, action, from, to, comment ?? null],
  );
  // Ghi outbox trong cùng transaction: worker sẽ gửi thông báo (email/Zalo/push) — không mất sự kiện.
  await db.query(`INSERT INTO outbox_events (tenant_id, topic, payload) VALUES ($1, 'material_request.status_changed', $2)`, [
    auth.tenantId,
    JSON.stringify({
      requestId: row.id,
      code: row.code,
      projectId: row.project_id,
      requestedBy: row.requested_by,
      actorId: auth.userId,
      action,
      from,
      to,
    }),
  ]);
}

export async function materialRequestRoutes(app: FastifyInstance) {
  app.get('/', async (req) => {
    const auth = requireAuth(req);
    const q = parse(listMaterialRequestsQuery, req.query);
    const cursor = decodeCursor(q.cursor);
    const params: unknown[] = [auth.userId];
    const where: string[] = [];
    const vis = visibilitySql(auth);
    if (vis) where.push(vis);
    if (q.view === 'mine') where.push('mr.requested_by = $1');
    if (q.view === 'inbox') where.push(inboxSql(auth));
    const add = (sql: string, v: unknown) => {
      params.push(v);
      where.push(sql.replace('?', `$${params.length}`));
    };
    if (q.status) add('mr.status = ?', q.status);
    if (q.projectId) add('mr.project_id = ?', q.projectId);
    if (q.fulfillment) add('mr.fulfillment = ?', q.fulfillment);
    if (cursor) {
      params.push(cursor.ts, cursor.id);
      where.push(`(mr.created_at, mr.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
    }
    params.push(q.limit + 1);
    const rows = await req.db(async (db) => {
      const r = await db.query<MrRow>(
        `${WITH_ME}${MR_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY mr.created_at DESC, mr.id DESC LIMIT $${params.length}`,
        params,
      );
      return r.rows;
    });
    return pageOf(rows, q.limit, toMrDto);
  });

  app.post('/', async (req, reply) => {
    const auth = requireAuth(req);
    const input = parse(createMaterialRequestSchema, req.body);
    const data = await req.db(async (db) => {
      const access = await getProjectAccess(db, input.projectId, auth);
      if (!access || !access.canView) throw notFound('Dự án');
      if (!access.canContribute) throw forbidden('Chỉ thành viên dự án được tạo đề nghị vật tư');
      if (access.project.status === 'completed') throw conflict('Dự án đã hoàn thành, không thể tạo đề nghị mới');

      const code = await nextDocNumber(db, auth.tenantId, 'material_request', 'VT');
      const status = input.submit ? 'submitted' : 'draft';
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO material_requests (tenant_id, code, project_id, title, fulfillment, status, needed_by, note, requested_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [auth.tenantId, code, input.projectId, input.title, input.fulfillment, status, input.neededBy ?? null, input.note ?? null, auth.userId],
      );
      const id = rows[0]!.id;
      await replaceItems(db, auth.tenantId, id, input.items);
      const ref = { id, code, project_id: input.projectId, requested_by: auth.userId };
      await recordEvent(db, auth, ref, 'create', null, 'draft');
      if (input.submit) await recordEvent(db, auth, ref, 'submit', 'draft', 'submitted');
      return loadDetail(db, id, auth);
    });
    return reply.status(201).send({ data });
  });

  app.get('/:id', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    return { data: await req.db((db) => loadDetail(db, id, auth)) };
  });

  app.patch('/:id', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const input = parse(updateMaterialRequestSchema, req.body);
    const data = await req.db(async (db) => {
      const row = await loadForUser(db, id, auth, true);
      if (row.requested_by !== auth.userId) throw forbidden('Chỉ người lập được sửa đề nghị');
      if (row.status !== 'draft') throw conflict('Chỉ sửa được đề nghị ở trạng thái Nháp');
      const map: Record<string, string> = { title: 'title', fulfillment: 'fulfillment', neededBy: 'needed_by', note: 'note' };
      const sets: string[] = ['version = version + 1'];
      const params: unknown[] = [id];
      for (const [k, col] of Object.entries(map)) {
        const v = (input as Record<string, unknown>)[k];
        if (v === undefined) continue;
        params.push(v);
        sets.push(`${col} = $${params.length}`);
      }
      await db.query(`UPDATE material_requests SET ${sets.join(', ')} WHERE id = $1`, params);
      if (input.items) await replaceItems(db, auth.tenantId, id, input.items);
      return loadDetail(db, id, auth);
    });
    return { data };
  });

  app.post('/:id/transitions', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const input = parse(transitionSchema, req.body);
    const data = await req.db(async (db) => {
      // FOR UPDATE: hai người bấm "Duyệt" cùng lúc -> chỉ một lần chuyển trạng thái thành công.
      const row = await loadForUser(db, id, auth, true);
      const t = MR_TRANSITIONS[input.action];
      if (!t.from.includes(row.status)) {
        throw new AppError(409, 'INVALID_TRANSITION', `Không thể "${input.action}" khi đề nghị đang ở trạng thái "${row.status}"`);
      }
      if (!canPerform(input.action, ctxOf(row), actorOf(auth))) throw forbidden();
      if (input.action === 'reject' && !input.comment) {
        throw new AppError(422, 'VALIDATION_FAILED', 'Cần ghi lý do khi từ chối', [{ path: 'comment', message: 'Bắt buộc' }]);
      }
      await db.query('UPDATE material_requests SET status = $2, version = version + 1 WHERE id = $1', [id, t.to]);
      await recordEvent(db, auth, row, input.action, row.status, t.to, input.comment);
      return loadDetail(db, id, auth);
    });
    return { data };
  });
}
