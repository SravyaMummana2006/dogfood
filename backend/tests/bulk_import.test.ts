import { request, setupTestDb, cleanTestDb, teardownTestDb, registerUser, loginUser } from './helpers';
import app from '../src/app';
import { getPool } from '../src/db';

describe('Event Migration (T4 Bulk Import/Export)', () => {
  let adminToken: string;
  let hackathonId: string;
  let policyId: string;
  let participant1Id: string;
  let participant2Id: string;
  let judge1Id: string;

  beforeAll(async () => {
    await setupTestDb();
    const pool = getPool();

    // Create users
    await registerUser('admin@dogfood.local', 'password123', 'Admin');
    await pool.query("UPDATE users SET is_admin = true WHERE email = 'admin@dogfood.local'");
    adminToken = (await loginUser('admin@dogfood.local', 'password123')).body.data.token;

    await registerUser('p1@dogfood.local', 'password123', 'P1');
    const { rows: p1s } = await pool.query("SELECT id FROM users WHERE email = 'p1@dogfood.local'");
    participant1Id = p1s[0].id;

    await registerUser('p2@dogfood.local', 'password123', 'P2');
    const { rows: p2s } = await pool.query("SELECT id FROM users WHERE email = 'p2@dogfood.local'");
    participant2Id = p2s[0].id;

    await registerUser('j1@dogfood.local', 'password123', 'J1');
    const { rows: j1s } = await pool.query("SELECT id FROM users WHERE email = 'j1@dogfood.local'");
    judge1Id = j1s[0].id;

    // Create policy
    const pRes = await request
      .post('/api/policies')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Migration Policy' });
    policyId = pRes.body.data.id;

    await request
      .post(`/api/policies/${policyId}/criteria`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Tech', description: 'desc', weight: 100, min_score: 1, max_score: 5 });

    await request
      .put(`/api/policies/${policyId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'PUBLISHED' });

    // Create Hackathon
    const hRes = await request
      .post('/api/hackathons')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Migrate Me', description: 'Event A' });
    hackathonId = hRes.body.data.id;

    await request
      .put(`/api/hackathons/${hackathonId}/policy`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ policy_id: policyId });

    await request
      .put(`/api/hackathons/${hackathonId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ACTIVE' });

    // Team + Sub
    const tRes = await request
      .post(`/api/hackathons/${hackathonId}/teams`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Team Migration' });
    const teamId = tRes.body.data.id;

    await pool.query('INSERT INTO team_members (team_id, user_id) VALUES ($1, $2), ($1, $3)', [teamId, participant1Id, participant2Id]);

    const sRes = await request
      .post(`/api/hackathons/${hackathonId}/submissions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ team_id: teamId, title: 'Submission Migration' });
    const submissionId = sRes.body.data.id;

    await request
      .post(`/api/hackathons/${hackathonId}/assignments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ judge_user_id: judge1Id, submission_id: submissionId });

    // Raw SQL for eval to bypass potential time limits for testing
    const { rows: crits } = await pool.query('SELECT id FROM rubric_criteria WHERE policy_id = $1', [policyId]);
    const cid = crits[0].id;

    await pool.query('INSERT INTO evaluations (id, hackathon_id, submission_id, judge_user_id, status, total_score, policy_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      ['00000000-0000-0000-0000-000000000001', hackathonId, submissionId, judge1Id, 'SUBMITTED', 4.0, policyId]
    );

    await pool.query('INSERT INTO evaluation_scores (evaluation_id, criterion_id, raw_score, normalized_score, weighted_score) VALUES ($1, $2, $3, $4, $5)',
      ['00000000-0000-0000-0000-000000000001', cid, 4, 1.0, 4.0]
    );

    await pool.query('UPDATE hackathons SET status = $1 WHERE id = $2', ['COMPLETED', hackathonId]);
  });

  afterAll(async () => {
    await cleanTestDb();
    await teardownTestDb();
  });

  let artifact: any;

  it('exports the complete event artifact safely', async () => {
    const res = await request
      .get(`/api/hackathons/${hackathonId}/export`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    artifact = res.body;

    expect(artifact.manifest.source_server).toBe('dogfood');
    expect(artifact.hackathon.id).toBe(hackathonId);
    expect(artifact.users.some((u: any) => u.email === 'j1@dogfood.local')).toBe(true);
    
    // Security sanitization check
    const usersStr = JSON.stringify(artifact.users);
    expect(usersStr).not.toMatch(/password_hash/);
    expect(usersStr).not.toMatch(/encrypted_private_key/);
    expect(artifact.verifiable_records).toBeUndefined();
    expect(artifact.audit_events).toBeUndefined();
  });

  it('rejects import if missing users exist', async () => {
    const tamperedArtifact = JSON.parse(JSON.stringify(artifact));
    tamperedArtifact.users.push({ id: '00000000-0000-0000-0000-000000000002', email: 'missing@dogfood.local' });

    const res = await request
      .post('/api/hackathons/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(tamperedArtifact);
    
    expect(res.status).toBe(422); // Validation error
    expect(res.body.error.message).toMatch(/Missing users/);
  });

  it('rejects import if structural failure occurs (rollback check)', async () => {
    const tamperedArtifact = JSON.parse(JSON.stringify(artifact));
    // Invalid null name to trigger DB constraint failure
    tamperedArtifact.teams[0].name = null;

    const res = await request
      .post('/api/hackathons/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(tamperedArtifact);
    
    // Postgres check constraint will fail
    expect(res.status).toBe(400); 

    // Verify rollback: no new hackathon created named 'Migrate Me' other than original
    const { rows } = await getPool().query('SELECT id FROM hackathons WHERE name = $1', ['Migrate Me']);
    expect(rows.length).toBe(1);
  });

  let newHackathonId: string;

  it('successfully imports the completed event and recomputes aggregates', async () => {
    const res = await request
      .post('/api/hackathons/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(artifact);
    
    expect(res.status).toBe(201);
    newHackathonId = res.body.data.target_hackathon_id;
    expect(newHackathonId).not.toBe(hackathonId);

    // Verify UUID boundary isolated
    const { rows } = await getPool().query('SELECT id, title FROM submissions WHERE hackathon_id = $1', [newHackathonId]);
    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe(artifact.submissions[0].title);

    // Verify aggregates
    const aRes = await request
      .get(`/api/hackathons/${newHackathonId}/results`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(aRes.status).toBe(200);
    const results = aRes.body.data.results;
    expect(results.length).toBe(1);
    expect(results[0].aggregate_score).toBe(4.0); // Exactly matches source
  });
});
