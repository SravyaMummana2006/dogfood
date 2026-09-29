import { getPool } from '../db';
import { PoolClient } from 'pg';
import { AppError, ValidationError } from '../errors';
import { getHackathonResults } from './scoring.service';

export async function exportEvent(hackathonId: string, organizerId: string) {
  const pool = getPool();
  
  // Verify organizer
  const { rows: users } = await pool.query('SELECT is_admin FROM users WHERE id = $1', [organizerId]);
  if (!users.length || !users[0].is_admin) throw new AppError(403, 'Organizer access required', 'FORBIDDEN');

  const { rows: hackathons } = await pool.query('SELECT * FROM hackathons WHERE id = $1', [hackathonId]);
  if (!hackathons.length) throw new AppError(404, 'Hackathon not found', 'NOT_FOUND');
  
  const hackathon = hackathons[0];

  const { rows: policies } = await pool.query('SELECT * FROM judging_policies WHERE id = $1', [hackathon.policy_id]);
  const { rows: criteria } = await pool.query('SELECT * FROM rubric_criteria WHERE policy_id = $1', [hackathon.policy_id]);
  
  const { rows: teams } = await pool.query('SELECT * FROM teams WHERE hackathon_id = $1', [hackathonId]);
  const teamIds = teams.map(t => t.id);
  
  let teamMembers: any[] = [];
  if (teamIds.length > 0) {
    const { rows: tm } = await pool.query(`SELECT * FROM team_members WHERE team_id = ANY($1)`, [teamIds]);
    teamMembers = tm;
  }
  
  const { rows: submissions } = await pool.query('SELECT * FROM submissions WHERE hackathon_id = $1', [hackathonId]);
  const { rows: assignments } = await pool.query('SELECT * FROM judge_assignments WHERE hackathon_id = $1', [hackathonId]);
  const { rows: evaluations } = await pool.query('SELECT * FROM evaluations WHERE hackathon_id = $1', [hackathonId]);
  const { rows: criterionScores } = await pool.query(
    'SELECT * FROM evaluation_scores WHERE evaluation_id IN (SELECT id FROM evaluations WHERE hackathon_id = $1)',
    [hackathonId]
  );
  
  // Extract user emails
  const userIds = new Set<string>();
  teamMembers.forEach(tm => userIds.add(tm.user_id));
  assignments.forEach(a => userIds.add(a.judge_user_id));
  evaluations.forEach(e => userIds.add(e.judge_user_id));
  
  let exportUsers: any[] = [];
  if (userIds.size > 0) {
    const { rows: u } = await pool.query('SELECT id, email, display_name FROM users WHERE id = ANY($1)', [Array.from(userIds)]);
    exportUsers = u;
  }

  return {
    manifest: {
      format_version: '1.0',
      export_timestamp: new Date().toISOString(),
      source_server: 'dogfood',
      entities_count: {
        teams: teams.length,
        submissions: submissions.length,
        evaluations: evaluations.length
      }
    },
    hackathon: {
      id: hackathon.id,
      name: hackathon.name,
      status: hackathon.status,
      submissions_close: hackathon.submissions_close,
      policy_id: hackathon.policy_id
    },
    policies,
    criteria,
    users: exportUsers,
    teams,
    team_members: teamMembers,
    submissions,
    judge_assignments: assignments,
    evaluations,
    criterion_scores: criterionScores
  };
}

export async function importEvent(artifact: any, organizerId: string) {
  const pool = getPool();
  const { rows: u } = await pool.query('SELECT is_admin FROM users WHERE id = $1', [organizerId]);
  if (!u.length || !u[0].is_admin) throw new AppError(403, 'Organizer access required', 'FORBIDDEN');

  // Validate artifact
  if (!artifact.manifest || !artifact.hackathon || !artifact.teams) {
    throw new AppError(400, 'Invalid migration artifact', 'VALIDATION_ERROR');
  }

  if (!artifact.users || !Array.isArray(artifact.users) || artifact.users.length === 0) {
    throw new AppError(422, 'Missing users section in migration artifact', 'VALIDATION_ERROR');
  }

  // Security checks: no passwords, etc.
  if (artifact.users.some((usr: any) => usr.password_hash || usr.encrypted_private_key)) {
    throw new AppError(400, 'Artifact contains restricted security material', 'SECURITY_ERROR');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Resolve User Identities by Email
    const missingEmails: string[] = [];
    const userIdMap: Record<string, string> = {}; // source_user_id -> target_user_id
    
    for (const sourceUser of artifact.users) {
      const { rows } = await client.query('SELECT id FROM users WHERE email = $1', [sourceUser.email]);
      if (rows.length === 0) {
        missingEmails.push(sourceUser.email);
      } else {
        userIdMap[sourceUser.id] = rows[0].id;
      }
    }
    
    if (missingEmails.length > 0) {
      throw new ValidationError('Missing users. Please invite them first.', { missing_emails: missingEmails });
    }

    // 2. Generate target_hackathon_id and map it
    const { rows: newHackathon } = await client.query('SELECT gen_random_uuid() as id');
    const targetHackathonId = newHackathon[0].id;

    // 3. Insert Policies & Criteria
    // We attempt to insert with their source UUIDs. If they exist, ON CONFLICT DO NOTHING.
    // This allows sharing rubric definitions.
    for (const p of artifact.policies) {
      await client.query(`
        INSERT INTO judging_policies (id, name, description, status, version, created_by, created_at, updated_at) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
        ON CONFLICT (id) DO NOTHING
      `, [p.id, p.name, p.description || '', p.status, p.version || 1, organizerId, p.created_at, p.updated_at]);
    }
    
    for (const c of artifact.criteria) {
      await client.query(`
        INSERT INTO rubric_criteria (id, policy_id, name, description, weight, min_score, max_score, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO NOTHING
      `, [c.id, c.policy_id, c.name, c.description, c.weight, c.min_score, c.max_score, c.created_at]);
    }

    // 4. Insert Hackathon
    await client.query(`
      INSERT INTO hackathons (id, name, status, submissions_close, policy_id, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [targetHackathonId, artifact.hackathon.name, artifact.hackathon.status, artifact.hackathon.submissions_close, artifact.hackathon.policy_id, organizerId]);

    // Mappings for internal entities to prevent PK collisions on same-server clone
    const teamIdMap: Record<string, string> = {};
    const subIdMap: Record<string, string> = {};
    const evalIdMap: Record<string, string> = {};

    // 5. Insert Teams
    for (const t of artifact.teams) {
      const { rows } = await client.query('SELECT gen_random_uuid() as id');
      teamIdMap[t.id] = rows[0].id;
      await client.query(`
        INSERT INTO teams (id, hackathon_id, name, created_at)
        VALUES ($1, $2, $3, $4)
      `, [teamIdMap[t.id], targetHackathonId, t.name, t.created_at]);
    }

    // 6. Insert Team Members
    for (const tm of artifact.team_members) {
      await client.query(`
        INSERT INTO team_members (team_id, user_id, created_at)
        VALUES ($1, $2, $3)
      `, [teamIdMap[tm.team_id], userIdMap[tm.user_id], tm.created_at]);
    }

    // 7. Insert Submissions
    for (const s of artifact.submissions) {
      const { rows } = await client.query('SELECT gen_random_uuid() as id');
      subIdMap[s.id] = rows[0].id;
      await client.query(`
        INSERT INTO submissions (id, hackathon_id, team_id, title, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [subIdMap[s.id], targetHackathonId, teamIdMap[s.team_id], s.title, s.created_at, s.updated_at]);
    }

    // 8. Insert Judge Assignments
    for (const a of artifact.judge_assignments) {
      await client.query(`
        INSERT INTO judge_assignments (submission_id, judge_user_id, hackathon_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5)
      `, [subIdMap[a.submission_id], userIdMap[a.judge_user_id], targetHackathonId, a.created_at, a.updated_at]);
    }

    // 9. Insert Evaluations and Criterion Scores
    for (const e of artifact.evaluations) {
      const { rows } = await client.query('SELECT gen_random_uuid() as id');
      evalIdMap[e.id] = rows[0].id;
      await client.query(`
        INSERT INTO evaluations (id, hackathon_id, submission_id, judge_user_id, policy_id, total_score, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [evalIdMap[e.id], targetHackathonId, subIdMap[e.submission_id], userIdMap[e.judge_user_id], e.policy_id, e.total_score, e.status, e.created_at, e.updated_at]);
    }

    for (const cs of artifact.criterion_scores) {
      await client.query(`
        INSERT INTO evaluation_scores (evaluation_id, criterion_id, raw_score, normalized_score, weighted_score)
        VALUES ($1, $2, $3, $4, $5)
      `, [evalIdMap[cs.evaluation_id], cs.criterion_id, cs.raw_score, cs.normalized_score, cs.weighted_score]);
    }

    // 10. Recompute Aggregates as Proof
    await getHackathonResults(targetHackathonId, organizerId, client);

    const { emitWebhookEvent } = await import('./webhook.service');
    await emitWebhookEvent(client, targetHackathonId, 'event.imported', { source_id: artifact.hackathon.id });
    await client.query('COMMIT');
    return { target_hackathon_id: targetHackathonId };
    } catch (error: any) {
      await client.query('ROLLBACK');
      if (error.code && typeof error.code === 'string' && (error.code.startsWith('23') || error.code.startsWith('22'))) {
        throw new AppError(400, `Structural validation failed: ${error.message}`, 'STRUCTURAL_ERROR');
      }
      throw error;
  } finally {
    client.release();
  }
}
