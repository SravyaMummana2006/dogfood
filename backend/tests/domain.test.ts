import { request, setupTestDb, cleanTestDb, teardownTestDb, registerUser, loginUser } from './helpers';
import { getPool } from '../src/db';

describe('Judging Domain Foundation', () => {
  let adminToken: string;
  let judgeToken: string;
  let judgeId: string;
  
  let hackathonId: string;
  let hackathon2Id: string;
  let teamId: string;
  let team2Id: string;
  let submissionId: string;

  beforeAll(async () => {
    await setupTestDb();
    await cleanTestDb();
    
    // Create admin
    await registerUser('admin@dogfood.local', 'password123', 'Admin');
    await getPool().query("UPDATE users SET is_admin = true WHERE email = 'admin@dogfood.local'");
    const adminRes = await loginUser('admin@dogfood.local', 'password123');
    adminToken = adminRes.body.data.token;

    // Create judge
    await registerUser('judge@dogfood.local', 'password123', 'Judge');
    const judgeRes = await loginUser('judge@dogfood.local', 'password123');
    judgeToken = judgeRes.body.data.token;
    judgeId = judgeRes.body.data.user.id;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  describe('Authorization', () => {
    it('should reject non-admin from creating hackathons', async () => {
      const res = await request
        .post('/api/hackathons')
        .set('Authorization', `Bearer ${judgeToken}`)
        .send({ name: 'H1' });
      expect(res.status).toBe(403);
    });
  });

  describe('Lifecycle and Policy Linking', () => {
    let testHackathonId: string;
    let draftPolicyId: string;
    let pubPolicyId: string;

    it('should setup test policies', async () => {
      // Draft policy
      const p1 = await request.post('/api/policies').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Draft Pol' });
      draftPolicyId = p1.body.data.id;

      // Published policy
      const p2 = await request.post('/api/policies').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Pub Pol' });
      pubPolicyId = p2.body.data.id;
      await request.post(`/api/policies/${pubPolicyId}/criteria`).set('Authorization', `Bearer ${adminToken}`).send({ name: 'C1', min_score: 1, max_score: 5, weight: 100 });
      await request.post(`/api/policies/${pubPolicyId}/publish`).set('Authorization', `Bearer ${adminToken}`);

      // Hackathon
      const h = await request.post('/api/hackathons').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Hack Lifecycle' });
      testHackathonId = h.body.data.id;
    });

    it('should reject assigning a DRAFT policy to hackathon', async () => {
      const res = await request
        .put(`/api/hackathons/${testHackathonId}/policy`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ policy_id: draftPolicyId });
      expect(res.status).toBe(422); // ValidationError
    });

    it('should assign a PUBLISHED policy to hackathon', async () => {
      const res = await request
        .put(`/api/hackathons/${testHackathonId}/policy`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ policy_id: pubPolicyId });
      expect(res.status).toBe(200);
      expect(res.body.data.policy_id).toBe(pubPolicyId);
    });

    it('should activate hackathon', async () => {
      const res = await request
        .put(`/api/hackathons/${testHackathonId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'ACTIVE' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ACTIVE');
    });

    it('should reject policy reassignment when hackathon is ACTIVE', async () => {
      const res = await request
        .put(`/api/hackathons/${testHackathonId}/policy`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ policy_id: pubPolicyId });
      expect(res.status).toBe(409); // ConflictError
    });
  });

  describe('Entity Creation & Isolation', () => {
    it('should create a hackathon', async () => {
      const res = await request
        .post('/api/hackathons')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Hackathon 1', description: 'Test' });
      
      expect(res.status).toBe(201);
      hackathonId = res.body.data.id;

      const res2 = await request.post('/api/hackathons').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Hackathon 2' });
      hackathon2Id = res2.body.data.id;
    });

    it('should create a team in a hackathon', async () => {
      const res = await request
        .post(`/api/hackathons/${hackathonId}/teams`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Team Alpha' });
      
      expect(res.status).toBe(201);
      teamId = res.body.data.id;

      const res2 = await request.post(`/api/hackathons/${hackathon2Id}/teams`).set('Authorization', `Bearer ${adminToken}`).send({ name: 'Team Beta' });
      team2Id = res2.body.data.id;
    });

    it('should NOT reject duplicate team name in same hackathon (Slice fix)', async () => {
      const res = await request
        .post(`/api/hackathons/${hackathonId}/teams`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Team Alpha' });
      expect(res.status).toBe(201); // 011_allow_duplicate_team_names.sql
    });

    it('should allow same team name in different hackathon', async () => {
      const res = await request
        .post(`/api/hackathons/${hackathon2Id}/teams`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Team Alpha' });
      expect(res.status).toBe(201);
    });

    it('should create a submission', async () => {
      const res = await request
        .post(`/api/hackathons/${hackathonId}/submissions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ team_id: teamId, title: 'Alpha Project' });
      
      expect(res.status).toBe(201);
      submissionId = res.body.data.id;
    });

    it('should reject submission if team belongs to different hackathon', async () => {
      const res = await request
        .post(`/api/hackathons/${hackathonId}/submissions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ team_id: team2Id, title: 'Cross Hackathon Project' });
      
      expect(res.status).toBe(422); // ValidationError mapped to 422
    });

    it('should NOT reject multiple submissions for same team (Slice fix)', async () => {
      const res = await request
        .post(`/api/hackathons/${hackathonId}/submissions`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ team_id: teamId, title: 'Alpha Project v2' });
      
      expect(res.status).toBe(201); // 010_allow_multiple_submissions.sql
    });

    it('should assign a judge to a submission', async () => {
      const res = await request
        .post(`/api/hackathons/${hackathonId}/assignments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ judge_user_id: judgeId, submission_id: submissionId });
      
      expect(res.status).toBe(201);
    });

    it('should reject assignment if submission belongs to different hackathon', async () => {
      // Create sub for h2
      const subRes = await request.post(`/api/hackathons/${hackathon2Id}/submissions`).set('Authorization', `Bearer ${adminToken}`).send({ team_id: team2Id, title: 'Beta Sub' });
      const sub2Id = subRes.body.data.id;

      const res = await request
        .post(`/api/hackathons/${hackathonId}/assignments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ judge_user_id: judgeId, submission_id: sub2Id });
      
      expect(res.status).toBe(422);
    });

    it('should reject duplicate assignments', async () => {
      const res = await request
        .post(`/api/hackathons/${hackathonId}/assignments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ judge_user_id: judgeId, submission_id: submissionId });
      
      expect(res.status).toBe(409);
    });

    it('should let judge view their assignments', async () => {
      const res = await request
        .get('/api/judging/assignments')
        .set('Authorization', `Bearer ${judgeToken}`);
      
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].submission_title).toBe('Alpha Project');
      expect(res.body.data[0].team_name).toBe('Team Alpha');
      expect(res.body.data[0].hackathon_name).toBe('Hackathon 1');
    });
  });

  describe('Judge Invitations', () => {
    let sub3Id: string;
    let invId: string;

    beforeAll(async () => {
      // Create team and submission for testing invitations
      const tRes = await request.post(`/api/hackathons/${hackathonId}/teams`).set('Authorization', `Bearer ${adminToken}`).send({ name: 'Team Gamma' });
      const tId = tRes.body.data.id;
      const sRes = await request.post(`/api/hackathons/${hackathonId}/submissions`).set('Authorization', `Bearer ${adminToken}`).send({ team_id: tId, title: 'Gamma Project' });
      sub3Id = sRes.body.data.id;
    });

    it('organizer can create a judge invitation', async () => {
      const res = await request
        .post(`/api/hackathons/${hackathonId}/invitations`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ judge_user_id: judgeId, submission_id: sub3Id });
      
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('PENDING');
      invId = res.body.data.id;
    });

    it('rejects duplicate pending invitations', async () => {
      const res = await request
        .post(`/api/hackathons/${hackathonId}/invitations`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ judge_user_id: judgeId, submission_id: sub3Id });
      expect(res.status).toBe(409);
    });

    it('judge can list their invitations', async () => {
      const res = await request
        .get('/api/judging/invitations')
        .set('Authorization', `Bearer ${judgeToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      const inv = res.body.data.find((i: any) => i.invitation_id === invId);
      expect(inv).toBeDefined();
      expect(inv.invitation_status).toBe('PENDING');
    });

    it('judge can decline an invitation', async () => {
      const res = await request
        .post(`/api/judging/invitations/${invId}/decline`)
        .set('Authorization', `Bearer ${judgeToken}`);
      expect(res.status).toBe(200);

      // Verify status is DECLINED
      const listRes = await request.get('/api/judging/invitations').set('Authorization', `Bearer ${judgeToken}`);
      const inv = listRes.body.data.find((i: any) => i.invitation_id === invId);
      expect(inv.invitation_status).toBe('DECLINED');
    });

    it('cannot decline or accept an already declined invitation', async () => {
      const res = await request
        .post(`/api/judging/invitations/${invId}/accept`)
        .set('Authorization', `Bearer ${judgeToken}`);
      expect(res.status).toBe(409);
    });

    it('judge can accept a new invitation and become assigned', async () => {
      // Re-invite (this is allowed because previous is declined, but wait, the unique index prevents it! Let's check.)
      // Wait, we need a new submission because of the unique index constraint!
      const tRes = await request.post(`/api/hackathons/${hackathonId}/teams`).set('Authorization', `Bearer ${adminToken}`).send({ name: 'Team Delta' });
      const sRes = await request.post(`/api/hackathons/${hackathonId}/submissions`).set('Authorization', `Bearer ${adminToken}`).send({ team_id: tRes.body.data.id, title: 'Delta Project' });
      const sub4Id = sRes.body.data.id;

      const invRes = await request
        .post(`/api/hackathons/${hackathonId}/invitations`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ judge_user_id: judgeId, submission_id: sub4Id });
      
      const newInvId = invRes.body.data.id;

      // Accept
      const accRes = await request
        .post(`/api/judging/invitations/${newInvId}/accept`)
        .set('Authorization', `Bearer ${judgeToken}`);
      expect(accRes.status).toBe(200);

      // Verify assignment was created
      const asgRes = await request.get('/api/judging/assignments').set('Authorization', `Bearer ${judgeToken}`);
      const asg = asgRes.body.data.find((a: any) => a.submission_id === sub4Id);
      expect(asg).toBeDefined();
    });
    
    it('rejects another user from accepting the invitation', async () => {
      // Create another user
      await registerUser('otherjudge@dogfood.local', 'password123', 'Other Judge');
      const otherRes = await loginUser('otherjudge@dogfood.local', 'password123');
      const otherToken = otherRes.body.data.token;
      
      const tRes = await request.post(`/api/hackathons/${hackathonId}/teams`).set('Authorization', `Bearer ${adminToken}`).send({ name: 'Team Epsilon' });
      const sRes = await request.post(`/api/hackathons/${hackathonId}/submissions`).set('Authorization', `Bearer ${adminToken}`).send({ team_id: tRes.body.data.id, title: 'Epsilon Project' });
      
      const invRes = await request
        .post(`/api/hackathons/${hackathonId}/invitations`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ judge_user_id: judgeId, submission_id: sRes.body.data.id });
        
      const newInvId = invRes.body.data.id;
      
      const res = await request
        .post(`/api/judging/invitations/${newInvId}/accept`)
        .set('Authorization', `Bearer ${otherToken}`);
      expect(res.status).toBe(409); // conflict: cannot accept another judge's invitation
    });
  });

});
