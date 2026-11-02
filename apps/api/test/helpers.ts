import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { SEED_PASSWORD, TEST_DB_URL } from './env.js';

export async function createTestApp(): Promise<FastifyInstance> {
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DB_URL,
    JWT_SECRET: 'test-secret-test-secret-test-secret-123',
    RATE_LIMIT_MAX: '100000',
    LOG_LEVEL: 'silent',
  });
  const app = await buildApp({ config });
  await app.ready();
  return app;
}

export interface Session {
  token: string;
  refreshToken: string;
  user: { id: string; fullName: string; roles: string[] };
}

export async function login(app: FastifyInstance, email: string, password = SEED_PASSWORD, tenant = 'htm'): Promise<Session> {
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenant, email, password } });
  if (res.statusCode !== 200) throw new Error(`login ${email} failed: ${res.statusCode} ${res.body}`);
  const body = res.json();
  return { token: body.accessToken, refreshToken: body.refreshToken, user: body.user };
}

export function as(app: FastifyInstance, s: Session) {
  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
    app.inject({ method, url: `/api/v1${url}`, payload: payload as object, headers: { authorization: `Bearer ${s.token}` } });
  return {
    get: (url: string) => call('GET', url),
    post: (url: string, body?: unknown) => call('POST', url, body ?? {}),
    patch: (url: string, body: unknown) => call('PATCH', url, body),
    del: (url: string) => call('DELETE', url),
  };
}
