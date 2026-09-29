import { getPool } from '../db';
import { PoolClient } from 'pg';
import { NotFoundError, ConflictError, ValidationError, AuthorizationError } from '../errors';

export interface ScoreInput {
  criterion_id: string;
  raw_score: number;
}

export async function saveEvaluation(
  judgeUserId: string,
  submissionId: string,
  scoresInput: ScoreInput[],
  isSubmit: boolean
) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Verify judge assignment and fetch context
    const { rows: assignments } = await client.query(
      `SELECT a.hackathon_id, h.status as hackathon_status, h.policy_id
       FROM judge_assignments a
       JOIN hackathons h ON a.hackathon_id = h.id
       WHERE a.submission_id = $1 AND a.judge_user_id = $2`,
      [submissionId, judgeUserId]
    );

    if (assignments.length === 0) {
      throw new AuthorizationError('You are not assigned to this submission');
    }

    const { hackathon_id, hackathon_status, policy_id } = assignments[0];

    // 2. Verify hackathon is ACTIVE
    if (hackathon_status !== 'ACTIVE') {
      throw new ConflictError('Hackathon is not active. Evaluations cannot be submitted.');
    }
    if (!policy_id) {
      throw new ConflictError('Hackathon does not have a judging policy configured.');
    }

    // 3. Lock evaluation row if it exists (Concurrency protection)
    let evaluationId = null;
    let currentStatus = 'DRAFT';
    const { rows: existingEvals } = await client.query(
      `SELECT id, status FROM evaluations WHERE submission_id = $1 AND judge_user_id = $2 FOR UPDATE`,
      [submissionId, judgeUserId]
    );

    if (existingEvals.length > 0) {
      evaluationId = existingEvals[0].id;
      currentStatus = existingEvals[0].status;
      if (currentStatus === 'SUBMITTED') {
        throw new ConflictError('Evaluation has already been submitted and cannot be changed.');
      }
    }

    // 4. Fetch policy criteria
    const { rows: criteria } = await client.query(
      `SELECT id, min_score, max_score, weight, is_active
       FROM rubric_criteria
       WHERE policy_id = $1 AND is_active = true`,
      [policy_id]
    );

    const criteriaMap = new Map<string, any>();
    criteria.forEach(c => criteriaMap.set(c.id, c));

    // 5. Calculate scores and validate
    let totalScore = 0;
    const processedScores: any[] = [];
    const submittedCriterionIds = new Set<string>();

    for (const input of scoresInput) {
      const criterion = criteriaMap.get(input.criterion_id);
      if (!criterion) {
        throw new ValidationError('Criterion ' + input.criterion_id + ' does not exist or is inactive in the policy.');
      }
      if (input.raw_score < criterion.min_score || input.raw_score > criterion.max_score) {
        throw new ValidationError('Score for criterion ' + input.criterion_id + ' must be between ' + criterion.min_score + ' and ' + criterion.max_score + '.');
      }

      if (submittedCriterionIds.has(input.criterion_id)) {
        throw new ValidationError('Duplicate score submitted for criterion ' + input.criterion_id + '.');
      }
      submittedCriterionIds.add(input.criterion_id);

      // Deterministic Formula:
      // normalized_score = (raw - min) / (max - min)
      // weighted_score = normalized_score * weight
      let normalized = 0;
      if (criterion.max_score > criterion.min_score) {
        normalized = (input.raw_score - criterion.min_score) / (criterion.max_score - criterion.min_score);
      } else {
        normalized = 1; // Fallback if max == min
      }

      const weighted = normalized * criterion.weight;
      totalScore += weighted;

      processedScores.push({
        criterion_id: input.criterion_id,
        raw_score: input.raw_score,
        normalized_score: normalized.toFixed(4),
        weighted_score: weighted.toFixed(4)
      });
    }

    // 6. If submitting, ensure ALL active criteria are scored
    if (isSubmit) {
      if (submittedCriterionIds.size !== criteriaMap.size) {
        throw new ValidationError('Cannot submit incomplete evaluation. All active criteria must be scored.');
      }
    }

    const newStatus = isSubmit ? 'SUBMITTED' : 'DRAFT';

    // 7. Upsert Evaluation
    if (evaluationId) {
      await client.query(
        `UPDATE evaluations SET status = $1, total_score = $2, updated_at = NOW() WHERE id = $3`,
        [newStatus, totalScore.toFixed(4), evaluationId]
      );
    } else {
      const { rows: newEval } = await client.query(
        `INSERT INTO evaluations (hackathon_id, submission_id, judge_user_id, policy_id, status, total_score)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [hackathon_id, submissionId, judgeUserId, policy_id, newStatus, totalScore.toFixed(4)]
      );
      evaluationId = newEval[0].id;
    }

    // 8. Delete old scores and insert new ones
    await client.query('DELETE FROM evaluation_scores WHERE evaluation_id = $1', [evaluationId]);
    
    if (processedScores.length > 0) {
      const insertQueries = processedScores.map(ps => {
        return client.query(
          `INSERT INTO evaluation_scores (evaluation_id, criterion_id, raw_score, normalized_score, weighted_score)
           VALUES ($1, $2, $3, $4, $5)`,
          [evaluationId, ps.criterion_id, ps.raw_score, ps.normalized_score, ps.weighted_score]
        );
      });
      await Promise.all(insertQueries);
    }

    const { recordAudit } = await import('./audit.service');
    const auditAction = isSubmit ? 'EVALUATION_SUBMITTED' : 'EVALUATION_UPDATED';
    await recordAudit(client, judgeUserId, auditAction, 'evaluations', evaluationId!, { total_score: totalScore.toFixed(4) });

    await client.query('COMMIT');
    
    return {
      evaluation_id: evaluationId,
      status: newStatus,
      total_score: totalScore.toFixed(4),
      scores_saved: processedScores.length
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getEvaluation(judgeUserId: string, submissionId: string) {
  // Get assignment & hackathon context
  const { rows: assignments } = await getPool().query(
    `SELECT a.hackathon_id, h.policy_id, h.status as hackathon_status
     FROM judge_assignments a
     JOIN hackathons h ON a.hackathon_id = h.id
     WHERE a.submission_id = $1 AND a.judge_user_id = $2`,
    [submissionId, judgeUserId]
  );

  if (assignments.length === 0) {
    throw new AuthorizationError('You are not assigned to this submission');
  }

  const policyId = assignments[0].policy_id;

  // Get policy and criteria
  const { rows: policies } = await getPool().query(
    'SELECT id, name, description FROM judging_policies WHERE id = $1',
    [policyId]
  );
  
  const { rows: criteria } = await getPool().query(
    'SELECT id, name, description, min_score, max_score, weight FROM rubric_criteria WHERE policy_id = $1 AND is_active = true ORDER BY display_order ASC',
    [policyId]
  );

  // Get evaluation if exists
  const { rows: evals } = await getPool().query(
    'SELECT id, status, total_score FROM evaluations WHERE submission_id = $1 AND judge_user_id = $2',
    [submissionId, judgeUserId]
  );

  let evaluation = null;
  let scores: any[] = [];

  if (evals.length > 0) {
    evaluation = evals[0];
    const { rows: s } = await getPool().query(
      'SELECT criterion_id, raw_score, weighted_score FROM evaluation_scores WHERE evaluation_id = $1',
      [evaluation.id]
    );
    scores = s;
  }

  return {
    hackathon_status: assignments[0].hackathon_status,
    policy: policies[0] || null,
    criteria,
    evaluation,
    scores
  };
}


export async function getHackathonResults(hackathonId: string, actorUserId: string, client?: PoolClient) {
  const db = client || getPool();

  // 1. Verify access (must be organizer/admin)
  const { rows: users } = await db.query('SELECT is_admin FROM users WHERE id = $1', [actorUserId]);
  if (users.length === 0 || !users[0].is_admin) {
    throw new AuthorizationError('Forbidden: Organizer access required to view aggregate results');
  }

  // 2. Validate hackathon exists and get its policy
  const { rows: hackathons } = await db.query(
    'SELECT id, name, status, policy_id FROM hackathons WHERE id = $1',
    [hackathonId]
  );
  
  if (hackathons.length === 0) {
    throw new NotFoundError('Hackathon not found');
  }

  const hackathon = hackathons[0];

  // 3. Fetch all submissions for the hackathon
  const { rows: submissions } = await db.query(
    'SELECT id, title, team_id FROM submissions WHERE hackathon_id = $1 ORDER BY created_at ASC',
    [hackathonId]
  );

  // 4. Fetch all judge assignments for the hackathon to count expected evaluations
  const { rows: assignments } = await db.query(
    'SELECT submission_id, count(*) as total_assignments FROM judge_assignments WHERE hackathon_id = $1 GROUP BY submission_id',
    [hackathonId]
  );
  
  const assignmentsMap = new Map<string, number>();
  assignments.forEach(a => assignmentsMap.set(a.submission_id, parseInt(a.total_assignments, 10)));

  // 5. Fetch all SUBMITTED evaluations for the hackathon
  // Deliberately ignoring DRAFT evaluations per policy
  const { rows: evaluations } = await db.query(
    "SELECT submission_id, total_score FROM evaluations WHERE hackathon_id = $1 AND status = 'SUBMITTED'",
    [hackathonId]
  );

  const evalsBySub = new Map<string, number[]>();
  evaluations.forEach(e => {
    if (!evalsBySub.has(e.submission_id)) {
      evalsBySub.set(e.submission_id, []);
    }
    evalsBySub.get(e.submission_id)!.push(parseFloat(e.total_score));
  });

  // 6. Aggregate deterministically
  const results = submissions.map(sub => {
    const totalAssignments = assignmentsMap.get(sub.id) || 0;
    const subEvals = evalsBySub.get(sub.id) || [];
    const submittedCount = subEvals.length;
    
    let aggregateScore = null;
    let status = 'NO_SCORE';

    if (submittedCount > 0) {
      // Round intermediate sum to avoid floating point drift, though simple addition is usually fine
      const sum = subEvals.reduce((a, b) => a + b, 0);
      aggregateScore = Number((sum / submittedCount).toFixed(4));
      
      if (submittedCount < totalAssignments) {
        status = 'INCOMPLETE';
      } else {
        status = 'COMPLETED';
      }
    } else if (totalAssignments === 0) {
      status = 'UNASSIGNED';
    }

    return {
      submission_id: sub.id,
      title: sub.title,
      team_id: sub.team_id,
      total_assignments: totalAssignments,
      submitted_evaluations: submittedCount,
      missing_evaluations: totalAssignments - submittedCount,
      aggregate_score: aggregateScore,
      status: status
    };
  });

  return {
    hackathon_id: hackathon.id,
    hackathon_name: hackathon.name,
    policy_id: hackathon.policy_id,
    aggregation_method: 'AVERAGE_OF_SUBMITTED',
    precision: '4_DECIMAL_PLACES',
    results
  };
}
