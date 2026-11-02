import type { FastifyInstance } from 'fastify';
import { WITH_ME } from '../../lib/sql.js';
import { requireAuth } from '../../plugins/auth.js';
import { canSeeAllProjects } from '../projects/repo.js';
import { inboxSql, visibilitySql } from '../material-requests/routes.js';

export async function dashboardRoutes(app: FastifyInstance) {
  /** Số liệu tổng quan cho trang chủ, tính theo phạm vi người dùng được xem. */
  app.get('/summary', async (req) => {
    const auth = requireAuth(req);
    const seeAll = canSeeAllProjects(auth);
    const scope = seeAll
      ? 'TRUE'
      : `(p.manager_id = $1 OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $1))`;
    return req.db(async (db) => {
      const projects = await db.query<{ status: string; n: number }>(
        `${WITH_ME}SELECT p.status, count(*)::int AS n FROM projects p WHERE ${scope} GROUP BY p.status`,
        [auth.userId],
      );
      const requests = await db.query<{ status: string; n: number }>(
        `${WITH_ME}SELECT mr.status, count(*)::int AS n FROM material_requests mr JOIN projects p ON p.id = mr.project_id
          WHERE ${seeAll ? 'TRUE' : `(mr.requested_by = $1 OR ${scope})`} GROUP BY mr.status`,
        [auth.userId],
      );
      const vis = visibilitySql(auth);
      const inbox = await db.query<{ n: number }>(
        `${WITH_ME}SELECT count(*)::int AS n FROM material_requests mr JOIN projects p ON p.id = mr.project_id
          WHERE ${inboxSql(auth)} ${vis ? `AND ${vis}` : ''}`,
        [auth.userId],
      );
      const toMap = (rows: { status: string; n: number }[]) => Object.fromEntries(rows.map((r) => [r.status, r.n]));
      return { data: { projectsByStatus: toMap(projects.rows), requestsByStatus: toMap(requests.rows), inboxCount: inbox.rows[0]?.n ?? 0 } };
    });
  });
}
