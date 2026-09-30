import { Pool, types, type PoolClient } from 'pg';
import { config } from '../config';
import { log } from '../log';

types.setTypeParser(1082, (v: string) => v);

let pool: Pool | null = null;

export function db(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: config().DATABASE_URL, max: 10 });
    pool.on('error', (err) => log.error('Ошибка пула PostgreSQL', err));
  }
  return pool;
}

export async function withTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await db().connect();
  try {
    await client.query('BEGIN');
    const res = await fn(client);
    await client.query('COMMIT');
    return res;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

export async function waitForDb(attempts = 30): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    try {
      await db().query('SELECT 1');
      return;
    } catch (e) {
      if (i === attempts) throw e;
      log.warn(`БД недоступна, попытка ${i}/${attempts}`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

export async function closeDb(): Promise<void> {
  if (pool) await pool.end();
  pool = null;
}
