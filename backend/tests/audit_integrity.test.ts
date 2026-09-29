import { request, setupTestDb, cleanTestDb, teardownTestDb, registerUser, loginUser } from './helpers';
import { getPool } from '../src/db';
import * as auditService from '../src/services/audit.service';

describe('Audit Integrity & Role-Isolation Verification', () => {
  let adminToken: string;
  let adminId: string;
  let judgeToken: string;
  let judgeId: string;
  let judge2Token: string;
  let judge2Id: string;
  let hackathonId: string;
  let subId: string;

  beforeAll(async () => {
    await setupTestDb();
    await cleanTestDb();
    
    // Admin
    await registerUser('admin_verif@dogfood.local', 'password123', 'Admin Verif');
    await getPool().query("UPDATE users SET is_admin = true WHERE email = 'admin_verif@dogfood.local'");
    const adminRes = await loginUser('admin_verif@dogfood.local', 'password123');
    adminToken = adminRes.body.data.token;
    adminId = adminRes.body.data.user.id;

    // Judges
    await registerUser('judge_verif1@dogfood.local', 'password123', 'Judge 1');
    const judge1Res = await loginUser('judge_verif1@dogfood.local', 'password123');
    judgeToken = judge1Res.body.data.token;
    judgeId = judge1Res.body.data.user.id;

    await registerUser('judge_verif2@dogfood.local', 'password123', 'Judge 2');
    const judge2Res = await loginUser('judge_verif2@dogfood.local', 'password123');
    judge2Token = judge2Res.body.data.token;
    judge2Id = judge2Res.body.data.user.id;

    // Setup base domain
    const p = await request.post('/api/policies').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Verif Policy' });
    const policyId = p.body.data.id;
    await request.post(`/api/policies/${policyId}/criteria`).set('Authorization', `Bearer ${adminToken}`).send({ name: 'Crit1', min_score: 1, max_score: 5, weight: 100 });
    await request.post(`/api/policies/${policyId}/publish`).set('Authorization', `Bearer ${adminToken}`);

    const h = await request.post('/api/hackathons').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Verif Hackathon' });
    hackathonId = h.body.data.id;
    await request.put(`/api/hackathons/${hackathonId}/policy`).set('Authorization', `Bearer ${adminToken}`).send({ policy_id: policyId });
    await request.put(`/api/hackathons/${hackathonId}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'ACTIVE' });

    const t = await request.post(`/api/hackathons/${hackathonId}/teams`).set('Authorization', `Bearer ${adminToken}`).send({ name: 'Team Verif' });
    const s = await request.post(`/api/hackathons/${hackathonId}/submissions`).set('Authorization', `Bearer ${adminToken}`).send({ team_id: t.body.data.id, title: 'Sub Verif' });
    subId = s.body.data.id;

    await request.post(`/api/hackathons/${hackathonId}/assignments`).set('Authorization', `Bearer ${adminToken}`).send({ judge_user_id: judgeId, submission_id: subId });
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  describe('Objective 1 & 4: Transactional rollback and Lifecycle', () => {
    it('should rollback domain mutation if audit insert fails', async () => {
      // We will mock recordAudit to throw an error
      const originalRecordAudit = auditService.recordAudit;
      jest.spyOn(auditService, 'recordAudit').mockImplementationOnce(async () => {
        throw new Error('Simulated audit failure');
      });

      // Try to assign judge2, which triggers an audit log
      const res = await request
        .post(`/api/hackathons/${hackathonId}/assignments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ judge_user_id: judge2Id, submission_id: subId });
      
      expect(res.status).toBe(500); // Because it's an unhandled simulated error

      // Verify domain mutation rolled back!
      const { rows } = await getPool().query('SELECT * FROM judge_assignments WHERE judge_user_id = $1 AND submission_id = $2', [judge2Id, subId]);
      expect(rows.length).toBe(0); // The assignment should NOT exist

      // Restore
      jest.restoreAllMocks();
    });

    it('should document that judge removal is not implemented (prevents orphaning)', async () => {
      const res = await request.delete(`/api/hackathons/${hackathonId}/assignments/any-id`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404); // Route does not exist, confirming safety by omission
    });
  });

  describe('Objective 2: Audit Record Integrity', () => {
    it('should mathematically prevent UPDATE on audit_events via trigger', async () => {
      const pool = getPool();
      let error: any;
      try {
        await pool.query("UPDATE audit_events SET action = 'TAMPERED'");
      } catch (err) {
        error = err;
      }
      expect(error).toBeDefined();
      expect(error.message).toContain('Audit events are immutable');
    });

    it('should mathematically prevent DELETE on audit_events via trigger', async () => {
      const pool = getPool();
      let error: any;
      try {
        await pool.query('DELETE FROM audit_events');
      } catch (err) {
        error = err;
      }
      expect(error).toBeDefined();
      expect(error.message).toContain('Audit events are immutable');
    });
  });

  describe('Objective 3: Role Isolation', () => {
    it('should prevent judge from accessing another judge\'s evaluation context', async () => {
      // judge2 is NOT assigned to subId
      const res = await request
        .get(`/api/judging/submissions/${subId}/evaluation`)
        .set('Authorization', `Bearer ${judge2Token}`);
      
      // Should be 403 Forbidden because they are not assigned
      expect(res.status).toBe(403);
    });

    it('should prevent judge from saving scores for another judge\'s assignment', async () => {
      const res = await request
        .put(`/api/judging/submissions/${subId}/evaluation`)
        .set('Authorization', `Bearer ${judge2Token}`)
        .send({ scores: [] });
      
      expect(res.status).toBe(403);
    });
  });
});
