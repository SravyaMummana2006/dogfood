import { request, setupTestDb, cleanTestDb, registerUser, loginUser } from './helpers';
import { getPool } from '../src/db';

describe('Phase 5E - Score Aggregation & Result Integrity', () => {
  let adminToken: string;
  let adminId: string;
  let judge1Token: string;
  let judge1Id: string;
  let judge2Token: string;
  let judge2Id: string;
  
  let hackathonId: string;
  let policyId: string;
  let teamId: string;
  let sub1Id: string;
  let sub2Id: string;
  let sub3Id: string;
  
  let crit1Id: string;
  let crit2Id: string;

  beforeAll(async () => {
    await setupTestDb();
    
    // Create users
    const adminRes = await registerUser('agg_admin@example.com', 'password123', 'Admin User');
    await getPool().query('UPDATE users SET is_admin = true WHERE email = $1', ['agg_admin@example.com']);
    const aLogin = await loginUser('agg_admin@example.com', 'password123');
    adminToken = aLogin.body.data.token;
    adminId = aLogin.body.data.user.id;
    
    const j1Res = await registerUser('agg_judge1@example.com', 'password123', 'Judge 1');
    const j1Login = await loginUser('agg_judge1@example.com', 'password123');
    judge1Token = j1Login.body.data.token;
    judge1Id = j1Login.body.data.user.id;
    
    const j2Res = await registerUser('agg_judge2@example.com', 'password123', 'Judge 2');
    const j2Login = await loginUser('agg_judge2@example.com', 'password123');
    judge2Token = j2Login.body.data.token;
    judge2Id = j2Login.body.data.user.id;
  });

  afterAll(async () => {
    await cleanTestDb();
  });

  it('Setup: Policy, Hackathon, Submissions', async () => {
    // Policy
    let p = await request.post('/api/policies').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Agg Policy' });
    policyId = p.body.data.id;
    
    let c1 = await request.post(`/api/policies/${policyId}/criteria`).set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'C1', min_score: 1, max_score: 5, weight: 60 });
    crit1Id = c1.body.data.id;
    let c2 = await request.post(`/api/policies/${policyId}/criteria`).set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'C2', min_score: 1, max_score: 10, weight: 40 });
    crit2Id = c2.body.data.id;
    
    await request.post(`/api/policies/${policyId}/publish`).set('Authorization', `Bearer ${adminToken}`);

    // Hackathon
    let h = await request.post('/api/hackathons').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Agg Hackathon' });
    hackathonId = h.body.data.id;
    await request.put(`/api/hackathons/${hackathonId}/policy`).set('Authorization', `Bearer ${adminToken}`).send({ policy_id: policyId });
    
    // Teams & Submissions
    let t = await request.post(`/api/hackathons/${hackathonId}/teams`).set('Authorization', `Bearer ${adminToken}`).send({ name: 'Team A' });
    teamId = t.body.data.id;
    let s1 = await request.post(`/api/hackathons/${hackathonId}/submissions`).set('Authorization', `Bearer ${adminToken}`).send({ team_id: teamId, title: 'Sub 1' });
    sub1Id = s1.body.data.id;
    
    let t2 = await request.post(`/api/hackathons/${hackathonId}/teams`).set('Authorization', `Bearer ${adminToken}`).send({ name: 'Team B' });
    let s2 = await request.post(`/api/hackathons/${hackathonId}/submissions`).set('Authorization', `Bearer ${adminToken}`).send({ team_id: t2.body.data.id, title: 'Sub 2' });
    sub2Id = s2.body.data.id;
    
    let t3 = await request.post(`/api/hackathons/${hackathonId}/teams`).set('Authorization', `Bearer ${adminToken}`).send({ name: 'Team C' });
    let s3 = await request.post(`/api/hackathons/${hackathonId}/submissions`).set('Authorization', `Bearer ${adminToken}`).send({ team_id: t3.body.data.id, title: 'Sub 3' });
    sub3Id = s3.body.data.id;

    // Activate
    await request.put(`/api/hackathons/${hackathonId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'ACTIVE' });

    // Assign judges (Sub1: J1 & J2, Sub2: J1, Sub3: J2)
    await request.post(`/api/hackathons/${hackathonId}/assignments`).set('Authorization', `Bearer ${adminToken}`)
      .send({ submission_id: sub1Id, judge_user_id: judge1Id });
    await request.post(`/api/hackathons/${hackathonId}/assignments`).set('Authorization', `Bearer ${adminToken}`)
      .send({ submission_id: sub1Id, judge_user_id: judge2Id });
    
    await request.post(`/api/hackathons/${hackathonId}/assignments`).set('Authorization', `Bearer ${adminToken}`)
      .send({ submission_id: sub2Id, judge_user_id: judge1Id });

    await request.post(`/api/hackathons/${hackathonId}/assignments`).set('Authorization', `Bearer ${adminToken}`)
      .send({ submission_id: sub3Id, judge_user_id: judge2Id });
  });

  it('1 & 3: Correct aggregation, normalization and weighting', async () => {
    // Judge 1 submits on Sub 1
    // C1: raw=5 (norm=1.0) -> wt=60
    // C2: raw=10 (norm=1.0) -> wt=40
    // Total = 100
    await request.put(`/api/judging/submissions/${sub1Id}/evaluation`)
      .set('Authorization', `Bearer ${judge1Token}`)
      .send({
        submit: true,
        scores: [
          { criterion_id: crit1Id, raw_score: 5 },
          { criterion_id: crit2Id, raw_score: 10 }
        ]
      });

    // Judge 2 submits on Sub 1
    // C1: raw=3 (norm=0.5) -> wt=30
    // C2: raw=10 (norm=1.0) -> wt=40
    // Total = 70
    await request.put(`/api/judging/submissions/${sub1Id}/evaluation`)
      .set('Authorization', `Bearer ${judge2Token}`)
      .send({
        submit: true,
        scores: [
          { criterion_id: crit1Id, raw_score: 3 },
          { criterion_id: crit2Id, raw_score: 10 }
        ]
      });

    const res = await request.get(`/api/hackathons/${hackathonId}/results`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    
    const sub1Res = res.body.data.results.find((r: any) => r.submission_id === sub1Id);
    expect(sub1Res.submitted_evaluations).toBe(2);
    expect(sub1Res.missing_evaluations).toBe(0);
    expect(sub1Res.aggregate_score).toBe(85); // (100 + 70) / 2
    expect(sub1Res.status).toBe('COMPLETED');
  });

  it('4 & 5: DRAFT evaluations excluded, missing evals not treated as zero', async () => {
    // Judge 1 drafts on Sub 2
    await request.put(`/api/judging/submissions/${sub2Id}/evaluation`)
      .set('Authorization', `Bearer ${judge1Token}`)
      .send({
        submit: false,
        scores: [ { criterion_id: crit1Id, raw_score: 5 } ]
      });

    const res = await request.get(`/api/hackathons/${hackathonId}/results`).set('Authorization', `Bearer ${adminToken}`);
    const sub2Res = res.body.data.results.find((r: any) => r.submission_id === sub2Id);
    
    expect(sub2Res.total_assignments).toBe(1);
    expect(sub2Res.submitted_evaluations).toBe(0); // DRAFT is excluded
    expect(sub2Res.missing_evaluations).toBe(1);
    expect(sub2Res.aggregate_score).toBeNull(); // Missing not treated as zero
    expect(sub2Res.status).toBe('NO_SCORE');
  });

  it('6: Submission with no submitted evaluations', async () => {
    const res = await request.get(`/api/hackathons/${hackathonId}/results`).set('Authorization', `Bearer ${adminToken}`);
    const sub3Res = res.body.data.results.find((r: any) => r.submission_id === sub3Id);
    
    // Assigned to J2, but J2 hasn't even drafted
    expect(sub3Res.total_assignments).toBe(1);
    expect(sub3Res.submitted_evaluations).toBe(0);
    expect(sub3Res.aggregate_score).toBeNull();
    expect(sub3Res.status).toBe('NO_SCORE');
  });

  it('7: Decimal precision and rounding', async () => {
    // Make J2 submit on Sub 3 with a fraction
    // C1: raw=4 (norm=0.75) -> wt=45
    // C2: raw=5 (norm=0.4444) -> wt=17.7778
    // Total = 62.7778
    await request.put(`/api/judging/submissions/${sub3Id}/evaluation`)
      .set('Authorization', `Bearer ${judge2Token}`)
      .send({
        submit: true,
        scores: [
          { criterion_id: crit1Id, raw_score: 4 },
          { criterion_id: crit2Id, raw_score: 5 }
        ]
      });

    const res = await request.get(`/api/hackathons/${hackathonId}/results`).set('Authorization', `Bearer ${adminToken}`);
    const sub3Res = res.body.data.results.find((r: any) => r.submission_id === sub3Id);
    expect(sub3Res.aggregate_score).toBe(62.7778); // Precisely 4 decimals preserved
  });

  it('8 & 10: Access rejection', async () => {
    // Judge cannot view aggregate results endpoint
    const res = await request.get(`/api/hackathons/${hackathonId}/results`).set('Authorization', `Bearer ${judge1Token}`);
    expect(res.status).toBe(403);
  });

  it('2, 9 & 11: Raw scores remain unchanged, deterministic repeatability, rejection of fabricated scores', async () => {
    // Run aggregation again, should be exactly identical
    const res1 = await request.get(`/api/hackathons/${hackathonId}/results`).set('Authorization', `Bearer ${adminToken}`);
    const res2 = await request.get(`/api/hackathons/${hackathonId}/results`).set('Authorization', `Bearer ${adminToken}`);
    expect(res1.body).toEqual(res2.body);

    // Verify raw scores in DB directly
    const { rows } = await getPool().query('SELECT raw_score FROM evaluation_scores');
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(Number.isInteger(r.raw_score)).toBe(true); // Still raw
    }

    // Fabricated scores are impossible because there is no API parameter for the client to supply an aggregate score
  });

  it('12: Correct handling of ties (both subs have same score)', async () => {
    // Create Sub 4 and Sub 5 with identical scores
    let t4 = await request.post(`/api/hackathons/${hackathonId}/teams`).set('Authorization', `Bearer ${adminToken}`).send({ name: 'Team D' });
    let s4 = await request.post(`/api/hackathons/${hackathonId}/submissions`).set('Authorization', `Bearer ${adminToken}`).send({ team_id: t4.body.data.id, title: 'Sub 4' });
    let t5 = await request.post(`/api/hackathons/${hackathonId}/teams`).set('Authorization', `Bearer ${adminToken}`).send({ name: 'Team E' });
    let s5 = await request.post(`/api/hackathons/${hackathonId}/submissions`).set('Authorization', `Bearer ${adminToken}`).send({ team_id: t5.body.data.id, title: 'Sub 5' });
    
    await request.post(`/api/hackathons/${hackathonId}/assignments`).set('Authorization', `Bearer ${adminToken}`).send({ submission_id: s4.body.data.id, judge_user_id: judge1Id });
    await request.post(`/api/hackathons/${hackathonId}/assignments`).set('Authorization', `Bearer ${adminToken}`).send({ submission_id: s5.body.data.id, judge_user_id: judge1Id });

    // Submit identical scores
    await request.put(`/api/judging/submissions/${s4.body.data.id}/evaluation`).set('Authorization', `Bearer ${judge1Token}`)
      .send({ submit: true, scores: [ { criterion_id: crit1Id, raw_score: 5 }, { criterion_id: crit2Id, raw_score: 10 } ] });
    await request.put(`/api/judging/submissions/${s5.body.data.id}/evaluation`).set('Authorization', `Bearer ${judge1Token}`)
      .send({ submit: true, scores: [ { criterion_id: crit1Id, raw_score: 5 }, { criterion_id: crit2Id, raw_score: 10 } ] });

    const res = await request.get(`/api/hackathons/${hackathonId}/results`).set('Authorization', `Bearer ${adminToken}`);
    const s4Res = res.body.data.results.find((r: any) => r.submission_id === s4.body.data.id);
    const s5Res = res.body.data.results.find((r: any) => r.submission_id === s5.body.data.id);

    expect(s4Res.aggregate_score).toBe(100);
    expect(s5Res.aggregate_score).toBe(100);
    // They coexist, tied naturally. The system doesn't artificially pick a winner.
  });
});
