import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  addMemberSchema,
  createProjectSchema,
  createSiteReportSchema,
  listProjectsQuery,
  paginationSchema,
  updateProjectSchema,
  type SiteReportDto,
} from '@htm/shared';
import type { Db } from '../../db/pool.js';
import { decodeCursor, pageOf } from '../../lib/cursor.js';
import { forbidden, notFound } from '../../lib/errors.js';
import { WITH_ME } from '../../lib/sql.js';
import { parse } from '../../lib/validate.js';
import { requireAuth, requireRole, type AuthContext } from '../../plugins/auth.js';
import { canSeeAllProjects, getProjectAccess, PROJECT_SELECT, toProjectDto, type ProjectRow } from './repo.js';

const idParam = z.object({ id: z.string().uuid() });
const memberParam = idParam.extend({ userId: z.string().uuid() });

async function accessOrThrow(db: Db, id: string, auth: AuthContext) {
  const access = await getProjectAccess(db, id, auth);
  if (!access || !access.canView) throw notFound('Dự án'); // không tiết lộ dự án tồn tại
  return access;
}

export async function projectRoutes(app: FastifyInstance) {
  app.get('/', async (req) => {
    const auth = requireAuth(req);
    const q = parse(listProjectsQuery, req.query);
    const cursor = decodeCursor(q.cursor);
    const params: unknown[] = [auth.userId];
    const where: string[] = [];
    const memberClause = `(p.manager_id = $1 OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $1))`;
    if (q.mine === 'true' || !canSeeAllProjects(auth)) where.push(memberClause);
    if (q.status) {
      params.push(q.status);
      where.push(`p.status = $${params.length}`);
    }
    if (q.region) {
      params.push(q.region);
      where.push(`p.region = $${params.length}`);
    }
    if (q.q) {
      params.push(`%${q.q}%`);
      where.push(`(p.name ILIKE $${params.length} OR p.code ILIKE $${params.length} OR p.client_name ILIKE $${params.length})`);
    }
    if (cursor) {
      params.push(cursor.ts, cursor.id);
      where.push(`(p.created_at, p.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
    }
    params.push(q.limit + 1);
    const rows = await req.db(async (db) => {
      const r = await db.query<ProjectRow & { cursor_ts: string }>(
        `${WITH_ME}${PROJECT_SELECT.replace('p.created_at, p.updated_at', 'p.created_at, p.updated_at, p.created_at::text AS cursor_ts')} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY p.created_at DESC, p.id DESC LIMIT $${params.length}`,
        params,
      );
      return r.rows;
    });
    return pageOf(rows, q.limit, toProjectDto);
  });

  app.post('/', async (req, reply) => {
    const auth = requireRole(req, 'admin', 'director', 'manager');
    const input = parse(createProjectSchema, req.body);
    const project = await req.db(async (db) => {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO projects (tenant_id, code, name, client_name, location, region, status, manager_id,
                               start_date, end_date, budget_vnd, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [
          auth.tenantId,
          input.code.toUpperCase(),
          input.name,
          input.clientName ?? null,
          input.location ?? null,
          input.region,
          input.status,
          input.managerId,
          input.startDate ?? null,
          input.endDate ?? null,
          input.budgetVnd ?? null,
          auth.userId,
        ],
      );
      const id = rows[0]!.id;
      await db.query(
        `INSERT INTO project_members (tenant_id, project_id, user_id, role) VALUES ($1, $2, $3, 'manager')
         ON CONFLICT DO NOTHING`,
        [auth.tenantId, id, input.managerId],
      );
      return (await getProjectAccess(db, id, auth))!.project;
    });
    return reply.status(201).send({ data: project });
  });

  app.get('/:id', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const access = await req.db((db) => accessOrThrow(db, id, auth));
    return {
      data: access.project,
      permissions: { canManage: access.canManage, canContribute: access.canContribute },
    };
  });

  app.patch('/:id', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const input = parse(updateProjectSchema, req.body);
    const map: Record<string, string> = {
      name: 'name',
      clientName: 'client_name',
      location: 'location',
      region: 'region',
      status: 'status',
      managerId: 'manager_id',
      startDate: 'start_date',
      endDate: 'end_date',
      budgetVnd: 'budget_vnd',
    };
    const project = await req.db(async (db) => {
      const access = await accessOrThrow(db, id, auth);
      if (!access.canManage) throw forbidden();
      const sets: string[] = [];
      const params: unknown[] = [id];
      for (const [k, v] of Object.entries(input)) {
        if (v === undefined || !map[k]) continue;
        params.push(v);
        sets.push(`${map[k]} = $${params.length}`);
      }
      if (sets.length) await db.query(`UPDATE projects SET ${sets.join(', ')} WHERE id = $1`, params);
      if (input.managerId) {
        await db.query(
          `INSERT INTO project_members (tenant_id, project_id, user_id, role) VALUES ($1, $2, $3, 'manager')
           ON CONFLICT (project_id, user_id) DO UPDATE SET role = 'manager'`,
          [auth.tenantId, id, input.managerId],
        );
      }
      return (await getProjectAccess(db, id, auth))!.project;
    });
    return { data: project };
  });

  /* ---------- Thành viên ---------- */

  app.get('/:id/members', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const data = await req.db(async (db) => {
      await accessOrThrow(db, id, auth);
      const { rows } = await db.query<{
        user_id: string;
        full_name: string;
        title: string | null;
        role: string;
        added_at: Date;
      }>(
        `SELECT pm.user_id, u.full_name, u.title, pm.role, pm.added_at
           FROM project_members pm JOIN users u ON u.id = pm.user_id
          WHERE pm.project_id = $1 ORDER BY pm.role = 'manager' DESC, u.full_name`,
        [id],
      );
      return rows.map((r) => ({
        userId: r.user_id,
        fullName: r.full_name,
        title: r.title,
        role: r.role,
        addedAt: r.added_at.toISOString(),
      }));
    });
    return { data };
  });

  app.post('/:id/members', async (req, reply) => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const input = parse(addMemberSchema, req.body);
    await req.db(async (db) => {
      const access = await accessOrThrow(db, id, auth);
      if (!access.canManage) throw forbidden();
      await db.query(
        `INSERT INTO project_members (tenant_id, project_id, user_id, role) VALUES ($1, $2, $3, $4)
         ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
        [auth.tenantId, id, input.userId, input.role],
      );
    });
    return reply.status(204).send();
  });

  app.delete('/:id/members/:userId', async (req, reply) => {
    const auth = requireAuth(req);
    const { id, userId } = parse(memberParam, req.params);
    await req.db(async (db) => {
      const access = await accessOrThrow(db, id, auth);
      if (!access.canManage) throw forbidden();
      if (access.project.managerId === userId) throw forbidden('Không thể xoá quản lý dự án; hãy đổi quản lý trước');
      await db.query('DELETE FROM project_members WHERE project_id = $1 AND user_id = $2', [id, userId]);
    });
    return reply.status(204).send();
  });

  /* ---------- Nhật ký công trình ---------- */

  app.get('/:id/site-reports', async (req) => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const q = parse(paginationSchema, req.query);
    const cursor = decodeCursor(q.cursor);
    const rows = await req.db(async (db) => {
      await accessOrThrow(db, id, auth);
      const params: unknown[] = [id];
      let cursorSql = '';
      if (cursor) {
        params.push(cursor.ts, cursor.id);
        cursorSql = 'AND (sr.created_at, sr.id) < ($2::timestamptz, $3::uuid)';
      }
      params.push(q.limit + 1);
      const r = await db.query<SiteReportRow & { cursor_ts: string }>(
        `${SITE_REPORT_SELECT.replace('sr.created_at', 'sr.created_at, sr.created_at::text AS cursor_ts')} WHERE sr.project_id = $1 ${cursorSql}
          ORDER BY sr.created_at DESC, sr.id DESC LIMIT $${params.length}`,
        params,
      );
      return r.rows;
    });
    return pageOf(rows, q.limit, toSiteReportDto);
  });

  app.post('/:id/site-reports', async (req, reply) => {
    const auth = requireAuth(req);
    const { id } = parse(idParam, req.params);
    const input = parse(createSiteReportSchema, req.body);
    const report = await req.db(async (db) => {
      const access = await accessOrThrow(db, id, auth);
      if (!access.canContribute) throw forbidden('Chỉ thành viên dự án được ghi nhật ký');
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO site_reports (tenant_id, project_id, report_date, workforce, progress_percent, summary, issues, author_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [auth.tenantId, id, input.reportDate, input.workforce, input.progressPercent, input.summary, input.issues ?? null, auth.userId],
      );
      const r = await db.query<SiteReportRow>(`${SITE_REPORT_SELECT} WHERE sr.id = $1`, [rows[0]!.id]);
      return toSiteReportDto(r.rows[0]!);
    });
    return reply.status(201).send({ data: report });
  });
}

const SITE_REPORT_SELECT = `
  SELECT sr.id, sr.project_id, sr.report_date, sr.workforce, sr.progress_percent, sr.summary, sr.issues,
         sr.author_id, u.full_name AS author_name, sr.created_at
    FROM site_reports sr LEFT JOIN users u ON u.id = sr.author_id`;

interface SiteReportRow {
  id: string;
  project_id: string;
  report_date: string;
  workforce: number;
  progress_percent: number;
  summary: string;
  issues: string | null;
  author_id: string;
  author_name: string | null;
  created_at: Date;
}

const toSiteReportDto = (r: SiteReportRow): SiteReportDto => ({
  id: r.id,
  projectId: r.project_id,
  reportDate: r.report_date,
  workforce: r.workforce,
  progressPercent: r.progress_percent,
  summary: r.summary,
  issues: r.issues,
  authorId: r.author_id,
  authorName: r.author_name,
  createdAt: r.created_at.toISOString(),
});
