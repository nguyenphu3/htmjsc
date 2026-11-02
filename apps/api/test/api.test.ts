import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/lib/password.js';
import { as, createTestApp, login, type Session } from './helpers.js';
import { TEST_MIGRATION_URL } from './env.js';

let app: FastifyInstance;
let director: Session; // Nguyễn Tuấn Đạt
let phu: Session; // Phó P. Dự án, quản lý dự án miền Nam
let dang: Session; // CB công trình, thành viên dự án HCM
let hung: Session; // CB công trình, KHÔNG thuộc dự án HCM
let hong: Session; // Mua hàng
let quan: Session; // Xưởng
let hcmProjectId: string;

beforeAll(async () => {
  app = await createTestApp();
  [director, phu, dang, hung, hong, quan] = await Promise.all([
    login(app, 'admin@htm.local'),
    login(app, 'nguyen.van.phu@htm.local'),
    login(app, 'nguyen.ba.dang@htm.local'),
    login(app, 'tran.van.hung@htm.local'),
    login(app, 'nguyen.thi.anh.hong@htm.local'),
    login(app, 'dien.van.quan@htm.local'),
  ]);
  const list = await as(app, phu).get('/projects?mine=true');
  hcmProjectId = list.json().data.find((p: { code: string }) => p.code === 'DA-2026-HCM01').id;
});

afterAll(async () => {
  await app.close();
});

describe('health', () => {
  it('liveness and readiness', async () => {
    expect((await app.inject('/healthz')).statusCode).toBe(200);
    expect((await app.inject('/readyz')).json()).toEqual({ status: 'ready' });
  });
});

describe('auth', () => {
  it('rejects wrong password and unknown tenant with the same error', async () => {
    const a = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenant: 'htm', email: 'admin@htm.local', password: 'nope' } });
    const b = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenant: 'xxx', email: 'admin@htm.local', password: 'nope' } });
    expect(a.statusCode).toBe(401);
    expect(b.statusCode).toBe(401);
    expect(a.json().error.message).toBe(b.json().error.message);
  });

  it('requires a bearer token', async () => {
    expect((await app.inject('/api/v1/projects')).statusCode).toBe(401);
    const bad = await app.inject({ url: '/api/v1/projects', headers: { authorization: 'Bearer abc' } });
    expect(bad.statusCode).toBe(401);
  });

  it('treats a missing refresh token as signed out', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('returns the current user', async () => {
    const res = await as(app, phu).get('/auth/me');
    expect(res.json().user.fullName).toBe('Nguyễn Văn Phú');
    expect(res.json().user).not.toHaveProperty('passwordHash');
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const s = await login(app, 'le.thi.hoa@htm.local');
    const r1 = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: s.refreshToken } });
    expect(r1.statusCode).toBe(200);
    const rotated = r1.json().refreshToken as string;
    expect(rotated).not.toBe(s.refreshToken);

    // dùng lại ngay (trong cửa sổ ân hạn, ví dụ 2 tab) -> 401 nhưng phiên mới vẫn sống
    const quick = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: s.refreshToken } });
    expect(quick.statusCode).toBe(401);

    // dùng lại sau cửa sổ ân hạn -> nghi bị đánh cắp: thu hồi cả họ token
    const c = new pg.Client({ connectionString: TEST_MIGRATION_URL });
    await c.connect();
    await c.query('BEGIN');
    await c.query("SELECT set_config('app.tenant_id', $1, true)", [rotated.split('.')[0]]);
    const upd = await c.query("UPDATE refresh_tokens SET revoked_at = now() - interval '1 minute' WHERE user_id = $1 AND revoked_at IS NOT NULL", [s.user.id]);
    await c.query('COMMIT');
    expect(upd.rowCount).toBe(1);
    await c.end();
    const reuse = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: s.refreshToken } });
    expect(reuse.statusCode).toBe(401);
    const r2 = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: rotated } });
    expect(r2.statusCode).toBe(401);
  });
});

describe('org', () => {
  it('lists departments from the org chart with member counts', async () => {
    const res = await as(app, dang).get('/departments');
    const byCode = Object.fromEntries(res.json().data.map((d: { code: string; memberCount: number }) => [d.code, d.memberCount]));
    expect(byCode).toMatchObject({ DA: 26, HCKT: 8, DVBH: 4, XSX: 6, BGD: 1 });
  });

  it('only admins can create users', async () => {
    const payload = { email: 'new@htm.local', fullName: 'Người Mới', password: 'long-enough-pass', roles: ['staff'] };
    expect((await as(app, phu).post('/users', payload)).statusCode).toBe(403);
    const ok = await as(app, director).post('/users', payload);
    expect(ok.statusCode).toBe(201);
    expect((await as(app, director).post('/users', payload)).statusCode).toBe(409);
  });
});

describe('projects', () => {
  it('hides projects from non-members', async () => {
    expect((await as(app, hung).get(`/projects/${hcmProjectId}`)).statusCode).toBe(404);
    expect((await as(app, dang).get(`/projects/${hcmProjectId}`)).statusCode).toBe(200);
    const hungList = await as(app, hung).get('/projects');
    expect(hungList.json().data.map((p: { code: string }) => p.code)).toEqual(['DA-2026-HN01']);
  });

  it('managers create projects and paginate with cursors', async () => {
    for (let i = 1; i <= 3; i++) {
      const res = await as(app, phu).post('/projects', {
        code: `TEST-${i}`,
        name: `Dự án thử ${i}`,
        region: 'south',
        managerId: phu.user.id,
      });
      expect(res.statusCode).toBe(201);
    }
    expect((await as(app, dang).post('/projects', { code: 'X1', name: 'X', region: 'south', managerId: dang.user.id })).statusCode).toBe(403);

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const res = await as(app, phu).get(`/projects?mine=true&limit=2${cursor ? `&cursor=${cursor}` : ''}`);
      const body = res.json();
      seen.push(...body.data.map((p: { code: string }) => p.code));
      cursor = body.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(4);
    expect(new Set(seen).size).toBe(4);
  });

  it('validates input', async () => {
    const res = await as(app, phu).post('/projects', { code: 'bad code!', name: '', region: 'mars', managerId: 'x' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('VALIDATION_FAILED');
  });

  it('members write site reports; progress shows on the project', async () => {
    const res = await as(app, dang).post(`/projects/${hcmProjectId}/site-reports`, {
      reportDate: '2026-11-02',
      workforce: 8,
      progressPercent: 35,
      summary: 'Lắp khung trần phòng mổ số 2',
    });
    expect(res.statusCode).toBe(201);
    const p = await as(app, phu).get(`/projects/${hcmProjectId}`);
    expect(p.json().data.latestProgress).toBe(35);
    expect((await as(app, hung).post(`/projects/${hcmProjectId}/site-reports`, { reportDate: '2026-11-02', workforce: 1, progressPercent: 1, summary: 'x' })).statusCode).toBe(404);
  });
});

describe('material request workflow', () => {
  const body = () => ({
    projectId: hcmProjectId,
    title: 'Vật tư trần phòng mổ',
    fulfillment: 'purchase',
    neededBy: '2026-11-20',
    items: [
      { name: 'Tấm panel inox', unit: 'tấm', quantity: 24 },
      { name: 'Đèn LED phòng sạch', spec: '600x600', unit: 'bộ', quantity: 12.5 },
    ],
  });

  it('runs draft → submitted → approved → in_progress → delivered with the right people', async () => {
    const created = await as(app, dang).post('/material-requests', body());
    expect(created.statusCode).toBe(201);
    const mr = created.json().data;
    expect(mr.code).toMatch(/^VT-\d{4}-\d{5}$/);
    expect(mr.status).toBe('draft');
    expect(mr.items).toHaveLength(2);
    expect(mr.items[1].quantity).toBe(12.5);
    expect(mr.actions).toEqual(expect.arrayContaining(['submit', 'cancel']));

    const t = (s: Session, action: string, comment?: string) =>
      as(app, s).post(`/material-requests/${mr.id}/transitions`, { action, comment });

    expect((await t(dang, 'submit')).statusCode).toBe(200);
    expect((await t(dang, 'approve')).statusCode).toBe(403); // người lập không tự duyệt
    expect((await t(hong, 'approve')).statusCode).toBe(403); // mua hàng không duyệt

    const inbox = await as(app, phu).get('/material-requests?view=inbox');
    expect(inbox.json().data.map((x: { id: string }) => x.id)).toContain(mr.id);

    expect((await t(phu, 'approve', 'OK')).statusCode).toBe(200);
    expect((await t(phu, 'approve')).statusCode).toBe(409); // đã duyệt rồi
    expect((await t(quan, 'start')).statusCode).toBe(403); // đề nghị mua -> không phải việc của xưởng
    expect((await t(hong, 'start')).statusCode).toBe(200);
    const done = await t(hong, 'deliver');
    expect(done.statusCode).toBe(200);
    expect(done.json().data.status).toBe('delivered');
    expect(done.json().data.events.map((e: { action: string }) => e.action)).toEqual([
      'create',
      'submit',
      'approve',
      'start',
      'deliver',
    ]);
  });

  it('requires a reason to reject, then lets the requester revise', async () => {
    const mr = (await as(app, dang).post('/material-requests', { ...body(), fulfillment: 'production', submit: true })).json().data;
    expect(mr.status).toBe('submitted');
    const t = (s: Session, action: string, comment?: string) =>
      as(app, s).post(`/material-requests/${mr.id}/transitions`, { action, comment });
    expect((await t(phu, 'reject')).statusCode).toBe(422);
    expect((await t(phu, 'reject', 'Thiếu bản vẽ shop')).json().data.status).toBe('rejected');
    expect((await t(dang, 'reopen')).json().data.status).toBe('draft');
    const edited = await as(app, dang).patch(`/material-requests/${mr.id}`, { items: [{ name: 'Khung nhôm', unit: 'm', quantity: 40 }] });
    expect(edited.json().data.items).toHaveLength(1);
    expect((await t(dang, 'submit')).statusCode).toBe(200);
    expect((await t(director, 'approve')).statusCode).toBe(200);
    expect((await t(quan, 'start')).statusCode).toBe(200); // đề nghị sản xuất -> xưởng xử lý
  });

  it('only one of two concurrent approvals wins', async () => {
    const mr = (await as(app, dang).post('/material-requests', { ...body(), submit: true })).json().data;
    const results = await Promise.all([
      as(app, phu).post(`/material-requests/${mr.id}/transitions`, { action: 'approve' }),
      as(app, director).post(`/material-requests/${mr.id}/transitions`, { action: 'approve' }),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  });

  it('non-members cannot see or create requests for the project', async () => {
    expect((await as(app, hung).post('/material-requests', body())).statusCode).toBe(404);
    const list = await as(app, hung).get(`/material-requests?projectId=${hcmProjectId}`);
    expect(list.json().data).toHaveLength(0);
  });

  it('writes outbox events in the same transaction', async () => {
    const c = new pg.Client({ connectionString: TEST_MIGRATION_URL });
    await c.connect();
    const { rows } = await c.query("SELECT count(*)::int AS n FROM outbox_events WHERE topic = 'material_request.status_changed'");
    await c.end();
    expect(rows[0].n).toBeGreaterThanOrEqual(10);
  });

  it('dashboard counts the inbox', async () => {
    const res = await as(app, hong).get('/dashboard/summary');
    expect(res.statusCode).toBe(200);
    expect(res.json().data.inboxCount).toBeGreaterThanOrEqual(1);
  });
});

describe('tenant isolation (RLS)', () => {
  it('a second tenant cannot see the first tenant data even with a valid id', async () => {
    const c = new pg.Client({ connectionString: TEST_MIGRATION_URL });
    await c.connect();
    const t = await c.query<{ id: string }>("INSERT INTO tenants (slug, name) VALUES ('other', 'Other Co') RETURNING id");
    const tid = t.rows[0]!.id;
    await c.query('BEGIN');
    await c.query("SELECT set_config('app.tenant_id', $1, true)", [tid]);
    await c.query(
      "INSERT INTO users (tenant_id, email, full_name, password_hash, roles) VALUES ($1, 'boss@other.local', 'Boss', $2, ARRAY['admin','director'])",
      [tid, await hashPassword('Other-Password-1')],
    );
    await c.query('COMMIT');
    await c.end();

    const other = await login(app, 'boss@other.local', 'Other-Password-1', 'other');
    expect((await as(app, other).get(`/projects/${hcmProjectId}`)).statusCode).toBe(404);
    expect((await as(app, other).get('/projects')).json().data).toHaveLength(0);
    expect((await as(app, other).get('/users')).json().data).toHaveLength(1);
  });

  it('the app role cannot read rows without a tenant context', async () => {
    const { TEST_DB_URL } = await import('./env.js');
    const c = new pg.Client({ connectionString: TEST_DB_URL });
    await c.connect();
    const { rows } = await c.query('SELECT count(*)::int AS n FROM users');
    await c.end();
    expect(rows[0].n).toBe(0);
  });
});
