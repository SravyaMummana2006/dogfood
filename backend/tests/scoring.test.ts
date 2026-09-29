import { request, setupTestDb, cleanTestDb, teardownTestDb, registerUser, loginUser } from './helpers';
import { getPool } from '../src/db';

describe('Deterministic Human Scoring Engine', () => {
  let adminToken: string;
  let judgeToken: string;
  let judge2Token: string;
  let judgeId: string;
  let judge2Id: string;
  
  let hackathonId: string;
  let policyId: string;
  let teamId: string;
  let submissionId: string;
  let c1Id: string;
  let c2Id: string;

  beforeAll(async () => {
    await setupTestDb();
    await cleanTestDb();
    
    // Create admin
    await registerUser('admin@dogfood.local', 'password123', 'Admin');
    await getPool().query("UPDATE users SET is_admin = true WHERE email = 'admin@dogfood.local'");
    const adminRes = await loginUser('admin@dogfood.local', 'password123');
    adminToken = adminRes.body.data.token;

    // Create judges
    await registerUser('judge@dogfood.local', 'password123', 'Judge 1');
    const judgeRes = await loginUser('judge@dogfood.local', 'password123');
    judgeToken = judgeRes.body.data.token;
    judgeId = judgeRes.body.data.user.id;

    await registerUser('judge2@dogfood.local', 'password123', 'Judge 2');
    const judge2Res = await loginUser('judge2@dogfood.local', 'password123');
    judge2Token = judge2Res.body.data.token;
    judge2Id = judge2Res.body.data.user.id;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  describe('Setup Phase', () => {
    it('should setup the judging context', async () => {
      // 1. Create Policy
      const p = await request.post('/api/policies').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Scoring Policy' });
      policyId = p.body.data.id;

      // Criteria:
      // C1: 1 to 5, weight 40
      const c1 = await request.post(`/api/policies/${policyId}/criteria`).set('Authorization', `Bearer ${adminToken}`).send({ name: 'C1', min_score: 1, max_score: 5, weight: 40 });
      c1Id = c1.body.data.id;
      
      // C2: 0 to 10, weight 60
      const c2 = await request.post(`/api/policies/${policyId}/criteria`).set('Authorization', `Bearer ${adminToken}`).send({ name: 'C2', min_score: 0, max_score: 10, weight: 60 });
      c2Id = c2.body.data.id;

      await request.post(`/api/policies/${policyId}/publish`).set('Authorization', `Bearer ${adminToken}`);

      // 2. Create Hackathon, Team, Submission, Assignment
      const h = await request.post('/api/hackathons').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Hackathon Scoring' });
      hackathonId = h.body.data.id;

      await request.put(`/api/hackathons/${hackathonId}/policy`).set('Authorization', `Bearer ${adminToken}`).send({ policy_id: policyId });
      
      const t = await request.post(`/api/hackathons/${hackathonId}/teams`).set('Authorization', `Bearer ${adminToken}`).send({ name: 'Team Score' });
      teamId = t.body.data.id;

      const s = await request.post(`/api/hackathons/${hackathonId}/submissions`).set('Authorization', `Bearer ${adminToken}`).send({ team_id: teamId, title: 'Score Sub' });
      submissionId = s.body.data.id;

      await request.post(`/api/hackathons/${hackathonId}/assignments`).set('Authorization', `Bearer ${adminToken}`).send({ judge_user_id: judgeId, submission_id: submissionId });
    });
  });

  describe('Scoring Logic', () => {
    it('should reject score if hackathon is not ACTIVE', async () => {
      const res = await request
        .put(`/api/judging/submissions/${submissionId}/evaluation`)
        .set('Authorization', `Bearer ${judgeToken}`)
        .send({
          scores: [{ criterion_id: c1Id, raw_score: 3 }]
        });
      expect(res.status).toBe(409); // ConflictError
    });

    it('should activate hackathon', async () => {
      await request.put(`/api/hackathons/${hackathonId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'ACTIVE' });
    });

    it('should reject score if judge not assigned', async () => {
      const res = await request
        .put(`/api/judging/submissions/${submissionId}/evaluation`)
        .set('Authorization', `Bearer ${judge2Token}`)
        .send({
          scores: [{ criterion_id: c1Id, raw_score: 3 }]
        });
      expect(res.status).toBe(403);
    });

    it('should reject score below minimum', async () => {
      const res = await request
        .put(`/api/judging/submissions/${submissionId}/evaluation`)
        .set('Authorization', `Bearer ${judgeToken}`)
        .send({
          scores: [{ criterion_id: c1Id, raw_score: 0 }]
        });
      expect(res.status).toBe(422); // ValidationError mapped to 422
    });

    it('should reject score above maximum', async () => {
      const res = await request
        .put(`/api/judging/submissions/${submissionId}/evaluation`)
        .set('Authorization', `Bearer ${judgeToken}`)
        .send({
          scores: [{ criterion_id: c2Id, raw_score: 11 }]
        });
      expect(res.status).toBe(422);
    });

    it('should reject score for criterion belonging to another policy', async () => {
      // create another policy and criterion
      const op = await request.post('/api/policies').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Other Policy' });
      const opId = op.body.data.id;
      const oc1 = await request.post(`/api/policies/${opId}/criteria`).set('Authorization', `Bearer ${adminToken}`).send({ name: 'OC1', min_score: 1, max_score: 5, weight: 100 });
      const oc1Id = oc1.body.data.id;

      const res = await request
        .put(`/api/judging/submissions/${submissionId}/evaluation`)
        .set('Authorization', `Bearer ${judgeToken}`)
        .send({
          scores: [{ criterion_id: oc1Id, raw_score: 3 }]
        });
      expect(res.status).toBe(422); // Validation error (criterion not in policy)
    });

    it('should save a valid DRAFT evaluation and verify formula calculation', async () => {
      // C1: score 3 out of [1,5]. Normalized = (3-1)/(5-1) = 0.5. Weighted = 0.5 * 40 = 20
      // C2: score 8 out of [0,10]. Normalized = (8-0)/(10-0) = 0.8. Weighted = 0.8 * 60 = 48
      // Total should be 68.0000
      const res = await request
        .put(`/api/judging/submissions/${submissionId}/evaluation`)
        .set('Authorization', `Bearer ${judgeToken}`)
        .send({
          scores: [
            { criterion_id: c1Id, raw_score: 3 },
            { criterion_id: c2Id, raw_score: 8 }
          ]
        });
      
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.total_score).toBe('68.0000');
    });

    it('should reject submitting incomplete evaluations', async () => {
      const res = await request
        .put(`/api/judging/submissions/${submissionId}/evaluation`)
        .set('Authorization', `Bearer ${judgeToken}`)
        .send({
          submit: true,
          scores: [
            { criterion_id: c1Id, raw_score: 3 }
            // missing C2
          ]
        });
      expect(res.status).toBe(422); 
    });

    it('should successfully submit full evaluation', async () => {
      // C1: score 5 -> Normalized = 1.0 -> Weighted = 40
      // C2: score 5 -> Normalized = 0.5 -> Weighted = 30
      // Total = 70.0000
      const res = await request
        .put(`/api/judging/submissions/${submissionId}/evaluation`)
        .set('Authorization', `Bearer ${judgeToken}`)
        .send({
          submit: true,
          scores: [
            { criterion_id: c1Id, raw_score: 5 },
            { criterion_id: c2Id, raw_score: 5 }
          ]
        });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('SUBMITTED');
      expect(res.body.data.total_score).toBe('70.0000');
    });

    it('should reject updates to a SUBMITTED evaluation', async () => {
      const res = await request
        .put(`/api/judging/submissions/${submissionId}/evaluation`)
        .set('Authorization', `Bearer ${judgeToken}`)
        .send({
          scores: [
            { criterion_id: c1Id, raw_score: 5 },
            { criterion_id: c2Id, raw_score: 10 }
          ]
        });
      expect(res.status).toBe(409); // ConflictError
    });

    it('should handle concurrent updates safely', async () => {
      // Assign judge 2 to the same submission
      await request.post(`/api/hackathons/${hackathonId}/assignments`).set('Authorization', `Bearer ${adminToken}`).send({ judge_user_id: judge2Id, submission_id: submissionId });

      // Fire two identical updates at the exact same time
      const req1 = request.put(`/api/judging/submissions/${submissionId}/evaluation`).set('Authorization', `Bearer ${judge2Token}`).send({
        submit: true,
        scores: [{ criterion_id: c1Id, raw_score: 4 }, { criterion_id: c2Id, raw_score: 8 }]
      });

      const req2 = request.put(`/api/judging/submissions/${submissionId}/evaluation`).set('Authorization', `Bearer ${judge2Token}`).send({
        submit: true, // both try to submit
        scores: [{ criterion_id: c1Id, raw_score: 3 }, { criterion_id: c2Id, raw_score: 7 }]
      });

      const [res1, res2] = await Promise.all([req1, req2]);

      // One must succeed (200), one must fail (409 Conflict) because of FOR UPDATE locking and SUBMITTED status check.
      const statusCodes = [res1.status, res2.status].sort();
      expect(statusCodes[0]).toBe(200);
      expect(statusCodes[1]).toBe(409);
    });

    it('should correctly retrieve the evaluation context', async () => {
      const res = await request
        .get(`/api/judging/submissions/${submissionId}/evaluation`)
        .set('Authorization', `Bearer ${judgeToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.hackathon_status).toBe('ACTIVE');
      expect(res.body.data.evaluation.status).toBe('SUBMITTED');
      expect(res.body.data.evaluation.total_score).toBe('70.0000');
      expect(res.body.data.scores.length).toBe(2);
      expect(res.body.data.criteria.length).toBe(2);
    });
  });
});
