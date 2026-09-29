import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { getPool } from './db';
import { logger } from './logger';

export async function runMigrations(migrationsDir?: string): Promise<void> {
  const dir = migrationsDir || join(__dirname, '..', 'migrations');
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { rows: applied } = await pool.query(
    'SELECT name FROM _migrations ORDER BY name'
  );
  const appliedSet = new Set(applied.map((r: { name: string }) => r.name));

  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  } catch {
    logger.warn({ dir }, 'Migrations directory not found, skipping');
    return;
  }

  for (const file of files) {
    if (appliedSet.has(file)) {
      logger.debug({ migration: file }, 'Migration already applied, skipping');
      continue;
    }

    const sql = await readFile(join(dir, file), 'utf-8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      logger.info({ migration: file }, 'Migration applied successfully');
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error({ migration: file }, 'Migration failed, rolled back');
      throw err;
    } finally {
      client.release();
    }
  }

  logger.info({ count: files.length }, 'Migration check complete');
}
