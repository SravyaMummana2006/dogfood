import { getPool } from '../src/db';
import * as argon2 from 'argon2';

async function repair() {
  const pool = getPool();
  try {
    const targets = ['organizer@dogfood.local', 'participant@dogfood.local'];
    
    // 1. Verify exactly one user exists for each target email
    for (const email of targets) {
      const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (rows.length === 0) {
        throw new Error(`Abort: User ${email} is missing`);
      }
      if (rows.length > 1) {
        throw new Error(`Abort: User ${email} is duplicated`);
      }
    }
    
    // 2. Safely synchronize ONLY the password_hash
    const passwordHash = await argon2.hash('dogfood2026', {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    
    for (const email of targets) {
      await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [passwordHash, email]);
      console.log(`Successfully synchronized password for ${email}`);
    }
    
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    pool.end();
  }
}

repair();
