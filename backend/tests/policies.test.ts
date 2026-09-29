import { request, setupTestDb, cleanTestDb, teardownTestDb, registerUser, loginUser } from './helpers';
import { getPool } from '../src/db';

describe('Judging Policies', () => {
  let adminToken: string;
  let userToken: string;
  let adminId: string;

  beforeAll(async () => {
    await setupTestDb();
    await cleanTestDb();
    
    // Create admin user
    await registerUser('admin@dogfood.local', 'password123', 'Admin');
    await getPool().query("UPDATE users SET is_admin = true WHERE email = 'admin@dogfood.local'");
    const adminRes = await loginUser('admin@dogfood.local', 'password123');
    adminToken = adminRes.body.data.token;
    adminId = adminRes.body.data.user.id;

    // Create standard user
    await registerUser('user@dogfood.local', 'password123', 'User');
    const userRes = await loginUser('user@dogfood.local', 'password123');
    userToken = userRes.body.data.token;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  describe('Authorization', () => {
    it('should reject unauthenticated request', async () => {
      const res = await request.get('/api/policies');
      expect(res.status).toBe(401);
    });

    it('should reject non-admin request', async () => {
      const res = await request.get('/api/policies').set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    });

    it('should allow admin request', async () => {
      const res = await request.get('/api/policies').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
    });
  });

  describe('Lifecycle and Validation', () => {
    let policyId: string;

    it('should create a draft policy', async () => {
      const res = await request
        .post('/api/policies')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Hackathon 2026', description: 'Standard rubric' });
      
      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Hackathon 2026');
      expect(res.body.data.status).toBe('DRAFT');
      policyId = res.body.data.id;
    });

    it('should add criteria to draft', async () => {
      const p = await request.post('/api/policies').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Pol' });
      policyId = p.body.data.id;

      const res = await request
        .post(`/api/policies/${policyId}/criteria`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Innovation',
          min_score: 1,
          max_score: 5,
          weight: 50
        });
      
      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Innovation');
    });

    it('should reject duplicate criterion names', async () => {
      const p = await request.post('/api/policies').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Pol2' });
      policyId = p.body.data.id;

      await request
        .post(`/api/policies/${policyId}/criteria`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Impact', min_score: 1, max_score: 5, weight: 50 });

      const res = await request
        .post(`/api/policies/${policyId}/criteria`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'IMPACT', min_score: 1, max_score: 5, weight: 50 });
      
      expect(res.status).toBe(409);
    });

    it('should reject invalid validation data', async () => {
      const p = await request.post('/api/policies').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Pol3' });
      policyId = p.body.data.id;

      // Negative weight
      const res1 = await request
        .post(`/api/policies/${policyId}/criteria`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Invalid', min_score: 1, max_score: 5, weight: -10 });
      expect(res1.status).toBe(422);

      // max <= min
      const res2 = await request
        .post(`/api/policies/${policyId}/criteria`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Invalid', min_score: 5, max_score: 5, weight: 10 });
      expect(res2.status).toBe(422);

      // Weight > 100
      const res3 = await request
        .post(`/api/policies/${policyId}/criteria`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Invalid', min_score: 1, max_score: 5, weight: 101 });
      expect(res3.status).toBe(422);
    });

    it('should not publish with total weight != 100', async () => {
      const p = await request.post('/api/policies').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Pol4' });
      policyId = p.body.data.id;

      await request
        .post(`/api/policies/${policyId}/criteria`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'A', min_score: 1, max_score: 5, weight: 50 });

      const pub = await request
        .post(`/api/policies/${policyId}/publish`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(pub.status).toBe(422); // Validation error from service is ValidationError (maps to 422)
    });

    it('should publish successfully with weight = 100 and lock edits', async () => {
      const p = await request.post('/api/policies').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Pol5' });
      policyId = p.body.data.id;

      await request
        .post(`/api/policies/${policyId}/criteria`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'A', min_score: 1, max_score: 5, weight: 50 });
      
      await request
        .post(`/api/policies/${policyId}/criteria`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'B', min_score: 1, max_score: 5, weight: 50 });

      const pub = await request
        .post(`/api/policies/${policyId}/publish`)
        .set('Authorization', `Bearer ${adminToken}`);
      
      expect(pub.status).toBe(200);
      expect(pub.body.data.status).toBe('PUBLISHED');

      // Reject changes to PUBLISHED policy
      const edit = await request
        .post(`/api/policies/${policyId}/criteria`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'C', min_score: 1, max_score: 5, weight: 0 });
      
      expect(edit.status).toBe(409); // Conflict
    });
    it('should handle concurrent modification and publishing safely', async () => {
      // Create a draft policy
      const p = await request.post('/api/policies').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Race Condition Test' });
      const racePolicyId = p.body.data.id;

      // Add a criterion that makes it valid for publishing (100 weight)
      await request
        .post(`/api/policies/${racePolicyId}/criteria`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Valid Criterion', min_score: 1, max_score: 5, weight: 100 });

      // Fire a publish request and a concurrent criterion addition request
      // We expect one to succeed and one to fail (or both to succeed if addition happens first, but publish validates *after* addition). 
      // Because we use row locks, Postgres handles serialization.
      const addReq = request
        .post(`/api/policies/${racePolicyId}/criteria`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Concurrent Edit', min_score: 1, max_score: 5, weight: 50 });

      const pubReq = request
        .post(`/api/policies/${racePolicyId}/publish`)
        .set('Authorization', `Bearer ${adminToken}`);

      const [addRes, pubRes] = await Promise.all([addReq, pubReq]);

      // If addition succeeded first, publish must fail (weight = 150)
      // If publish succeeded first, addition must fail (cannot modify PUBLISHED policy)
      // They cannot BOTH succeed, which would result in a published policy with 150 weight.
      const bothSucceeded = addRes.status === 201 && pubRes.status === 200;
      expect(bothSucceeded).toBe(false);
    });
  });
});
