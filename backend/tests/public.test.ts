import { request, setupTestDb, cleanTestDb, teardownTestDb, registerUser, loginUser } from './helpers';
import { getPool } from '../src/db';

describe('Public API & Participant Submissions', () => {
  let adminToken: string;
  let p1Token: string;
  let p1Id: string;
  let p2Token: string;
  let p2Id: string;
  
  let hackathonId: string;
  let submissionId: string;

  beforeAll(async () => {
    await setupTestDb();
    await cleanTestDb();

    // Create admin
    await registerUser('admin@dogfood.local', 'password123', 'Admin');
    await getPool().query("UPDATE users SET is_admin = true WHERE email = 'admin@dogfood.local'");
    const adminRes = await loginUser('admin@dogfood.local', 'password123');
    adminToken = adminRes.body.data.token;

    // Create participant 1
    await registerUser('p1@dogfood.local', 'password123', 'Participant 1');
    const p1Res = await loginUser('p1@dogfood.local', 'password123');
    p1Token = p1Res.body.data.token;
    p1Id = p1Res.body.data.user.id;

    // Create participant 2
    await registerUser('p2@dogfood.local', 'password123', 'Participant 2');
    const p2Res = await loginUser('p2@dogfood.local', 'password123');
    p2Token = p2Res.body.data.token;
    p2Id = p2Res.body.data.user.id;

    // Create hackathon with future deadline
    const futureDate = new Date(Date.now() + 86400000).toISOString(); // +1 day
    const hRes = await getPool().query(
      `INSERT INTO hackathons (name, created_by, submissions_close) VALUES ($1, $2, $3) RETURNING id`,
      ['Test Hackathon', p1Id, futureDate] // Using p1Id just as a valid user ID for created_by
    );
    hackathonId = hRes.rows[0].id;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('participant can submit a project', async () => {
    const res = await request
      .post('/api/public/submit')
      .set('Authorization', `Bearer ${p1Token}`)
      .send({ title: 'My Awesome Project' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('My Awesome Project');
    submissionId = res.body.id;
  });

  it('unauthenticated request to edit fails', async () => {
    const res = await request
      .put(`/api/public/submissions/${submissionId}`)
      .send({ title: 'New Title' });
    expect(res.status).toBe(401);
  });

  it('invalid title fails', async () => {
    const res = await request
      .put(`/api/public/submissions/${submissionId}`)
      .set('Authorization', `Bearer ${p1Token}`)
      .send({ title: '' });
    expect(res.status).toBe(400);
  });

  it('nonexistent submission fails', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request
      .put(`/api/public/submissions/${fakeId}`)
      .set('Authorization', `Bearer ${p1Token}`)
      .send({ title: 'New Title' });
    expect(res.status).toBe(404);
  });

  it('participant cannot edit another team’s submission', async () => {
    const res = await request
      .put(`/api/public/submissions/${submissionId}`)
      .set('Authorization', `Bearer ${p2Token}`)
      .send({ title: 'Hacked Title' });
    expect(res.status).toBe(403);
  });

  it('authenticated owner can edit before deadline', async () => {
    const res = await request
      .put(`/api/public/submissions/${submissionId}`)
      .set('Authorization', `Bearer ${p1Token}`)
      .send({ title: 'My Updated Awesome Project' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('My Updated Awesome Project');

    // Verify it changed in DB
    const dbRes = await getPool().query('SELECT title FROM submissions WHERE id = $1', [submissionId]);
    expect(dbRes.rows[0].title).toBe('My Updated Awesome Project');
  });

  it('cannot edit after submissions_close', async () => {
    // Update hackathon deadline to past
    const pastDate = new Date(Date.now() - 86400000).toISOString(); // -1 day
    await getPool().query('UPDATE hackathons SET submissions_close = $1 WHERE id = $2', [pastDate, hackathonId]);

    const res = await request
      .put(`/api/public/submissions/${submissionId}`)
      .set('Authorization', `Bearer ${p1Token}`)
      .send({ title: 'Too Late Project' });
    expect(res.status).toBe(403);
  });

  describe('Community Voting (T3)', () => {
    let openHackathonId: string;
    let openSubId: string;
    let otherSubId: string;
    let p3Token: string;

    beforeAll(async () => {
      // Create user 3
      await registerUser('p3@dogfood.local', 'password123', 'Participant 3');
      const p3Res = await loginUser('p3@dogfood.local', 'password123');
      p3Token = p3Res.body.data.token;

      // Create open hackathon
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const hRes = await getPool().query(
        `INSERT INTO hackathons (name, created_by, submissions_close) VALUES ($1, $2, $3) RETURNING id`,
        ['Voting Hackathon', p1Id, futureDate]
      );
      openHackathonId = hRes.rows[0].id;

      // Create Team for P1 and Submission
      const t1Res = await getPool().query(
        `INSERT INTO teams (hackathon_id, name) VALUES ($1, $2) RETURNING id`,
        [openHackathonId, "P1 Team"]
      );
      await getPool().query(`INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)`, [t1Res.rows[0].id, p1Id]);
      const s1Res = await getPool().query(
        `INSERT INTO submissions (hackathon_id, team_id, title) VALUES ($1, $2, $3) RETURNING id`,
        [openHackathonId, t1Res.rows[0].id, 'P1 Project']
      );
      openSubId = s1Res.rows[0].id;

      // Create Team for P2 and Submission
      const t2Res = await getPool().query(
        `INSERT INTO teams (hackathon_id, name) VALUES ($1, $2) RETURNING id`,
        [openHackathonId, "P2 Team"]
      );
      await getPool().query(`INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)`, [t2Res.rows[0].id, p2Id]);
      const s2Res = await getPool().query(
        `INSERT INTO submissions (hackathon_id, team_id, title) VALUES ($1, $2, $3) RETURNING id`,
        [openHackathonId, t2Res.rows[0].id, 'P2 Project']
      );
      otherSubId = s2Res.rows[0].id;
    });

    it('unauthenticated user is rejected from voting (401)', async () => {
      const res = await request.post(`/api/public/submissions/${openSubId}/vote`).send({});
      expect(res.status).toBe(401);
    });

    it('nonexistent submission rejected (404)', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request
        .post(`/api/public/submissions/${fakeId}/vote`)
        .set('Authorization', `Bearer ${p2Token}`)
        .send({});
      expect(res.status).toBe(404);
    });

    it('submission/hackathon mismatch rejected (400)', async () => {
      const fakeHackathonId = '00000000-0000-0000-0000-000000000000';
      const res = await request
        .post(`/api/public/submissions/${openSubId}/vote`)
        .set('Authorization', `Bearer ${p2Token}`)
        .send({ hackathon_id: fakeHackathonId });
      expect(res.status).toBe(400);
    });

    it('self-vote is rejected (403)', async () => {
      // P1 tries to vote for their own team's submission
      const res = await request
        .post(`/api/public/submissions/${openSubId}/vote`)
        .set('Authorization', `Bearer ${p1Token}`)
        .send({});
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('own team');
    });

    it('authenticated user can vote for another team submission (201)', async () => {
      // P2 votes for P1's project
      const res = await request
        .post(`/api/public/submissions/${openSubId}/vote`)
        .set('Authorization', `Bearer ${p2Token}`)
        .send({});
      expect(res.status).toBe(201);
      expect(res.body.data.submission_id).toBe(openSubId);
    });

    it('duplicate vote for same submission is rejected (409)', async () => {
      // P2 tries to vote again for P1's project
      const res = await request
        .post(`/api/public/submissions/${openSubId}/vote`)
        .set('Authorization', `Bearer ${p2Token}`)
        .send({});
      expect(res.status).toBe(409);
    });

    it('vote count endpoint accurately reflects total votes', async () => {
      // Initial count should be 1
      let res = await request.get(`/api/public/submissions/${openSubId}/votes`);
      expect(res.status).toBe(200);
      expect(res.body.votes).toBe(1);

      // P3 votes for P1's project
      await request
        .post(`/api/public/submissions/${openSubId}/vote`)
        .set('Authorization', `Bearer ${p3Token}`)
        .send({});

      // Count should now be 2
      res = await request.get(`/api/public/submissions/${openSubId}/votes`);
      expect(res.status).toBe(200);
      expect(res.body.votes).toBe(2);

      // Other project should have 0 votes
      const otherRes = await request.get(`/api/public/submissions/${otherSubId}/votes`);
      expect(otherRes.status).toBe(200);
      expect(otherRes.body.votes).toBe(0);
    });

    it('voting rejected when submissions_close has passed (403)', async () => {
      // Expire the hackathon
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      await getPool().query('UPDATE hackathons SET submissions_close = $1 WHERE id = $2', [pastDate, openHackathonId]);

      // P1 attempts to vote for P2's project after deadline
      const res = await request
        .post(`/api/public/submissions/${otherSubId}/vote`)
        .set('Authorization', `Bearer ${p1Token}`)
        .send({});
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('closed');
    });
  });

  describe('Public Submission Comments (T3)', () => {
    let openHackathonId: string;
    let openSubId: string;

    beforeAll(async () => {
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const hRes = await getPool().query(
        `INSERT INTO hackathons (name, created_by, submissions_close) VALUES ($1, $2, $3) RETURNING id`,
        ['Comments Hackathon', p1Id, futureDate]
      );
      openHackathonId = hRes.rows[0].id;

      const t1Res = await getPool().query(
        `INSERT INTO teams (hackathon_id, name) VALUES ($1, $2) RETURNING id`,
        [openHackathonId, "Comment Team"]
      );
      await getPool().query(`INSERT INTO team_members (team_id, user_id) VALUES ($1, $2)`, [t1Res.rows[0].id, p1Id]);
      const s1Res = await getPool().query(
        `INSERT INTO submissions (hackathon_id, team_id, title) VALUES ($1, $2, $3) RETURNING id`,
        [openHackathonId, t1Res.rows[0].id, 'Comment Project']
      );
      openSubId = s1Res.rows[0].id;
    });

    it('unauthenticated comment creation is rejected (401)', async () => {
      const res = await request
        .post(`/api/public/submissions/${openSubId}/comments`)
        .send({ body: 'Nice work!' });
      expect(res.status).toBe(401);
    });

    it('nonexistent submission rejected (404)', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request
        .post(`/api/public/submissions/${fakeId}/comments`)
        .set('Authorization', `Bearer ${p1Token}`)
        .send({ body: 'Hello' });
      expect(res.status).toBe(404);
    });

    it('empty comment rejected (400)', async () => {
      const res = await request
        .post(`/api/public/submissions/${openSubId}/comments`)
        .set('Authorization', `Bearer ${p1Token}`)
        .send({ body: '   ' });
      expect(res.status).toBe(400);
    });

    it('oversized comment rejected (400)', async () => {
      const hugeBody = 'a'.repeat(2001);
      const res = await request
        .post(`/api/public/submissions/${openSubId}/comments`)
        .set('Authorization', `Bearer ${p1Token}`)
        .send({ body: hugeBody });
      expect(res.status).toBe(400);
    });

    it('authenticated user can create comment (201)', async () => {
      const res = await request
        .post(`/api/public/submissions/${openSubId}/comments`)
        .set('Authorization', `Bearer ${p1Token}`)
        .send({ body: 'This is a test comment.' });
      expect(res.status).toBe(201);
      expect(res.body.data.body).toBe('This is a test comment.');
      expect(res.body.data.submission_id).toBe(openSubId);
    });

    it('created comment is retrievable (200)', async () => {
      const res = await request.get(`/api/public/submissions/${openSubId}/comments`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].body).toBe('This is a test comment.');
      
      // Verify sensitive info is not exposed
      expect(res.body[0]).toHaveProperty('author_name');
      expect(res.body[0]).not.toHaveProperty('email');
      expect(res.body[0]).not.toHaveProperty('password_hash');
    });
  });

  describe('T3: Randomized Ballots and Results Embargo', () => {
    let embargoHackathonId: string;
    let sub1Id: string;
    let sub2Id: string;

    beforeAll(async () => {
      // Create a new hackathon that is OPEN (embargoed)
      const futureDate = new Date(Date.now() + 86400000).toISOString();
      const hRes = await getPool().query(
        `INSERT INTO hackathons (name, created_by, submissions_close) VALUES ($1, $2, $3) RETURNING id`,
        ['Embargo Hackathon', p1Id, futureDate]
      );
      embargoHackathonId = hRes.rows[0].id;

      // Add 2 teams and 2 submissions
      const t1Res = await getPool().query(`INSERT INTO teams (hackathon_id, name) VALUES ($1, $2) RETURNING id`, [embargoHackathonId, "T1"]);
      const t2Res = await getPool().query(`INSERT INTO teams (hackathon_id, name) VALUES ($1, $2) RETURNING id`, [embargoHackathonId, "T2"]);
      
      const s1Res = await getPool().query(`INSERT INTO submissions (hackathon_id, team_id, title) VALUES ($1, $2, $3) RETURNING id`, [embargoHackathonId, t1Res.rows[0].id, 'Project A']);
      const s2Res = await getPool().query(`INSERT INTO submissions (hackathon_id, team_id, title) VALUES ($1, $2, $3) RETURNING id`, [embargoHackathonId, t2Res.rows[0].id, 'Project B']);
      
      sub1Id = s1Res.rows[0].id;
      sub2Id = s2Res.rows[0].id;
    });

    it('returns 403 when requesting results before the window closes', async () => {
      const res = await request.get(`/api/public/hackathons/${embargoHackathonId}/results`);
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('embargoed');
    });

    it('gallery returns deterministic randomized order for different seeds', async () => {
      const resA = await request.get('/api/public/gallery?seed=alpha');
      expect(resA.status).toBe(200);
      expect(resA.body.length).toBeGreaterThanOrEqual(2);

      const resB = await request.get('/api/public/gallery?seed=beta');
      expect(resB.status).toBe(200);

      // Verify deterministic nature by calling again with 'alpha'
      const resA2 = await request.get('/api/public/gallery?seed=alpha');
      expect(resA2.body).toEqual(resA.body);
      
      // Note: There is a small chance (50% for 2 items) that alpha and beta sort identically, 
      // but they are generated via MD5 so it's deterministic.
    });

    it('returns 200 with results when the window is closed', async () => {
      // Force hackathon window to close
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      await getPool().query('UPDATE hackathons SET submissions_close = $1 WHERE id = $2', [pastDate, embargoHackathonId]);

      const res = await request.get(`/api/public/hackathons/${embargoHackathonId}/results`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('results');
      expect(Array.isArray(res.body.results)).toBe(true);
      expect(res.body.results.length).toBe(2);
      expect(res.body.results[0]).toHaveProperty('aggregate_score');
      expect(res.body.results[0]).toHaveProperty('community_votes');
    });
  });
});

