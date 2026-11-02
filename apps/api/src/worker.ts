/**
 * Worker xử lý transactional outbox. Chạy được nhiều bản song song nhờ FOR UPDATE SKIP LOCKED.
 * MVP: ghi log sự kiện. Điểm mở rộng: gửi email/Zalo OA/push, đẩy sang Kafka/SQS, webhook.
 */
import pg from 'pg';
import { loadConfig } from './config.js';

const config = loadConfig();
// Worker là tiến trình hệ thống, đọc outbox của mọi tenant (bảng outbox không bật RLS).
const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 2, application_name: 'htm-worker' });
const BATCH = 50;
const MAX_ATTEMPTS = 8;
let running = true;

type Handler = (payload: Record<string, unknown>, tenantId: string) => Promise<void>;
const handlers: Record<string, Handler> = {
  'material_request.status_changed': async (payload, tenantId) => {
    console.log(JSON.stringify({ level: 'info', msg: 'notify', tenantId, ...payload }));
  },
};

async function tick(): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ id: number; tenant_id: string; topic: string; payload: Record<string, unknown>; attempts: number }>(
      `SELECT id, tenant_id, topic, payload, attempts FROM outbox_events
        WHERE processed_at IS NULL AND available_at <= now() AND attempts < $1
        ORDER BY id LIMIT $2 FOR UPDATE SKIP LOCKED`,
      [MAX_ATTEMPTS, BATCH],
    );
    for (const ev of rows) {
      try {
        await (handlers[ev.topic] ?? (async () => undefined))(ev.payload, ev.tenant_id);
        await client.query('UPDATE outbox_events SET processed_at = now(), attempts = attempts + 1 WHERE id = $1', [ev.id]);
      } catch (err) {
        // Exponential backoff: 2^attempts giây.
        await client.query(
          `UPDATE outbox_events SET attempts = attempts + 1, last_error = $2,
                  available_at = now() + make_interval(secs => power(2, attempts + 1)) WHERE id = $1`,
          [ev.id, String((err as Error).message).slice(0, 1000)],
        );
      }
    }
    await client.query('COMMIT');
    return rows.length;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  console.log(JSON.stringify({ level: 'info', msg: 'worker started' }));
  while (running) {
    try {
      const n = await tick();
      if (n < BATCH) await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      console.error(JSON.stringify({ level: 'error', msg: 'worker tick failed', err: String(err) }));
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  await pool.end();
}

for (const sig of ['SIGTERM', 'SIGINT'] as const) process.on(sig, () => (running = false));
void main();
