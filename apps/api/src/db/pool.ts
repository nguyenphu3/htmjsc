import pg from 'pg';

// numeric/bigint -> number. An toàn với phạm vi giá trị của MVP (budget < 2^53).
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v));
// date -> chuỗi YYYY-MM-DD, tránh lệch múi giờ.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

export type Db = pg.PoolClient;

export function createPool(connectionString: string, max: number): pg.Pool {
  const pool = new pg.Pool({
    connectionString,
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
    application_name: 'htm-api',
  });
  return pool;
}

export interface TenantContext {
  tenantId: string;
  userId?: string;
}

/**
 * Chạy fn trong một transaction đã gắn tenant. RLS dùng `app.tenant_id`
 * (set_config(..., true) = chỉ trong transaction, an toàn với PgBouncer transaction pooling).
 */
export async function withTenant<T>(pool: pg.Pool, ctx: TenantContext, fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true)",
      [ctx.tenantId, ctx.userId ?? ''],
    );
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
