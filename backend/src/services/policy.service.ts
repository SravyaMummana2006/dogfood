import { getPool } from '../db';
import { NotFoundError, ConflictError, ValidationError } from '../errors';

export interface JudgingPolicy {
  id: string;
  name: string;
  description: string;
  status: string;
  version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  locked_at: string | null;
}

export interface RubricCriterion {
  id: string;
  policy_id: string;
  name: string;
  description: string;
  min_score: number;
  max_score: number;
  weight: number;
  display_order: number;
  is_required: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PolicyWithCriteria extends JudgingPolicy {
  criteria: RubricCriterion[];
}

export async function createPolicy(
  name: string,
  description: string,
  userId: string
): Promise<JudgingPolicy> {
  const { rows } = await getPool().query(
    `INSERT INTO judging_policies (name, description, created_by)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [name, description, userId]
  );
  return rows[0];
}

export async function getPolicies(): Promise<JudgingPolicy[]> {
  const { rows } = await getPool().query(
    'SELECT * FROM judging_policies ORDER BY created_at DESC'
  );
  return rows;
}

export async function getPolicy(id: string): Promise<PolicyWithCriteria> {
  const { rows: policies } = await getPool().query(
    'SELECT * FROM judging_policies WHERE id = $1',
    [id]
  );

  if (policies.length === 0) {
    throw new NotFoundError('Policy not found');
  }

  const { rows: criteria } = await getPool().query(
    'SELECT * FROM rubric_criteria WHERE policy_id = $1 ORDER BY display_order ASC, created_at ASC',
    [id]
  );

  return {
    ...policies[0],
    criteria,
  };
}

export async function addCriterion(
  policyId: string,
  data: {
    name: string;
    description: string;
    min_score: number;
    max_score: number;
    weight: number;
    display_order: number;
  }
): Promise<RubricCriterion> {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Check policy status with FOR UPDATE to prevent concurrent modifications/publishing
    const { rows: policies } = await client.query(
      'SELECT status FROM judging_policies WHERE id = $1 FOR UPDATE',
      [policyId]
    );

    if (policies.length === 0) {
      throw new NotFoundError('Policy not found');
    }

    if (policies[0].status !== 'DRAFT') {
      throw new ConflictError('Cannot modify a non-draft policy');
    }

    // Check duplicate name
    const { rows: existing } = await client.query(
      'SELECT id FROM rubric_criteria WHERE policy_id = $1 AND LOWER(name) = LOWER($2)',
      [policyId, data.name]
    );

    if (existing.length > 0) {
      throw new ConflictError('A criterion with this name already exists in the policy');
    }

    const { rows: criteria } = await client.query(
      `INSERT INTO rubric_criteria (policy_id, name, description, min_score, max_score, weight, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [policyId, data.name, data.description || '', data.min_score, data.max_score, data.weight, data.display_order || 0]
    );

    await client.query('COMMIT');
    return criteria[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateCriterion(
  policyId: string,
  criterionId: string,
  data: {
    name: string;
    description: string;
    min_score: number;
    max_score: number;
    weight: number;
    display_order: number;
  }
): Promise<RubricCriterion> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    
    const { rows: policies } = await client.query(
      'SELECT status FROM judging_policies WHERE id = $1 FOR UPDATE',
      [policyId]
    );

    if (policies.length === 0) {
      throw new NotFoundError('Policy not found');
    }

    if (policies[0].status !== 'DRAFT') {
      throw new ConflictError('Cannot modify a non-draft policy');
    }

    // Ensure criterion exists and belongs to the policy
    const { rows: existingCriterion } = await client.query(
      'SELECT id, name FROM rubric_criteria WHERE id = $1 AND policy_id = $2',
      [criterionId, policyId]
    );

    if (existingCriterion.length === 0) {
      throw new NotFoundError('Criterion not found in this policy');
    }

    // Check duplicate name if name changed
    if (existingCriterion[0].name.toLowerCase() !== data.name.toLowerCase()) {
      const { rows: duplicates } = await client.query(
        'SELECT id FROM rubric_criteria WHERE policy_id = $1 AND LOWER(name) = LOWER($2)',
        [policyId, data.name]
      );
      if (duplicates.length > 0) {
        throw new ConflictError('A criterion with this name already exists in the policy');
      }
    }

    const { rows: criteria } = await client.query(
      `UPDATE rubric_criteria 
       SET name = $1, description = $2, min_score = $3, max_score = $4, weight = $5, display_order = $6
       WHERE id = $7 AND policy_id = $8
       RETURNING *`,
      [data.name, data.description || '', data.min_score, data.max_score, data.weight, data.display_order || 0, criterionId, policyId]
    );

    await client.query('COMMIT');
    return criteria[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteCriterion(policyId: string, criterionId: string): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    
    const { rows: policies } = await client.query(
      'SELECT status FROM judging_policies WHERE id = $1 FOR UPDATE',
      [policyId]
    );

    if (policies.length === 0) {
      throw new NotFoundError('Policy not found');
    }

    if (policies[0].status !== 'DRAFT') {
      throw new ConflictError('Cannot modify a non-draft policy');
    }
    
    // Ensure it belongs to the policy before deleting
    const { rowCount } = await client.query(
      'DELETE FROM rubric_criteria WHERE id = $1 AND policy_id = $2',
      [criterionId, policyId]
    );

    if (rowCount === 0) {
      throw new NotFoundError('Criterion not found in this policy');
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function publishPolicy(policyId: string, actorUserId: string): Promise<JudgingPolicy> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    
    const { rows: policies } = await client.query(
      'SELECT * FROM judging_policies WHERE id = $1 FOR UPDATE',
      [policyId]
    );

    if (policies.length === 0) {
      throw new NotFoundError('Policy not found');
    }

    if (policies[0].status !== 'DRAFT') {
      throw new ConflictError('Only DRAFT policies can be published');
    }

    const { rows: criteria } = await client.query(
      'SELECT weight FROM rubric_criteria WHERE policy_id = $1 AND is_active = true',
      [policyId]
    );

    if (criteria.length === 0) {
      throw new ValidationError('Cannot publish a policy without active criteria');
    }

    const totalWeight = criteria.reduce((sum: number, c: { weight: number }) => sum + c.weight, 0);
    if (totalWeight !== 100) {
      throw new ValidationError(`Total weight must equal 100. Current total is ${totalWeight}.`);
    }

    const { rows: updatedPolicies } = await client.query(
      `UPDATE judging_policies 
       SET status = 'PUBLISHED', published_at = NOW() 
       WHERE id = $1 
       RETURNING *`,
      [policyId]
    );

    // Record Audit
    const { recordAudit } = await import('./audit.service');
    await recordAudit(client, actorUserId, 'POLICY_PUBLISHED', 'judging_policies', policyId);

    await client.query('COMMIT');
    return updatedPolicies[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
