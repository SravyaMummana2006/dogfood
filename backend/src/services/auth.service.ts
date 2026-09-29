import * as argon2 from 'argon2';
import crypto from 'crypto';
import { getPool } from '../db';
import { config } from '../config';
import { AuthenticationError, ConflictError } from '../errors';

export interface RegisterInput {
  email: string;
  password: string;
  display_name: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface UserResponse {
  id: string;
  email: string;
  display_name: string;
  is_admin: boolean;
  created_at: string;
}

export interface LoginResponse {
  user: UserResponse;
  token: string;
  expires_at: string;
}

export async function register(input: RegisterInput): Promise<UserResponse> {
  const pool = getPool();

  const passwordHash = await argon2.hash(input.password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  try {
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, display_name, is_admin, created_at`,
      [input.email, passwordHash, input.display_name]
    );
    return rows[0];
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === '23505') {
      throw new ConflictError('A user with this email already exists');
    }
    throw err;
  }
}

export async function login(input: LoginInput): Promise<LoginResponse> {
  const pool = getPool();

  const { rows: users } = await pool.query(
    'SELECT id, email, password_hash, display_name, is_admin, created_at FROM users WHERE email = $1',
    [input.email]
  );

  if (users.length === 0) {
    throw new AuthenticationError('Invalid email or password');
  }

  const user = users[0];

  const valid = await argon2.verify(user.password_hash, input.password);
  if (!valid) {
    throw new AuthenticationError('Invalid email or password');
  }

  const token = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(
    Date.now() + config.SESSION_TTL_HOURS * 60 * 60 * 1000
  );

  await pool.query(
    'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [user.id, token, expiresAt]
  );

  return {
    user: {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      is_admin: user.is_admin,
      created_at: user.created_at,
    },
    token,
    expires_at: expiresAt.toISOString(),
  };
}

export async function logout(token: string): Promise<void> {
  await getPool().query('DELETE FROM sessions WHERE token = $1', [token]);
}

export async function getCurrentUser(userId: string): Promise<UserResponse> {
  const { rows } = await getPool().query(
    'SELECT id, email, display_name, is_admin, created_at FROM users WHERE id = $1',
    [userId]
  );

  if (rows.length === 0) {
    throw new AuthenticationError('User not found');
  }

  return rows[0];
}
