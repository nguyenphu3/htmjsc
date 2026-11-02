import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

export interface AccessClaims {
  sub: string;
  tid: string;
  roles: string[];
}

export class TokenService {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    private readonly issuer: string,
    private readonly accessTtlSeconds: number,
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  async signAccess(claims: AccessClaims): Promise<string> {
    return new SignJWT({ tid: claims.tid, roles: claims.roles })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuer(this.issuer)
      .setIssuedAt()
      .setExpirationTime(`${this.accessTtlSeconds}s`)
      .sign(this.key);
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    const { payload } = await jwtVerify(token, this.key, { issuer: this.issuer, algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string' || typeof payload.tid !== 'string' || !Array.isArray(payload.roles)) {
      throw new Error('invalid claims');
    }
    return { sub: payload.sub, tid: payload.tid, roles: payload.roles.map(String) };
  }
}

/** Refresh token dạng `<tenantId>.<random>`: tenant giúp đặt ngữ cảnh RLS trước khi tra cứu. */
export function newRefreshToken(tenantId: string): { token: string; hash: string } {
  const token = `${tenantId}.${randomBytes(32).toString('base64url')}`;
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function tenantFromRefreshToken(token: string): string | null {
  const [tid, rest] = token.split('.');
  return tid && rest && /^[0-9a-f-]{36}$/i.test(tid) ? tid : null;
}
