import { getPool } from '../db';
import { NotFoundError, ConflictError, ValidationError } from '../errors';

export interface Hackathon {
  id: string;
  name: string;
  description: string;
  status: string;
  policy_id: string | null;
  required_judges: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Team {
  id: string;
  hackathon_id: string;
  name: string;
  created_at: string;
}

export interface Submission {
  id: string;
  hackathon_id: string;
  team_id: string;
  title: string;
  created_at: string;
}

export interface JudgeAssignment {
  id: string;
  hackathon_id: string;
  judge_user_id: string;
  submission_id: string;
  created_at: string;
}

export interface JudgeInvitation {
  id: string;
  hackathon_id: string;
  submission_id: string;
  judge_user_id: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  created_at: string;
  updated_at: string;
}


export async function listHackathons(): Promise<Hackathon[]> {
  const { rows } = await getPool().query('SELECT * FROM hackathons ORDER BY created_at DESC');
  return rows;
}

export async function createHackathon(name: string, description: string, userId: string): Promise<Hackathon> {
  const { rows } = await getPool().query(
    `INSERT INTO hackathons (name, description, created_by) VALUES ($1, $2, $3) RETURNING *`,
    [name, description, userId]
  );
  return rows[0];
}

export async function setHackathonPolicy(hackathonId: string, policyId: string, actorUserId: string): Promise<Hackathon> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Check Hackathon status
    const { rows: hackathons } = await client.query(
      'SELECT status FROM hackathons WHERE id = $1 FOR UPDATE',
      [hackathonId]
    );

    if (hackathons.length === 0) throw new NotFoundError('Hackathon not found');
    if (hackathons[0].status !== 'DRAFT') {
      throw new ConflictError('Cannot change policy after hackathon is no longer in DRAFT status');
    }

    // 2. Check Policy status
    const { rows: policies } = await client.query(
      'SELECT status FROM judging_policies WHERE id = $1',
      [policyId]
    );

    if (policies.length === 0) throw new NotFoundError('Policy not found');
    if (policies[0].status !== 'PUBLISHED') {
      throw new ValidationError('Only PUBLISHED policies can be assigned to a hackathon');
    }

    // 3. Update Hackathon
    const { rows: updated } = await client.query(
      'UPDATE hackathons SET policy_id = $1 WHERE id = $2 RETURNING *',
      [policyId, hackathonId]
    );

    const { recordAudit } = await import('./audit.service');
    await recordAudit(client, actorUserId, 'HACKATHON_POLICY_ASSIGNED', 'hackathons', hackathonId, { policy_id: policyId });

    await client.query('COMMIT');
    return updated[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateHackathonStatus(hackathonId: string, status: string, actorUserId: string): Promise<Hackathon> {
  const pool = getPool();
  const client = await pool.connect();
  
  if (!['DRAFT', 'ACTIVE', 'COMPLETED'].includes(status)) {
    throw new ValidationError('Invalid status');
  }

  try {
    await client.query('BEGIN');
    
    const { rows: hackathons } = await client.query(
      'SELECT status, policy_id FROM hackathons WHERE id = $1 FOR UPDATE',
      [hackathonId]
    );

    if (hackathons.length === 0) throw new NotFoundError('Hackathon not found');
    const current = hackathons[0];

    // Cannot activate without a policy
    if (status === 'ACTIVE' && !current.policy_id) {
      throw new ValidationError('Cannot activate a hackathon without a judging policy');
    }

    const { rows: updated } = await client.query(
      'UPDATE hackathons SET status = $1 WHERE id = $2 RETURNING *',
      [status, hackathonId]
    );

    const { recordAudit } = await import('./audit.service');
    await recordAudit(client, actorUserId, `HACKATHON_${status}`, 'hackathons', hackathonId);

    await client.query('COMMIT');
    return updated[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function createTeam(hackathonId: string, name: string): Promise<Team> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO teams (hackathon_id, name) VALUES ($1, $2) RETURNING *`,
      [hackathonId, name]
    );
    const { emitWebhookEvent } = await import('./webhook.service');
    await emitWebhookEvent(client, hackathonId, 'event.team_created', rows[0]);
    await client.query('COMMIT');
    return rows[0];
  } catch (err: any) {
    await client.query('ROLLBACK');
    if (err.code === '23505') { // unique violation
      throw new ConflictError('A team with this name already exists in this hackathon');
    }
    if (err.code === '23503') { // foreign key violation
      throw new NotFoundError('Hackathon not found');
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function createSubmission(hackathonId: string, teamId: string, title: string): Promise<Submission> {
  const pool = getPool();
  
  // Verify cross-hackathon isolation
  const { rows: teams } = await pool.query('SELECT hackathon_id FROM teams WHERE id = $1', [teamId]);
  if (teams.length === 0) throw new NotFoundError('Team not found');
  if (teams[0].hackathon_id !== hackathonId) {
    throw new ValidationError('Team does not belong to the specified hackathon');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO submissions (hackathon_id, team_id, title) VALUES ($1, $2, $3) RETURNING *`,
      [hackathonId, teamId, title]
    );
    const { emitWebhookEvent } = await import('./webhook.service');
    await emitWebhookEvent(client, hackathonId, 'event.submission_created', rows[0]);
    await client.query('COMMIT');
    return rows[0];
  } catch (err: any) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      throw new ConflictError('Team already has a submission');
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function assignJudge(hackathonId: string, submissionId: string, judgeUserId: string, actorUserId: string, injectedClient?: any): Promise<JudgeAssignment> {
  const pool = getPool();
  const client = injectedClient || await pool.connect();
  const ownsTransaction = !injectedClient;

  try {
    if (ownsTransaction) await client.query('BEGIN');

    // Verify submission belongs to hackathon
    const { rows: subs } = await client.query('SELECT hackathon_id FROM submissions WHERE id = $1', [submissionId]);
    if (subs.length === 0) throw new NotFoundError('Submission not found');
    if (subs[0].hackathon_id !== hackathonId) {
      throw new ValidationError('Submission does not belong to the specified hackathon');
    }

    // Verify user exists (foreign key will also catch this, but explicit is better)
    const { rows: users } = await client.query('SELECT id FROM users WHERE id = $1', [judgeUserId]);
    if (users.length === 0) throw new NotFoundError('Judge user not found');

    const { rows } = await client.query(
      `INSERT INTO judge_assignments (hackathon_id, submission_id, judge_user_id) VALUES ($1, $2, $3) RETURNING *`,
      [hackathonId, submissionId, judgeUserId]
    );

    const { recordAudit } = await import('./audit.service');
    await recordAudit(client, actorUserId, 'JUDGE_ASSIGNED', 'judge_assignments', rows[0].id, { judge_user_id: judgeUserId, submission_id: submissionId });

    if (ownsTransaction) await client.query('COMMIT');
    return rows[0];
  } catch (err: any) {
    if (ownsTransaction) await client.query('ROLLBACK');
    if (err.code === '23505') {
      throw new ConflictError('Judge is already assigned to this submission');
    }
    throw err;
  } finally {
    if (ownsTransaction) client.release();
  }
}

export async function getJudgeAssignments(judgeUserId: string): Promise<any[]> {
  const { rows } = await getPool().query(
    `SELECT 
       a.id as assignment_id,
       s.id as submission_id,
       s.title as submission_title,
       t.name as team_name,
       h.name as hackathon_name
     FROM judge_assignments a
     JOIN submissions s ON a.submission_id = s.id
     JOIN teams t ON s.team_id = t.id
     JOIN hackathons h ON a.hackathon_id = h.id
     WHERE a.judge_user_id = $1
     ORDER BY h.created_at DESC, s.title ASC`,
    [judgeUserId]
  );
  return rows;
}


export async function updateHackathonJudgingSettings(hackathonId: string, requiredJudges: number | null, actorUserId: string): Promise<Hackathon> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'UPDATE hackathons SET required_judges = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [requiredJudges, hackathonId]
    );
    if (rows.length === 0) {
      throw new NotFoundError('Hackathon not found');
    }
    const { recordAudit } = await import('./audit.service');
    await recordAudit(client, actorUserId, 'HACKATHON_SETTINGS_UPDATED', 'hackathons', hackathonId, { required_judges: requiredJudges });
    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function createJudgeInvitation(hackathonId: string, submissionId: string, judgeUserId: string, actorUserId: string): Promise<JudgeInvitation> {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Verify submission belongs to hackathon
    const { rows: subs } = await client.query('SELECT hackathon_id FROM submissions WHERE id = $1', [submissionId]);
    if (subs.length === 0) throw new NotFoundError('Submission not found');
    if (subs[0].hackathon_id !== hackathonId) {
      throw new ValidationError('Submission does not belong to the specified hackathon');
    }

    // Verify user exists
    const { rows: users } = await client.query('SELECT id FROM users WHERE id = $1', [judgeUserId]);
    if (users.length === 0) throw new NotFoundError('Judge user not found');
    
    // Check if already assigned
    const { rows: assignments } = await client.query('SELECT id FROM judge_assignments WHERE submission_id = $1 AND judge_user_id = $2', [submissionId, judgeUserId]);
    if (assignments.length > 0) throw new ConflictError('Judge is already assigned to this submission');
    
    // Check if pending invitation exists
    const { rows: existingInvs } = await client.query('SELECT id FROM judge_invitations WHERE hackathon_id = $1 AND submission_id = $2 AND judge_user_id = $3', [hackathonId, submissionId, judgeUserId]);
    if (existingInvs.length > 0) throw new ConflictError('Judge already has an invitation for this submission');

    const { rows } = await client.query(
      `INSERT INTO judge_invitations (hackathon_id, submission_id, judge_user_id, status) VALUES ($1, $2, $3, 'PENDING') RETURNING *`,
      [hackathonId, submissionId, judgeUserId]
    );

    const { recordAudit } = await import('./audit.service');
    await recordAudit(client, actorUserId, 'JUDGE_INVITED', 'judge_invitations', rows[0].id, { judge_user_id: judgeUserId, submission_id: submissionId });

    await client.query('COMMIT');
    return rows[0];
  } catch (err: any) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      throw new ConflictError('Judge already has an invitation for this submission');
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function getJudgeInvitations(judgeUserId: string): Promise<any[]> {
  const { rows } = await getPool().query(
    `SELECT 
       i.id as invitation_id,
       i.status as invitation_status,
       i.created_at,
       s.id as submission_id,
       s.title as submission_title,
       t.name as team_name,
       h.id as hackathon_id,
       h.name as hackathon_name
     FROM judge_invitations i
     JOIN submissions s ON i.submission_id = s.id
     JOIN teams t ON s.team_id = t.id
     JOIN hackathons h ON i.hackathon_id = h.id
     WHERE i.judge_user_id = $1
     ORDER BY i.created_at DESC`,
    [judgeUserId]
  );
  return rows;
}

export async function acceptJudgeInvitation(invitationId: string, judgeUserId: string): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Lock invitation for update
    const { rows: invs } = await client.query('SELECT * FROM judge_invitations WHERE id = $1 FOR UPDATE', [invitationId]);
    if (invs.length === 0) throw new NotFoundError('Invitation not found');
    
    const inv = invs[0];
    if (inv.judge_user_id !== judgeUserId) throw new ConflictError('Cannot accept another judge\'s invitation');
    if (inv.status !== 'PENDING') throw new ConflictError(`Cannot accept invitation that is ${inv.status}`);
    
    // Verify not already assigned
    const { rows: assignments } = await client.query('SELECT id FROM judge_assignments WHERE submission_id = $1 AND judge_user_id = $2', [inv.submission_id, inv.judge_user_id]);
    if (assignments.length > 0) throw new ConflictError('Already assigned to this submission');
    
    // Mark as accepted
    await client.query('UPDATE judge_invitations SET status = $1, updated_at = NOW() WHERE id = $2', ['ACCEPTED', invitationId]);
    
    // Log audit
    const { recordAudit } = await import('./audit.service');
    await recordAudit(client, judgeUserId, 'JUDGE_INVITATION_ACCEPTED', 'judge_invitations', invitationId, { submission_id: inv.submission_id });
    
    // Call assignJudge with injectedClient
    await assignJudge(inv.hackathon_id, inv.submission_id, inv.judge_user_id, judgeUserId, client);
    
    await client.query('COMMIT');
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function declineJudgeInvitation(invitationId: string, judgeUserId: string): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Lock invitation for update
    const { rows: invs } = await client.query('SELECT * FROM judge_invitations WHERE id = $1 FOR UPDATE', [invitationId]);
    if (invs.length === 0) throw new NotFoundError('Invitation not found');
    
    const inv = invs[0];
    if (inv.judge_user_id !== judgeUserId) throw new ConflictError('Cannot decline another judge\'s invitation');
    if (inv.status !== 'PENDING') throw new ConflictError(`Cannot decline invitation that is ${inv.status}`);
    
    // Mark as declined
    await client.query('UPDATE judge_invitations SET status = $1, updated_at = NOW() WHERE id = $2', ['DECLINED', invitationId]);
    
    // Log audit
    const { recordAudit } = await import('./audit.service');
    await recordAudit(client, judgeUserId, 'JUDGE_INVITATION_DECLINED', 'judge_invitations', invitationId, { submission_id: inv.submission_id });
    
    await client.query('COMMIT');
  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
