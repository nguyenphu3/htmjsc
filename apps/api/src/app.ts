import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { Config } from './config.js';
import { createPool } from './db/pool.js';
import { AppError } from './lib/errors.js';
import { TokenService } from './lib/tokens.js';
import { authPlugin } from './plugins/auth.js';
import { authRoutes } from './modules/auth/routes.js';
import { orgRoutes } from './modules/org/routes.js';
import { projectRoutes } from './modules/projects/routes.js';
import { materialRequestRoutes } from './modules/material-requests/routes.js';
import { dashboardRoutes } from './modules/dashboard/routes.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
    pool: pg.Pool;
    tokens: TokenService;
  }
}

export interface BuildOptions {
  config: Config;
  pool?: pg.Pool;
}

export async function buildApp({ config, pool }: BuildOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      config.NODE_ENV === 'test'
        ? false
        : {
            level: config.LOG_LEVEL,
            redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
            ...(config.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
          },
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 1024 * 1024,
    genReqId: (req) => (req.headers['x-request-id'] as string | undefined)?.slice(0, 64) || randomUUID(),
  });

  app.decorate('config', config);
  app.decorate('pool', pool ?? createPool(config.DATABASE_URL, config.DB_POOL_MAX));
  app.decorate('tokens', new TokenService(config.JWT_SECRET, config.JWT_ISSUER, config.ACCESS_TOKEN_TTL_SECONDS));
  app.addHook('onClose', async () => {
    if (!pool) await app.pool.end();
  });
  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: config.CORS_ORIGINS.length ? config.CORS_ORIGINS : false, credentials: true });
  await app.register(cookie);
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: '1 minute',
    // Ở quy mô lớn: truyền `redis` để chia sẻ bộ đếm giữa các instance.
    keyGenerator: (req) => req.ip,
  });
  await app.register(authPlugin);

  app.setErrorHandler((err: Error & { statusCode?: number; code?: string }, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({
        error: { code: err.code, message: err.message, details: err.details, requestId: req.id },
      });
    }
    const pgCode = err.code;
    if (pgCode === '23505') {
      return reply
        .status(409)
        .send({ error: { code: 'CONFLICT', message: 'Dữ liệu đã tồn tại', requestId: req.id } });
    }
    if (pgCode === '23503' || pgCode === '22P02') {
      return reply
        .status(422)
        .send({ error: { code: 'INVALID_REFERENCE', message: 'Tham chiếu không hợp lệ', requestId: req.id } });
    }
    const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    if (status >= 500) req.log.error({ err }, 'unhandled error');
    return reply.status(status).send({
      error: {
        code: status === 429 ? 'RATE_LIMITED' : status >= 500 ? 'INTERNAL' : 'BAD_REQUEST',
        message: status >= 500 ? 'Lỗi hệ thống, vui lòng thử lại' : err.message,
        requestId: req.id,
      },
    });
  });

  app.setNotFoundHandler((req, reply) =>
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Không tìm thấy endpoint', requestId: req.id } }),
  );

  app.get('/healthz', { logLevel: 'silent' }, async () => ({ status: 'ok' }));
  app.get('/readyz', { logLevel: 'silent' }, async (_req, reply) => {
    try {
      await app.pool.query('SELECT 1');
      return { status: 'ready' };
    } catch {
      return reply.status(503).send({ status: 'unavailable' });
    }
  });

  await app.register(
    async (api) => {
      await api.register(authRoutes, { prefix: '/auth' });
      await api.register(async (secured) => {
        secured.addHook('onRequest', secured.authenticate);
        await secured.register(orgRoutes);
        await secured.register(projectRoutes, { prefix: '/projects' });
        await secured.register(materialRequestRoutes, { prefix: '/material-requests' });
        await secured.register(dashboardRoutes, { prefix: '/dashboard' });
      });
    },
    { prefix: '/api/v1' },
  );

  return app;
}
