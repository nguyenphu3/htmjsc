import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { Role } from '@htm/shared';
import { withTenant, type Db } from '../db/pool.js';
import { forbidden, unauthorized } from '../lib/errors.js';

export interface AuthContext {
  userId: string;
  tenantId: string;
  roles: string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
    /** Transaction đã gắn tenant + user của người gọi. */
    db<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export function requireAuth(req: FastifyRequest): AuthContext {
  if (!req.auth) throw unauthorized();
  return req.auth;
}

export function requireRole(req: FastifyRequest, ...roles: Role[]): AuthContext {
  const auth = requireAuth(req);
  if (!roles.some((r) => auth.roles.includes(r))) throw forbidden();
  return auth;
}

export const authPlugin = fp(async function authPlugin(app: FastifyInstance) {
  app.decorateRequest('auth', null);
  app.decorateRequest('db', function (this: FastifyRequest, fn: (db: Db) => Promise<unknown>) {
    const auth = requireAuth(this);
    return withTenant(app.pool, { tenantId: auth.tenantId, userId: auth.userId }, fn);
  } as FastifyRequest['db']);

  app.decorate('authenticate', async (req: FastifyRequest) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized();
    try {
      const claims = await app.tokens.verifyAccess(header.slice(7));
      req.auth = { userId: claims.sub, tenantId: claims.tid, roles: claims.roles };
    } catch {
      throw unauthorized();
    }
  });
});
