-- Phase 5C: Deterministic Scoring Engine

CREATE TABLE IF NOT EXISTS evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id UUID NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  judge_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES judging_policies(id),
  status VARCHAR(50) NOT NULL DEFAULT 'DRAFT', -- DRAFT, SUBMITTED
  total_score NUMERIC(7, 4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_eval_judge_sub_unique UNIQUE (submission_id, judge_user_id)
);

CREATE TABLE IF NOT EXISTS evaluation_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id UUID NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  criterion_id UUID NOT NULL REFERENCES rubric_criteria(id),
  raw_score INT NOT NULL,
  normalized_score NUMERIC(5, 4) NOT NULL, -- e.g. 1.0000
  weighted_score NUMERIC(7, 4) NOT NULL, -- e.g. 100.0000
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_eval_crit_unique UNIQUE (evaluation_id, criterion_id)
);

-- Triggers for updated_at
DROP TRIGGER IF EXISTS trg_evaluations_updated_at ON evaluations;
CREATE TRIGGER trg_evaluations_updated_at
  BEFORE UPDATE ON evaluations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_evaluation_scores_updated_at ON evaluation_scores;
CREATE TRIGGER trg_evaluation_scores_updated_at
  BEFORE UPDATE ON evaluation_scores
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
