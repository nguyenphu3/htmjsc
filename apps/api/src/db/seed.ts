import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { withTenant } from './pool.js';
import { hashPassword } from '../lib/password.js';
import { DEPARTMENT_HEADS, DEPARTMENTS, TENANT, USERS, emailFor } from './seed-data.js';

/**
 * Seed idempotent: tạo tenant H.T.M, cây phòng ban và 45 tài khoản theo sơ đồ tổ chức.
 * SEED_DEMO=true tạo thêm 2 dự án mẫu để trải nghiệm luồng đề nghị vật tư.
 */
export async function seed(connectionString: string, password: string, demo: boolean, log = console.log) {
  const pool = new pg.Pool({ connectionString, max: 2 });
  try {
    const existing = await pool.query<{ id: string }>('SELECT id FROM tenants WHERE slug = $1', [TENANT.slug]);
    if (existing.rows[0]) {
      log(`✓ tenant "${TENANT.slug}" đã tồn tại, bỏ qua seed`);
      return existing.rows[0].id;
    }
    const { rows } = await pool.query<{ id: string }>('INSERT INTO tenants (slug, name) VALUES ($1, $2) RETURNING id', [
      TENANT.slug,
      TENANT.name,
    ]);
    const tenantId = rows[0]!.id;
    const passwordHash = await hashPassword(password);

    await withTenant(pool, { tenantId }, async (db) => {
      const deptIds = new Map<string, string>();
      for (const d of DEPARTMENTS) {
        const r = await db.query<{ id: string }>(
          'INSERT INTO departments (tenant_id, code, name, parent_id, decision_ref) VALUES ($1, $2, $3, $4, $5) RETURNING id',
          [tenantId, d.code, d.name, d.parent ? deptIds.get(d.parent) : null, d.decisionRef ?? null],
        );
        deptIds.set(d.code, r.rows[0]!.id);
      }

      const userIds = new Map<string, string>();
      const taken = new Set<string>();
      for (const u of USERS) {
        const email = u.key === 'dat-gd' ? 'admin@htm.local' : emailFor(u.fullName, taken);
        const r = await db.query<{ id: string }>(
          `INSERT INTO users (tenant_id, email, full_name, password_hash, title, grade_code, department_id, roles)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [tenantId, email, u.fullName, passwordHash, u.title, u.gradeCode ?? null, deptIds.get(u.dept), u.roles],
        );
        userIds.set(u.key, r.rows[0]!.id);
      }
      for (const u of USERS) {
        if (u.manager) await db.query('UPDATE users SET manager_id = $2 WHERE id = $1', [userIds.get(u.key), userIds.get(u.manager)]);
      }
      for (const [code, key] of Object.entries(DEPARTMENT_HEADS)) {
        await db.query('UPDATE departments SET head_user_id = $2 WHERE id = $1', [deptIds.get(code), userIds.get(key)]);
      }

      if (demo) {
        const id = (k: string) => userIds.get(k)!;
        const projects = [
          { code: 'DA-2026-HCM01', name: 'Lắp đặt phòng mổ sạch – Bệnh viện mẫu TP.HCM', region: 'south', manager: 'phu', members: ['dang', 'doan', 'tuan', 'quy', 'long'] },
          { code: 'DA-2026-HN01', name: 'Hệ thống khí y tế – Bệnh viện mẫu Hà Nội', region: 'north', manager: 'bau', members: ['hung', 'hoang', 'loi', 'truong'] },
        ];
        for (const p of projects) {
          const r = await db.query<{ id: string }>(
            `INSERT INTO projects (tenant_id, code, name, client_name, region, status, manager_id, start_date, created_by)
             VALUES ($1, $2, $3, 'Khách hàng mẫu', $4, 'active', $5, '2026-08-01', $6) RETURNING id`,
            [tenantId, p.code, p.name, p.region, id(p.manager), id('thin')],
          );
          const pid = r.rows[0]!.id;
          await db.query(
            `INSERT INTO project_members (tenant_id, project_id, user_id, role)
             SELECT $1, $2, u, CASE WHEN u = $3 THEN 'manager' ELSE 'member' END FROM unnest($4::uuid[]) u`,
            [tenantId, pid, id(p.manager), [id(p.manager), ...p.members.map(id)]],
          );
        }
        log('✓ đã tạo 2 dự án mẫu');
      }
    });
    log(`✓ seed tenant "${TENANT.slug}": ${DEPARTMENTS.length} phòng ban, ${USERS.length} người dùng`);
    return tenantId;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  const password = process.env.SEED_PASSWORD;
  if (!url || !password || password.length < 10) {
    console.error('Cần MIGRATION_DATABASE_URL và SEED_PASSWORD (tối thiểu 10 ký tự)');
    process.exit(1);
  }
  seed(url, password, process.env.SEED_DEMO === 'true').catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
