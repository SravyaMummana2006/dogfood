-- Phase 5A: Judging Policies Foundation

CREATE TABLE IF NOT EXISTS judging_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status VARCHAR(50) NOT NULL DEFAULT 'DRAFT', -- DRAFT, PUBLISHED, LOCKED, ARCHIVED
  version INT NOT NULL DEFAULT 1,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  locked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS rubric_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES judging_policies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  min_score INT NOT NULL,
  max_score INT NOT NULL,
  weight INT NOT NULL, -- Percentage (0-100)
  display_order INT NOT NULL DEFAULT 0,
  is_required BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent duplicate criteria names within the same policy (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_rubric_criteria_policy_name 
ON rubric_criteria (policy_id, LOWER(name));

-- Triggers for updated_at
DROP TRIGGER IF EXISTS trg_judging_policies_updated_at ON judging_policies;
CREATE TRIGGER trg_judging_policies_updated_at
  BEFORE UPDATE ON judging_policies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_rubric_criteria_updated_at ON rubric_criteria;
CREATE TRIGGER trg_rubric_criteria_updated_at
  BEFORE UPDATE ON rubric_criteria
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
