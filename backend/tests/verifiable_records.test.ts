import { getPool } from '../src/db';
import { request, setupTestDb, cleanTestDb, teardownTestDb, registerUser, loginUser } from './helpers';
import crypto from 'crypto';
import { canonicalize } from '../src/services/crypto.service';

let pool = getPool();
let adminToken: string;
let judgeToken: string;
let participantToken: string;
let adminId: string;
let judgeId: string;
let participantId: string;
let hackathonId: string;
let submissionId: string;
let policyId: string;
let criterionId: string;

describe('Verifiable Records (T4)', () => {
  beforeAll(async () => {
    await setupTestDb();
    await cleanTestDb();
    
    // Create users
    await registerUser('admin@dogfood.local', 'password123', 'Admin');
    await pool.query("UPDATE users SET is_admin = true WHERE email = 'admin@dogfood.local'");
    adminToken = (await loginUser('admin@dogfood.local', 'password123')).body.data.token;
    
    await registerUser('judge@dogfood.local', 'password123', 'Judge');
    judgeToken = (await loginUser('judge@dogfood.local', 'password123')).body.data.token;
    const { rows: judgeRows } = await pool.query("SELECT id FROM users WHERE email = 'judge@dogfood.local'");
    judgeId = judgeRows[0].id;
    
    await registerUser('participant@dogfood.local', 'password123', 'Participant');
    participantToken = (await loginUser('participant@dogfood.local', 'password123')).body.data.token;
    
    // Create policy
    const pRes = await request
      .post('/api/policies')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test Policy' });
    policyId = pRes.body.data.id;
    
    const cRes = await request
      .post(`/api/policies/${policyId}/criteria`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Score', min_score: 1, max_score: 10, weight: 100 });
    criterionId = cRes.body.data.id;
    
    await request
      .post(`/api/policies/${policyId}/publish`)
      .set('Authorization', `Bearer ${adminToken}`);
      
    // Create hackathon
    const hRes = await request
      .post('/api/hackathons')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Cert Hackathon' });
    hackathonId = hRes.body.data.id;
    
    await request
      .put(`/api/hackathons/${hackathonId}/policy`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ policy_id: policyId });
      
    await request
      .put(`/api/hackathons/${hackathonId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ACTIVE' });
    
    // Create team and submission
    const teamRes = await request
      .post(`/api/hackathons/${hackathonId}/teams`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test Team' });
    const teamId = teamRes.body.data.id;
    
    const subRes = await request
      .post(`/api/hackathons/${hackathonId}/submissions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ team_id: teamId, title: 'Test Project' });
    submissionId = subRes.body.data.id;
    
    // Create assignment and evaluation
    await request
      .post(`/api/hackathons/${hackathonId}/assignments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ judge_user_id: judgeId, submission_id: submissionId });
      
    await request
      .put(`/api/judging/submissions/${submissionId}/evaluation`)
      .set('Authorization', `Bearer ${judgeToken}`)
      .send({ submit: true, scores: [{ criterion_id: criterionId, raw_score: 10 }] });
  });
  
  afterAll(async () => {
    await teardownTestDb();
  });
  
  it('rejects issuance for ACTIVE hackathon (COMPLETED lifecycle requirement)', async () => {
    const res = await request
      .post(`/api/hackathons/${hackathonId}/verifiable-records/issue`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/COMPLETED/);
  });
  
  it('rejects participant from issuing', async () => {
    await pool.query('UPDATE hackathons SET status = $1 WHERE id = $2', ['COMPLETED', hackathonId]);
    const res = await request
      .post(`/api/hackathons/${hackathonId}/verifiable-records/issue`)
      .set('Authorization', `Bearer ${participantToken}`);
    expect(res.status).toBe(403);
  });
  
  it('rejects judge from issuing', async () => {
    const res = await request
      .post(`/api/hackathons/${hackathonId}/verifiable-records/issue`)
      .set('Authorization', `Bearer ${judgeToken}`);
    expect(res.status).toBe(403);
  });
  
  it('allows organizer to issue verifiable records idempotently', async () => {
    const res1 = await request
      .post(`/api/hackathons/${hackathonId}/verifiable-records/issue`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res1.status).toBe(200);
    expect(res1.body.data.issued_count).toBe(2); // 1 judge, 1 participant
    
    // Re-issuance
    const res2 = await request
      .post(`/api/hackathons/${hackathonId}/verifiable-records/issue`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res2.status).toBe(200);
    expect(res2.body.data.issued_count).toBe(0); // Idempotency check
  });
  
  it('verifies the cryptographic signature natively using public key', async () => {
    const { rows: records } = await pool.query('SELECT * FROM verifiable_records LIMIT 1');
    const record = records[0];
    
    // Get public key
    const pubRes = await request.get('/api/public/keys');
    const keyData = pubRes.body.data.keys.find((k: any) => k.kid === record.kid);
    expect(keyData).toBeDefined();
    expect(keyData.public_key).toBeDefined();
    
    // Verify math
    const canonical = canonicalize(record.payload);
    const verifies = crypto.verify(null, Buffer.from(canonical, 'utf8'), keyData.public_key, Buffer.from(record.signature, 'base64'));
    expect(verifies).toBe(true);
  });
  
  it('fails verification if payload is tampered', async () => {
    const { rows: records } = await pool.query('SELECT * FROM verifiable_records LIMIT 1');
    const record = records[0];
    const pubRes = await request.get('/api/public/keys');
    const keyData = pubRes.body.data.keys.find((k: any) => k.kid === record.kid);
    
    const tamperedPayload = { ...record.payload, hackathon_name: 'HACKED' };
    const canonical = canonicalize(tamperedPayload);
    
    const verifies = crypto.verify(null, Buffer.from(canonical, 'utf8'), keyData.public_key, Buffer.from(record.signature, 'base64'));
    expect(verifies).toBe(false);
  });
  
  it('fails verification if signature is tampered', async () => {
    const { rows: records } = await pool.query('SELECT * FROM verifiable_records LIMIT 1');
    const record = records[0];
    const pubRes = await request.get('/api/public/keys');
    const keyData = pubRes.body.data.keys.find((k: any) => k.kid === record.kid);
    
    const canonical = canonicalize(record.payload);
    const badSig = Buffer.from(record.signature, 'base64');
    badSig[0] ^= 1; // Flip a bit
    
    const verifies = crypto.verify(null, Buffer.from(canonical, 'utf8'), keyData.public_key, badSig);
    expect(verifies).toBe(false);
  });
  
  it('maintains original record even if source data changes', async () => {
    const { rows: beforeRecords } = await pool.query('SELECT * FROM verifiable_records WHERE type = $1', ['PARTICIPANT_CERTIFICATE']);
    const beforeCert = beforeRecords[0];
    
    // Change evaluation in DB
    await pool.query('UPDATE evaluations SET total_score = 0');
    
    const { rows: afterRecords } = await pool.query('SELECT * FROM verifiable_records WHERE type = $1', ['PARTICIPANT_CERTIFICATE']);
    expect(afterRecords[0].payload).toEqual(beforeCert.payload);
    expect(afterRecords[0].signature).toEqual(beforeCert.signature);
  });
  
  it('prevents private key leakage', async () => {
    const res = await request.get('/api/public/keys');
    const keysJSON = JSON.stringify(res.body);
    expect(keysJSON).not.toMatch(/PRIVATE KEY/i);
    expect(keysJSON).not.toMatch(/encrypted/i);
  });
});
