import { request, setupTestDb, cleanTestDb, teardownTestDb, registerUser, loginUser } from './helpers';
import { getPool } from '../src/db';

describe('Role Isolation and Audit Trail', () => {
  let adminToken: string;
  let adminId: string;
  let judgeToken: string;
  let judgeId: string;
  let judge2Token: string;

  beforeAll(async () => {
    await setupTestDb();
    await cleanTestDb();
    
    // Admin
    await registerUser('admin_audit@dogfood.local', 'password123', 'Admin Audit');
    await getPool().query("UPDATE users SET is_admin = true WHERE email = 'admin_audit@dogfood.local'");
    const adminRes = await loginUser('admin_audit@dogfood.local', 'password123');
    adminToken = adminRes.body.data.token;
    adminId = adminRes.body.data.user.id;

    // Judges
    await registerUser('judge_audit1@dogfood.local', 'password123', 'Judge 1');
    const judge1Res = await loginUser('judge_audit1@dogfood.local', 'password123');
    judgeToken = judge1Res.body.data.token;
    judgeId = judge1Res.body.data.user.id;

    await registerUser('judge_audit2@dogfood.local', 'password123', 'Judge 2');
    const judge2Res = await loginUser('judge_audit2@dogfood.local', 'password123');
    judge2Token = judge2Res.body.data.token;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('should successfully record audit events for domain mutations', async () => {
    // 1. Policy
    const p = await request.post('/api/policies').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Audit Policy' });
    const policyId = p.body.data.id;
    await request.post(`/api/policies/${policyId}/criteria`).set('Authorization', `Bearer ${adminToken}`).send({ name: 'Crit1', min_score: 1, max_score: 5, weight: 100 });
    await request.post(`/api/policies/${policyId}/publish`).set('Authorization', `Bearer ${adminToken}`); // Generates POLICY_PUBLISHED

    // 2. Hackathon & Linking
    const h = await request.post('/api/hackathons').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Audit Hackathon' });
    const hackathonId = h.body.data.id;

    await request.put(`/api/hackathons/${hackathonId}/policy`).set('Authorization', `Bearer ${adminToken}`).send({ policy_id: policyId }); // Generates HACKATHON_POLICY_ASSIGNED
    await request.put(`/api/hackathons/${hackathonId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'ACTIVE' }); // Generates HACKATHON_ACTIVE

    // 3. Teams & Subs & Assignments
    const t = await request.post(`/api/hackathons/${hackathonId}/teams`).set('Authorization', `Bearer ${adminToken}`).send({ name: 'Team Audit' });
    const teamId = t.body.data.id;

    const s = await request.post(`/api/hackathons/${hackathonId}/submissions`).set('Authorization', `Bearer ${adminToken}`).send({ team_id: teamId, title: 'Audit Sub' });
    const subId = s.body.data.id;

    await request.post(`/api/hackathons/${hackathonId}/assignments`).set('Authorization', `Bearer ${adminToken}`).send({ judge_user_id: judgeId, submission_id: subId }); // Generates JUDGE_ASSIGNED

    // Fetch the audit log (Organizer only)
    const logRes = await request.get('/api/audit').set('Authorization', `Bearer ${adminToken}`);
    expect(logRes.status).toBe(200);
    const actions = logRes.body.data.map((l: any) => l.action);
    
    expect(actions).toContain('POLICY_PUBLISHED');
    expect(actions).toContain('HACKATHON_POLICY_ASSIGNED');
    expect(actions).toContain('HACKATHON_ACTIVE');
    expect(actions).toContain('JUDGE_ASSIGNED');

    // Ensure actor identity matches server-derived identity
    const assignmentLog = logRes.body.data.find((l: any) => l.action === 'JUDGE_ASSIGNED');
    expect(assignmentLog.actor_email).toBe('admin_audit@dogfood.local');
  });

  it('should block non-organizers from viewing audit log', async () => {
    const logRes = await request.get('/api/audit').set('Authorization', `Bearer ${judgeToken}`);
    expect(logRes.status).toBe(403);
  });

  it('should prevent unauthorized users from creating audit events (Role Isolation)', async () => {
    // Judge trying to activate hackathon (which would create an audit event)
    const res = await request.put('/api/hackathons/some-uuid/status').set('Authorization', `Bearer ${judgeToken}`).send({ status: 'COMPLETED' });
    expect(res.status).toBe(403);
  });
});
