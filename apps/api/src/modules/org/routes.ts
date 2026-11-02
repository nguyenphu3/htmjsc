import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createUserSchema, listUsersQuery, ROLES } from '@htm/shared';
import { notFound } from '../../lib/errors.js';
import { hashPassword } from '../../lib/password.js';
import { parse } from '../../lib/validate.js';
import { requireRole } from '../../plugins/auth.js';
import { findUserById, listDepartments, toUserDto, USER_COLUMNS, type UserRow } from './repo.js';

const idParam = z.object({ id: z.string().uuid() });

const updateUserSchema = z.object({
  fullName: z.string().trim().min(1).max(200).optional(),
  title: z.string().trim().max(200).nullable().optional(),
  gradeCode: z.string().trim().max(16).nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  managerId: z.string().uuid().nullable().optional(),
  roles: z.array(z.enum(ROLES)).min(1).optional(),
  status: z.enum(['active', 'disabled']).optional(),
});

export async function orgRoutes(app: FastifyInstance) {
  app.get('/departments', async (req) => ({ data: await req.db(listDepartments) }));

  app.get('/users', async (req) => {
    const q = parse(listUsersQuery, req.query);
    const params: unknown[] = [];
    const where: string[] = ["u.status = 'active'"];
    if (q.departmentId) {
      params.push(q.departmentId);
      where.push(`u.department_id = $${params.length}`);
    }
    if (q.q) {
      params.push(`%${q.q}%`);
      where.push(`(u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
    }
    params.push(q.limit);
    const rows = await req.db(async (db) => {
      const r = await db.query<UserRow>(
        `SELECT ${USER_COLUMNS} FROM users u WHERE ${where.join(' AND ')}
          ORDER BY u.full_name LIMIT $${params.length}`,
        params,
      );
      return r.rows;
    });
    return { data: rows.map(toUserDto) };
  });

  app.get('/users/:id', async (req) => {
    const { id } = parse(idParam, req.params);
    const user = await req.db((db) => findUserById(db, id));
    if (!user) throw notFound('Người dùng');
    return { data: user };
  });

  app.post('/users', async (req, reply) => {
    const auth = requireRole(req, 'admin');
    const input = parse(createUserSchema, req.body);
    const passwordHash = await hashPassword(input.password);
    const user = await req.db(async (db) => {
      const { rows } = await db.query<UserRow>(
        `INSERT INTO users AS u (tenant_id, email, full_name, password_hash, title, grade_code, department_id, manager_id, roles)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING ${USER_COLUMNS}`,
        [
          auth.tenantId,
          input.email,
          input.fullName,
          passwordHash,
          input.title ?? null,
          input.gradeCode ?? null,
          input.departmentId ?? null,
          input.managerId ?? null,
          input.roles,
        ],
      );
      return toUserDto(rows[0]!);
    });
    return reply.status(201).send({ data: user });
  });

  app.patch('/users/:id', async (req) => {
    requireRole(req, 'admin');
    const { id } = parse(idParam, req.params);
    const input = parse(updateUserSchema, req.body);
    const map: Record<string, string> = {
      fullName: 'full_name',
      title: 'title',
      gradeCode: 'grade_code',
      departmentId: 'department_id',
      managerId: 'manager_id',
      roles: 'roles',
      status: 'status',
    };
    const sets: string[] = [];
    const params: unknown[] = [id];
    for (const [k, v] of Object.entries(input)) {
      if (v === undefined) continue;
      params.push(v);
      sets.push(`${map[k]} = $${params.length}`);
    }
    const user = await req.db(async (db) => {
      if (sets.length) {
        const r = await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1`, params);
        if (r.rowCount === 0) return null;
        if (input.status === 'disabled') {
          await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [id]);
        }
      }
      return findUserById(db, id);
    });
    if (!user) throw notFound('Người dùng');
    return { data: user };
  });
}
