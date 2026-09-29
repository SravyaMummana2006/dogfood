import supertest from 'supertest';
import app from '../src/app';
import { getPool } from '../src/db';
import { request, setupTestDb, registerUser, loginUser, cleanTestDb, teardownTestDb } from './helpers';
import express from 'express';
import crypto from 'crypto';

describe('Webhooks API & Delivery', () => {
  let organizerToken: string;
  let participantToken: string;
  let hackathonId: string;
  let webhookId: string;
  let webhookSecret: string;
  let receiverApp: any;
  let server: any;
  let receivedEvents: any[] = [];
  let receiverStatus = 200;

  beforeAll(async () => {
    await cleanTestDb();
    
    // Create a local webhook receiver
    receiverApp = express();
    receiverApp.use(express.json());
    receiverApp.post('/wh', (req: any, res: any) => {
      receivedEvents.push({
        headers: req.headers,
        body: req.body
      });
      res.sendStatus(receiverStatus);
    });
    
    await new Promise<void>((resolve) => {
      server = receiverApp.listen(9999, () => resolve());
    });

    // Create an organizer
    await registerUser('org_wh@test.com', 'password123');
    await getPool().query(`UPDATE users SET is_admin = true WHERE email = 'org_wh@test.com'`);
    const orgLogin = await loginUser('org_wh@test.com', 'password123');
    organizerToken = orgLogin.body.data.token;
    
    // Create a participant
    await registerUser('part_wh@test.com', 'password123');
    const partLogin = await loginUser('part_wh@test.com', 'password123');
    participantToken = partLogin.body.data.token;

    // Create a policy and hackathon
    const { rows: pols } = await getPool().query(`INSERT INTO judging_policies (name, description, created_by, status) VALUES ('Test Policy', 'Desc', $1, 'PUBLISHED') RETURNING id`, [orgLogin.body.data.user.id]);
    const res = await getPool().query(`INSERT INTO hackathons (name, description, status, policy_id, submissions_close, created_by) VALUES ('WH Hack', 'Desc', 'ACTIVE', $1, NOW() + INTERVAL '1 day', $2) RETURNING id`, [pols[0].id, orgLogin.body.data.user.id]);
    hackathonId = res.rows[0].id;
  });

  afterAll(async () => {
    await cleanTestDb();
    if (server) {
      await new Promise<void>(resolve => server.close(resolve));
    }
  });

  beforeEach(() => {
    receivedEvents = [];
    receiverStatus = 200;
  });

  it('prevents participants from creating webhooks', async () => {
    const res = await request
      .post(`/api/hackathons/${hackathonId}/webhooks`)
      .set('Authorization', `Bearer ${participantToken}`)
      .send({ url: 'http://localhost:9999/wh' });
    expect(res.status).toBe(403);
  });

  it('allows organizer to create a webhook', async () => {
    const res = await request
      .post(`/api/hackathons/${hackathonId}/webhooks`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ url: 'http://localhost:9999/wh' });
    expect(res.status).toBe(201);
    webhookId = res.body.data.id;
    webhookSecret = res.body.data.secret;
  });

  it('lists webhooks but does not expose secret', async () => {
    const res = await request
      .get(`/api/hackathons/${hackathonId}/webhooks`)
      .set('Authorization', `Bearer ${organizerToken}`);
    expect(res.body.data[0]).not.toHaveProperty('secret');
  });

  it('emits webhook event transactionally when domain is mutated', async () => {
    // Cause domain mutation
    const res = await request
      .post('/api/public/submit')
      .set('Authorization', `Bearer ${participantToken}`)
      .send({
        team_name: 'Webhook Team',
        title: 'Webhook Project',
        description: 'Test',
        source_url: 'http://test.com'
      });
    expect(res.status).toBe(201);

    const pool = getPool();
    const deliveries = await pool.query('SELECT * FROM webhook_deliveries WHERE webhook_id = $1', [webhookId]);
    expect(deliveries.rows.length).toBeGreaterThanOrEqual(1);
    expect(deliveries.rows[0].status).toBe('PENDING');
  });

  it('successfully delivers locally and verifies HMAC-SHA256 signature', async () => {
    // Manually run the worker logic for one pending delivery
    const { processWebhooks } = await import('../src/workers/webhook.worker');
    await processWebhooks();

    // Verify it was received
    expect(receivedEvents.length).toBeGreaterThan(0);
    const event = receivedEvents[0];
    
    // Check HMAC-SHA256 signature
    const signatureHeader = event.headers['x-dogfood-signature'];
    expect(signatureHeader).toBeDefined();

    const timestamp = event.headers['x-dogfood-timestamp'];
    const expectedSig = crypto.createHmac('sha256', webhookSecret).update(timestamp + '.' + JSON.stringify(event.body)).digest('hex');
    expect(signatureHeader).toBe(expectedSig);

    // DB state should be SUCCESS
    const pool = getPool();
    const deliveries = await pool.query('SELECT status, attempt_count FROM webhook_deliveries WHERE webhook_id = $1 ORDER BY created_at DESC LIMIT 1', [webhookId]);
    expect(deliveries.rows[0].status).toBe('SUCCESS');
    expect(deliveries.rows[0].attempt_count).toBe(1);
  });

  it('retries failed delivery with exponential backoff', async () => {
    // Send a test webhook
    await request
      .post(`/api/hackathons/${hackathonId}/webhooks/${webhookId}/test`)
      .set('Authorization', `Bearer ${organizerToken}`);

    // Set receiver to fail
    receiverStatus = 500;
    
    const { processWebhooks } = await import('../src/workers/webhook.worker');
    await processWebhooks();

    // DB state should be PENDING but attempt_count increased
    const pool = getPool();
    const deliveries = await pool.query('SELECT status, attempt_count, next_retry_at FROM webhook_deliveries WHERE webhook_id = $1 ORDER BY created_at DESC LIMIT 1', [webhookId]);
    
    expect(deliveries.rows[0].status).toBe('PENDING');
    expect(deliveries.rows[0].attempt_count).toBe(1);
    expect(deliveries.rows[0].next_retry_at).toBeDefined();
    
    // The next_retry_at should be in the future
    expect(new Date(deliveries.rows[0].next_retry_at).getTime()).toBeGreaterThan(Date.now());
  });


  it('rejects invalid webhook URL payload', async () => {
    const res = await request
      .post(`/api/hackathons/${hackathonId}/webhooks`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ url: 'not-a-url' });
    expect(res.status).toBe(422);
  });

  it('gets a specific webhook', async () => {
    const res = await request
      .get(`/api/hackathons/${hackathonId}/webhooks/${webhookId}`)
      .set('Authorization', `Bearer ${organizerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(webhookId);
  });

  it('updates an existing webhook', async () => {
    const res = await request
      .put(`/api/hackathons/${hackathonId}/webhooks/${webhookId}`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ url: 'http://localhost:9999/wh-updated', is_active: false });
    expect(res.status).toBe(200);
    expect(res.body.data.url).toBe('http://localhost:9999/wh-updated');
    expect(res.body.data.is_active).toBe(false);
    
    // restore it
    await request
      .put(`/api/hackathons/${hackathonId}/webhooks/${webhookId}`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({ url: 'http://localhost:9999/wh', is_active: true });
  });

  it('fetches webhook deliveries list', async () => {
    const res = await request
      .get(`/api/hackathons/${hackathonId}/webhooks/${webhookId}/deliveries`)
      .set('Authorization', `Bearer ${organizerToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('deletes a webhook', async () => {
    const res = await request
      .delete(`/api/hackathons/${hackathonId}/webhooks/${webhookId}`)
      .set('Authorization', `Bearer ${organizerToken}`);
    expect(res.status).toBe(204);
    
    const getRes = await request
      .get(`/api/hackathons/${hackathonId}/webhooks/${webhookId}`)
      .set('Authorization', `Bearer ${organizerToken}`);
    expect(getRes.status).toBe(404);
  });

});
