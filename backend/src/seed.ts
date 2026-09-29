import * as argon2 from 'argon2';
import { getPool } from './db';
import { logger } from './logger';

interface SeedUser {
  email: string;
  password: string;
  display_name: string;
  is_admin: boolean;
}

const DEV_USERS: SeedUser[] = [
  { email: 'admin@dogfood.local', password: 'admin123', display_name: 'Admin User', is_admin: true },
  { email: 'organizer@dogfood.local', password: 'organizer123', display_name: 'Organizer User', is_admin: false },
  { email: 'judge@dogfood.local', password: 'judge123', display_name: 'Judge User', is_admin: false },
  { email: 'participant@dogfood.local', password: 'participant123', display_name: 'Participant User', is_admin: false },
];

export async function runSeeds(): Promise<void> {
  const pool = getPool();

  for (const user of DEV_USERS) {
    const passwordHash = await argon2.hash(user.password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });

    await pool.query(
      `INSERT INTO users (email, password_hash, display_name, is_admin)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING`,
      [user.email, passwordHash, user.display_name, user.is_admin]
    );
  }

  logger.info({ count: DEV_USERS.length }, 'Seed data applied (idempotent)');
}
