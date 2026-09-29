import { getPool, closeDb } from '../src/db';
import { runMigrations } from '../src/migrate';
import path from 'path';

afterAll(async () => {
  await closeDb();
});

describe('Database migrations', () => {
  it('should apply migrations from empty database', async () => {
    const pool = getPool();

    // Run migrations
    const migrationsDir = path.join(__dirname, '..', 'migrations');
    await runMigrations(migrationsDir);

    // Verify users table exists with correct columns
    const { rows: userCols } = await pool.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_name = 'users'
       ORDER BY ordinal_position`
    );

    const columnNames = userCols.map((c: { column_name: string }) => c.column_name);
    expect(columnNames).toContain('id');
    expect(columnNames).toContain('email');
    expect(columnNames).toContain('password_hash');
    expect(columnNames).toContain('display_name');
    expect(columnNames).toContain('is_admin');
    expect(columnNames).toContain('created_at');
    expect(columnNames).toContain('updated_at');

    // Verify sessions table exists
    const { rows: sessionCols } = await pool.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'sessions'
       ORDER BY ordinal_position`
    );

    const sessionColumnNames = sessionCols.map((c: { column_name: string }) => c.column_name);
    expect(sessionColumnNames).toContain('id');
    expect(sessionColumnNames).toContain('user_id');
    expect(sessionColumnNames).toContain('token');
    expect(sessionColumnNames).toContain('expires_at');

    // Verify migrations are tracked
    const { rows: migrations } = await pool.query('SELECT name FROM _migrations');
    expect(migrations.length).toBeGreaterThan(0);
    expect(migrations[0].name).toContain('001_');
  });

  it('should be idempotent (running twice causes no errors)', async () => {
    const migrationsDir = path.join(__dirname, '..', 'migrations');
    await runMigrations(migrationsDir);
    // Running again should not throw
    await expect(runMigrations(migrationsDir)).resolves.not.toThrow();
  });
});
