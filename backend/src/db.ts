import { Pool, PoolConfig } from 'pg';
import { config } from './config';
import { logger } from './logger';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const poolConfig: PoolConfig = {
      connectionString: config.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };
    pool = new Pool(poolConfig);

    pool.on('error', (err) => {
      logger.error(err, 'Unexpected database pool error');
    });
  }
  return pool;
}

export async function initDb(): Promise<void> {
  const p = getPool();
  const client = await p.connect();
  try {
    const result = await client.query('SELECT NOW() AS now');
    logger.info({ time: result.rows[0].now }, 'Database connected');
  } finally {
    client.release();
  }
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database pool closed');
  }
}
