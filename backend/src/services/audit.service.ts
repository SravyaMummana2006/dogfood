import { PoolClient } from 'pg';
import { getPool } from '../db';

export async function recordAudit(
  client: PoolClient,
  actorUserId: string,
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, any> = {}
): Promise<void> {
  await client.query(
    `INSERT INTO audit_events (actor_user_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [actorUserId, action, entityType, entityId, JSON.stringify(details)]
  );

  let hackathonId: string | null = null;
  if (entityType === 'hackathons') {
    hackathonId = entityId;
  } else if (entityType === 'submissions') {
    const { rows } = await client.query('SELECT hackathon_id FROM submissions WHERE id = $1', [entityId]);
    if (rows.length) hackathonId = rows[0].hackathon_id;
  } else if (entityType === 'judge_assignments') {
    const { rows } = await client.query('SELECT hackathon_id FROM judge_assignments WHERE id = $1', [entityId]);
    if (rows.length) hackathonId = rows[0].hackathon_id;
  } else if (entityType === 'judge_invitations') {
    const { rows } = await client.query('SELECT hackathon_id FROM judge_invitations WHERE id = $1', [entityId]);
    if (rows.length) hackathonId = rows[0].hackathon_id;
  } else if (entityType === 'evaluations') {
    const { rows } = await client.query('SELECT hackathon_id FROM evaluations WHERE id = $1', [entityId]);
    if (rows.length) hackathonId = rows[0].hackathon_id;
  } else if (entityType === 'teams') {
    const { rows } = await client.query('SELECT hackathon_id FROM teams WHERE id = $1', [entityId]);
    if (rows.length) hackathonId = rows[0].hackathon_id;
  }

  if (hackathonId) {
    const { emitWebhookEvent } = await import('./webhook.service');
    const eventPayload = {
      action,
      entity_type: entityType,
      entity_id: entityId,
      actor_user_id: actorUserId,
      details
    };
    await emitWebhookEvent(client, hackathonId, `event.${action.toLowerCase()}`, eventPayload);
  }
}

// For cases where we just want to fetch the audit log (organizer only)
export async function getAuditLog(limit = 100): Promise<any[]> {
  const { rows } = await getPool().query(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.created_at, u.email as actor_email
     FROM audit_events a
     JOIN users u ON a.actor_user_id = u.id
     ORDER BY a.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}
