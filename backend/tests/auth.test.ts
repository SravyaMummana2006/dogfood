import { request, setupTestDb, cleanTestDb, teardownTestDb, registerUser, loginUser } from './helpers';
import { getPool } from '../src/db';

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  await cleanTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('POST /api/auth/register', () => {
  it('should register a new user successfully', async () => {
    const res = await registerUser();

    expect(res.status).toBe(201);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.email).toBe('test@example.com');
    expect(res.body.data.display_name).toBe('Test User');
    expect(res.body.data.id).toBeDefined();
    // Must never return password hash
    expect(res.body.data.password_hash).toBeUndefined();
    expect(res.body.data.password).toBeUndefined();
  });

  it('should reject duplicate email with 409', async () => {
    await registerUser();
    const res = await registerUser();

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT_ERROR');
  });

  it('should reject invalid email', async () => {
    const res = await request
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'password123', display_name: 'Test' });

    expect(res.status).toBe(422);
  });

  it('should reject short password', async () => {
    const res = await request
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'short', display_name: 'Test' });

    expect(res.status).toBe(422);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await registerUser();
  });

  it('should login with correct credentials', async () => {
    const res = await loginUser();

    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.token.length).toBeGreaterThan(32);
    expect(res.body.data.user.email).toBe('test@example.com');
    expect(res.body.data.expires_at).toBeDefined();
    // Must never return password hash
    expect(res.body.data.user.password_hash).toBeUndefined();
  });

  it('should reject incorrect password with 401', async () => {
    const res = await loginUser('test@example.com', 'wrongpassword');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
  });

  it('should reject nonexistent user with 401', async () => {
    const res = await loginUser('nonexistent@example.com', 'password123');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
  });
});

describe('GET /api/auth/me', () => {
  it('should return current user for authenticated request', async () => {
    await registerUser();
    const loginRes = await loginUser();
    const token = loginRes.body.data.token;

    const res = await request
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('test@example.com');
    expect(res.body.data.display_name).toBe('Test User');
  });

  it('should reject unauthenticated request with 401', async () => {
    const res = await request.get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTHENTICATION_ERROR');
  });

  it('should reject invalid token with 401', async () => {
    const res = await request
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid-token-here');

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('should invalidate session on logout', async () => {
    await registerUser();
    const loginRes = await loginUser();
    const token = loginRes.body.data.token;

    // Logout
    const logoutRes = await request
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(logoutRes.status).toBe(200);

    // Token should no longer work
    const meRes = await request
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.status).toBe(401);
  });
});

describe('Canonical Demo Accounts', () => {
  it('should authenticate all four demo users with dogfood2026', async () => {
    // 1. Manually create the 4 test users in the isolated test DB
    const pool = getPool();
    const argon2 = require('argon2');
    
    const passwordHash = await argon2.hash('dogfood2026', {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
    
    const targets = [
      'organizer@dogfood.local',
      'participant@dogfood.local',
      'judge_a@dogfood.local',
      'judge_b@dogfood.local'
    ];
    
    for (const email of targets) {
      const isAdmin = email.startsWith('organizer');
      await pool.query(
        `INSERT INTO users (email, password_hash, display_name, is_admin)
         VALUES ($1, $2, $3, $4)`,
        [email, passwordHash, email, isAdmin]
      );
    }

    for (const email of targets) {
      const loginRes = await loginUser(email, 'dogfood2026');
      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.token).toBeDefined();
      expect(loginRes.body.data.user.email).toBe(email);
    }
  });
});

describe('Password security', () => {
  it('should not store password as plaintext', async () => {
    await registerUser('secure@example.com', 'mysecretpassword123');

    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT password_hash FROM users WHERE email = $1',
      ['secure@example.com']
    );

    expect(rows.length).toBe(1);
    // Argon2id hashes start with $argon2id$
    expect(rows[0].password_hash).toMatch(/^\$argon2id\$/);
    expect(rows[0].password_hash).not.toBe('mysecretpassword123');
    expect(rows[0].password_hash).not.toContain('mysecretpassword123');
  });
});
