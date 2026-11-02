import type { FastifyInstance, FastifyReply } from 'fastify';
import { loginSchema, refreshSchema } from '@htm/shared';
import { withTenant, type Db } from '../../db/pool.js';
import { unauthorized } from '../../lib/errors.js';
import { DUMMY_HASH, verifyPassword } from '../../lib/password.js';
import { hashToken, newRefreshToken, tenantFromRefreshToken } from '../../lib/tokens.js';
import { parse } from '../../lib/validate.js';
import { findUserById, USER_COLUMNS, toUserDto, type UserRow } from '../org/repo.js';

const REFRESH_COOKIE = 'htm_rt';
const REUSE_GRACE_MS = 10_000;

export async function authRoutes(app: FastifyInstance) {
  const { config } = app;
  const refreshTtlMs = config.REFRESH_TOKEN_TTL_DAYS * 86_400_000;

  const setRefreshCookie = (reply: FastifyReply, token: string) =>
    reply.setCookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: Math.floor(refreshTtlMs / 1000),
    });

  async function issueTokens(db: Db, user: { id: string; roles: string[] }, tenantId: string, ua?: string) {
    const accessToken = await app.tokens.signAccess({ sub: user.id, tid: tenantId, roles: user.roles });
    const refresh = newRefreshToken(tenantId);
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO refresh_tokens (tenant_id, user_id, token_hash, expires_at, user_agent)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [tenantId, user.id, refresh.hash, new Date(Date.now() + refreshTtlMs), ua?.slice(0, 300) ?? null],
    );
    return { accessToken, refreshToken: refresh.token, refreshId: rows[0]!.id, expiresIn: config.ACCESS_TOKEN_TTL_SECONDS };
  }

  // Giới hạn chặt hơn cho đăng nhập để chống brute-force.
  app.post('/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const input = parse(loginSchema, req.body);
    const tenant = await app.pool.query<{ id: string }>('SELECT id FROM tenants WHERE slug = $1', [input.tenant]);
    const tenantId = tenant.rows[0]?.id;

    const result = tenantId
      ? await withTenant(app.pool, { tenantId }, async (db) => {
          const { rows } = await db.query<UserRow & { password_hash: string }>(
            `SELECT ${USER_COLUMNS}, u.password_hash FROM users u WHERE u.email = $1`,
            [input.email],
          );
          const row = rows[0];
          const ok = await verifyPassword(input.password, row?.password_hash ?? DUMMY_HASH);
          if (!row || !ok || row.status !== 'active') return null;
          await db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [row.id]);
          const tokens = await issueTokens(db, row, tenantId, req.headers['user-agent']);
          return { user: toUserDto(row), tokens };
        })
      : (await verifyPassword(input.password, DUMMY_HASH), null);

    if (!result) throw unauthorized('Sai tổ chức, email hoặc mật khẩu');
    setRefreshCookie(reply, result.tokens.refreshToken);
    return {
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      expiresIn: result.tokens.expiresIn,
      user: result.user,
    };
  });

  app.post('/refresh', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const raw =
      (req.body as { refreshToken?: string } | undefined)?.refreshToken ?? req.cookies[REFRESH_COOKIE] ?? undefined;
    // Thiếu/sai định dạng token = chưa đăng nhập (401), không phải lỗi dữ liệu (422).
    const parsed = refreshSchema.safeParse({ refreshToken: raw });
    if (!parsed.success) throw unauthorized();
    const { refreshToken } = parsed.data;
    const tenantId = tenantFromRefreshToken(refreshToken);
    if (!tenantId) throw unauthorized();

    const result = await withTenant(app.pool, { tenantId }, async (db) => {
      const { rows } = await db.query<{
        id: string;
        user_id: string;
        expires_at: Date;
        revoked_at: Date | null;
        replaced_by: string | null;
      }>(
        'SELECT id, user_id, expires_at, revoked_at, replaced_by FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE',
        [hashToken(refreshToken)],
      );
      const rt = rows[0];
      if (!rt) return { kind: 'invalid' as const };
      if (rt.revoked_at) {
        // Cửa sổ ân hạn: hai tab cùng refresh gần như đồng thời -> không coi là tấn công.
        if (rt.replaced_by && Date.now() - rt.revoked_at.getTime() < REUSE_GRACE_MS) return { kind: 'invalid' as const };
        // Token đã xoay vòng bị dùng lại -> có thể bị đánh cắp: thu hồi toàn bộ phiên của user.
        await db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [
          rt.user_id,
        ]);
        return { kind: 'reused' as const };
      }
      if (rt.expires_at.getTime() < Date.now()) return { kind: 'invalid' as const };
      const user = await findUserById(db, rt.user_id);
      if (!user || user.status !== 'active') return { kind: 'invalid' as const };
      const tokens = await issueTokens(db, user, tenantId, req.headers['user-agent']);
      await db.query('UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2 WHERE id = $1', [
        rt.id,
        tokens.refreshId,
      ]);
      return { kind: 'ok' as const, user, tokens };
    });

    if (result.kind !== 'ok') {
      reply.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
      throw unauthorized();
    }
    setRefreshCookie(reply, result.tokens.refreshToken);
    return {
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      expiresIn: result.tokens.expiresIn,
      user: result.user,
    };
  });

  app.post('/logout', async (req, reply) => {
    const raw = (req.body as { refreshToken?: string } | undefined)?.refreshToken ?? req.cookies[REFRESH_COOKIE];
    const tenantId = raw ? tenantFromRefreshToken(raw) : null;
    if (raw && tenantId) {
      await withTenant(app.pool, { tenantId }, (db) =>
        db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [
          hashToken(raw),
        ]),
      );
    }
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    return reply.status(204).send();
  });

  app.get('/me', { onRequest: app.authenticate }, async (req) => {
    const user = await req.db((db) => findUserById(db, req.auth!.userId));
    if (!user || user.status !== 'active') throw unauthorized();
    return { user };
  });
}
