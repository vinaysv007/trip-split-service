import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { getEnv } from '../libs/env.js';
import * as schema from './schema.js';

const env = getEnv();

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: true } : false,
});

// An idle client erroring must not crash the process with an unhandled 'error' event.
pool.on('error', (err) => {
  console.error('Unexpected Postgres pool error:', err);
});

export const db = drizzle(pool, { schema });

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Run multi-table writes atomically. */
export function withTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(fn);
}

export async function closeDb(): Promise<void> {
  await pool.end();
}
