import { getPool } from '../db';
import { AuthorizationError, NotFoundError, AppError } from '../errors';
import { signPayload } from './crypto.service';

export async function issueVerifiableRecords(hackathonId: string, actorId: string) {
  const pool = getPool();
  
  // 1. Check auth
  const { rows: users } = await pool.query('SELECT is_admin FROM users WHERE id = $1', [actorId]);
  if (!users.length || !users[0].is_admin) throw new AuthorizationError('Organizer access required');
  
  // 2. Check hackathon status
  const { rows: hackathons } = await pool.query('SELECT name, status FROM hackathons WHERE id = $1', [hackathonId]);
  if (!hackathons.length) throw new NotFoundError('Hackathon not found');
  if (hackathons[0].status !== 'COMPLETED') throw new AppError(400, 'Hackathon must be COMPLETED to issue records', 'INVALID_STATE');
  
  const hackName = hackathons[0].name;
  const issuedIds: string[] = [];
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // -- Participant Certificates --
    const { rows: submissions } = await client.query(
      `SELECT s.id, s.title, t.name as team_name,
         (SELECT count(*)::int FROM community_votes cv WHERE cv.submission_id = s.id) as community_votes
       FROM submissions s
       JOIN teams t ON s.team_id = t.id
       WHERE s.hackathon_id = $1`, [hackathonId]
    );
    
    const { rows: evals } = await client.query(
      `SELECT submission_id, total_score FROM evaluations WHERE hackathon_id = $1 AND status = 'SUBMITTED'`, [hackathonId]
    );
    
    for (const sub of submissions) {
      const subEvals = evals.filter(e => e.submission_id === sub.id).map(e => parseFloat(e.total_score));
      let aggregate_score = null;
      if (subEvals.length > 0) {
        aggregate_score = Number((subEvals.reduce((a,b)=>a+b, 0) / subEvals.length).toFixed(4));
      }
      
      const payload = JSON.parse(JSON.stringify({
        record_type: 'PARTICIPANT_CERTIFICATE',
        hackathon_id: hackathonId,
        hackathon_name: hackName,
        submission_id: sub.id,
        team_name: sub.team_name,
        project_title: sub.title,
        aggregate_score,
        community_votes: sub.community_votes,
        issued_at: new Date().toISOString()
      }));
      
      const idempotency_key = `participant:${hackathonId}:${sub.id}`;
      const { signature, kid } = await signPayload(payload);
      
      const res = await client.query(`
        INSERT INTO verifiable_records (type, hackathon_id, submission_id, idempotency_key, payload, signature, kid, issued_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id
      `, ['PARTICIPANT_CERTIFICATE', hackathonId, sub.id, idempotency_key, payload, signature, kid, payload.issued_at]);
      
      if (res.rows.length) issuedIds.push(res.rows[0].id);
    }
    
    // -- Judge Participation Records --
    const { rows: judgeAssignments } = await client.query(`
      SELECT judge_user_id, u.display_name, count(*)::int as total_assignments
      FROM judge_assignments ja
      JOIN users u ON ja.judge_user_id = u.id
      WHERE hackathon_id = $1
      GROUP BY judge_user_id, u.display_name
    `, [hackathonId]);
    
    const { rows: judgeEvals } = await client.query(`
      SELECT judge_user_id, count(*)::int as total_submitted
      FROM evaluations
      WHERE hackathon_id = $1 AND status = 'SUBMITTED'
      GROUP BY judge_user_id
    `, [hackathonId]);
    
    for (const ja of judgeAssignments) {
      const je = judgeEvals.find(e => e.judge_user_id === ja.judge_user_id);
      const total_submitted = je ? je.total_submitted : 0;
      const participation_status = total_submitted >= ja.total_assignments ? 'FULL_PARTICIPATION' : 'PARTIAL_PARTICIPATION';
      
      const payload = JSON.parse(JSON.stringify({
        record_type: 'JUDGE_PARTICIPATION',
        hackathon_id: hackathonId,
        hackathon_name: hackName,
        judge_user_id: ja.judge_user_id,
        judge_name: ja.display_name,
        total_assignments: ja.total_assignments,
        total_submitted,
        participation_status,
        issued_at: new Date().toISOString()
      }));
      
      const idempotency_key = `judge:${hackathonId}:${ja.judge_user_id}`;
      const { signature, kid } = await signPayload(payload);
      
      const res = await client.query(`
        INSERT INTO verifiable_records (type, target_user_id, hackathon_id, idempotency_key, payload, signature, kid, issued_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id
      `, ['JUDGE_PARTICIPATION', ja.judge_user_id, hackathonId, idempotency_key, payload, signature, kid, payload.issued_at]);
      
      if (res.rows.length) issuedIds.push(res.rows[0].id);
    }
    
    const { emitWebhookEvent } = await import('./webhook.service');
      await emitWebhookEvent(client, hackathonId, 'event.records_issued', { records_count: issuedIds.length });
      await client.query('COMMIT');
    return { issued_count: issuedIds.length, record_ids: issuedIds };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
