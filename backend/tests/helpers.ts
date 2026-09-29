import supertest from 'supertest';
import app from '../src/app';
import { getPool, closeDb } from '../src/db';
import { runMigrations } from '../src/migrate';
import path from 'path';

export const request = supertest(app);

export async function setupTestDb(): Promise<void> {
  const { config } = require('../src/config');
  if (!config.DATABASE_URL.endsWith('_test')) {
    throw new Error('FATAL: Test environment is pointing to a non-test database: ' + config.DATABASE_URL);
  }
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  await runMigrations(migrationsDir);
}

export async function cleanTestDb(): Promise<void> {
  const pool = getPool();
  await pool.query('TRUNCATE audit_events CASCADE');
  await pool.query('DELETE FROM evaluation_scores');
  await pool.query('DELETE FROM evaluations');
  await pool.query('DELETE FROM judge_assignments');
  await pool.query('DELETE FROM submissions');
  await pool.query('DELETE FROM team_members');
  await pool.query('DELETE FROM teams');
  await pool.query('DELETE FROM hackathons');
  await pool.query('DELETE FROM rubric_criteria');
  await pool.query('DELETE FROM judging_policies');
  await pool.query('DELETE FROM sessions');
  await pool.query('DELETE FROM users');
}

export async function teardownTestDb(): Promise<void> {
  await closeDb();
}

export async function registerUser(
  email = 'test@example.com',
  password = 'password123',
  displayName = 'Test User'
): Promise<supertest.Response> {
  return request
    .post('/api/auth/register')
    .send({ email, password, display_name: displayName });
}

export async function loginUser(
  email = 'test@example.com',
  password = 'password123'
): Promise<supertest.Response> {
  return request
    .post('/api/auth/login')
    .send({ email, password });
}
