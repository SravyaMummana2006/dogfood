import { request, setupTestDb, cleanTestDb, teardownTestDb, registerUser } from './helpers';

beforeAll(async () => {
  await setupTestDb();
});

beforeEach(async () => {
  await cleanTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

describe('Security hardening', () => {
  describe('Password max length (128 chars)', () => {
    it('should reject registration with password exceeding 128 characters', async () => {
      const longPassword = 'a'.repeat(129);
      const res = await request
        .post('/api/auth/register')
        .send({ email: 'long@example.com', password: longPassword, display_name: 'Long PW' });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should accept registration with password at exactly 128 characters', async () => {
      const maxPassword = 'a'.repeat(128);
      const res = await request
        .post('/api/auth/register')
        .send({ email: 'max@example.com', password: maxPassword, display_name: 'Max PW' });

      expect(res.status).toBe(201);
    });

    it('should reject login with password exceeding 128 characters', async () => {
      const longPassword = 'a'.repeat(129);
      const res = await request
        .post('/api/auth/login')
        .send({ email: 'any@example.com', password: longPassword });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('JSON body size limit (100kb)', () => {
    it('should reject oversized JSON bodies with 413 or 400', async () => {
      const oversizedPayload = {
        email: 'test@example.com',
        password: 'password123',
        display_name: 'x'.repeat(200 * 1024), // ~200kb
      };
      const res = await request
        .post('/api/auth/register')
        .send(oversizedPayload);

      // Express returns 413 Payload Too Large for body-parser limit
      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  describe('CORS configuration', () => {
    it('should include CORS headers for allowed origin', async () => {
      const res = await request
        .options('/api/auth/login')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'POST');

      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    it('should not include wildcard CORS origin', async () => {
      const res = await request
        .options('/api/auth/login')
        .set('Origin', 'http://evil.com')
        .set('Access-Control-Request-Method', 'POST');

      expect(res.headers['access-control-allow-origin']).not.toBe('*');
    });
  });

  describe('Security headers (Helmet)', () => {
    it('should set security headers on responses', async () => {
      const res = await request.get('/api/health');

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(res.headers['x-xss-protection']).toBe('0');
    });
  });

  describe('Auth rate limiting', () => {
    it('should not rate-limit health endpoint', async () => {
      // Send 35 health checks — should all succeed since limiter is auth-only
      const results = [];
      for (let i = 0; i < 35; i++) {
        const res = await request.get('/api/health');
        results.push(res.status);
      }
      expect(results.every(s => s === 200)).toBe(true);
    });
  });

  describe('Error response safety', () => {
    it('should not expose stack traces for invalid JSON', async () => {
      const res = await request
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_JSON');
      expect(res.body.error.stack).toBeUndefined();
    });

    it('should not expose password hash in registration response', async () => {
      const res = await registerUser();

      expect(res.status).toBe(201);
      expect(res.body.data.password_hash).toBeUndefined();
      expect(res.body.data.password).toBeUndefined();
    });

    it('should give generic error for wrong credentials', async () => {
      await registerUser();
      const res = await request
        .post('/api/auth/login')
        .send({ email: 'test@example.com', password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe('Invalid email or password');
      // Must not reveal whether the account exists specifically
      expect(res.body.error.message).not.toContain('not found');
      expect(res.body.error.message).not.toContain('does not exist');
    });
  });
});
