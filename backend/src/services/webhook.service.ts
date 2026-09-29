import { getPool } from '../db';
import { PoolClient } from 'pg';
import crypto from 'crypto';
import { AppError, AuthorizationError } from '../errors';

export async function createWebhook(hackathonId: string, url: string, actorId: string) {
  const pool = getPool();
  const { rows: users } = await pool.query('SELECT is_admin FROM users WHERE id = $1', [actorId]);
  if (!users.length || !users[0].is_admin) throw new AuthorizationError('Organizer access required');

  const secret = crypto.randomBytes(32).toString('hex');
  const { rows } = await pool.query(`
    INSERT INTO webhooks (hackathon_id, url, secret, is_active)
    VALUES ($1, $2, $3, $4)
    RETURNING id, hackathon_id, url, is_active, created_at, updated_at
  `, [hackathonId, url, secret, true]);

  // Return secret only on creation
  return { ...rows[0], secret };
}

export async function listWebhooks(hackathonId: string, actorId: string) {
  const pool = getPool();
  const { rows: users } = await pool.query('SELECT is_admin FROM users WHERE id = $1', [actorId]);
  if (!users.length || !users[0].is_admin) throw new AuthorizationError('Organizer access required');

  const { rows } = await pool.query(`
    SELECT id, hackathon_id, url, is_active, created_at, updated_at
    FROM webhooks WHERE hackathon_id = $1 ORDER BY created_at DESC
  `, [hackathonId]);
  
  return rows;
}

export async function getWebhook(id: string, actorId: string) {
  const pool = getPool();
  const { rows: users } = await pool.query('SELECT is_admin FROM users WHERE id = $1', [actorId]);
  if (!users.length || !users[0].is_admin) throw new AuthorizationError('Organizer access required');

  const { rows } = await pool.query(`
    SELECT id, hackathon_id, url, is_active, created_at, updated_at
    FROM webhooks WHERE id = $1
  `, [id]);
  if (!rows.length) throw new AppError(404, 'Webhook not found', 'NOT_FOUND');
  
  return rows[0];
}

export async function updateWebhook(id: string, url: string, isActive: boolean, actorId: string) {
  const pool = getPool();
  const { rows: users } = await pool.query('SELECT is_admin FROM users WHERE id = $1', [actorId]);
  if (!users.length || !users[0].is_admin) throw new AuthorizationError('Organizer access required');

  const { rows } = await pool.query(`
    UPDATE webhooks SET url = $1, is_active = $2, updated_at = NOW()
    WHERE id = $3
    RETURNING id, hackathon_id, url, is_active, created_at, updated_at
  `, [url, isActive, id]);
  
  if (!rows.length) throw new AppError(404, 'Webhook not found', 'NOT_FOUND');
  return rows[0];
}

export async function deleteWebhook(id: string, actorId: string) {
  const pool = getPool();
  const { rows: users } = await pool.query('SELECT is_admin FROM users WHERE id = $1', [actorId]);
  if (!users.length || !users[0].is_admin) throw new AuthorizationError('Organizer access required');

  const { rowCount } = await pool.query(`DELETE FROM webhooks WHERE id = $1`, [id]);
  if (rowCount === 0) throw new AppError(404, 'Webhook not found', 'NOT_FOUND');
  return { success: true };
}

// Emits a webhook delivery task atomically in a transaction
export async function emitWebhookEvent(tx: PoolClient, hackathonId: string, eventType: string, payload: any) {
  await tx.query(`
    INSERT INTO webhook_deliveries (webhook_id, event_type, payload)
    SELECT id, $1, $2
    FROM webhooks
    WHERE hackathon_id = $3 AND is_active = true
  `, [eventType, payload, hackathonId]);
}

// Test webhook helper
export async function sendTestWebhook(id: string, actorId: string) {
  const pool = getPool();
  const webhook = await getWebhook(id, actorId); // checks auth
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await emitWebhookEvent(client, webhook.hackathon_id, 'webhook.test', { message: 'Test webhook delivery' });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return { success: true };
}

export async function getWebhookDeliveries(webhookId: string, actorId: string) {
  const pool = getPool();
  const { rows: users } = await pool.query('SELECT is_admin FROM users WHERE id = $1', [actorId]);
  if (!users.length || !users[0].is_admin) throw new AuthorizationError('Organizer access required');

  const { rows } = await pool.query(`
    SELECT id, webhook_id, event_type, payload, status, attempt_count, next_retry_at, 
           last_response_status, last_response_body, created_at, updated_at
    FROM webhook_deliveries WHERE webhook_id = $1 ORDER BY created_at DESC LIMIT 50
  `, [webhookId]);
  
  return rows;
}
