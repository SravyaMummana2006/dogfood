-- Migration 010: Allow multiple submissions per team
--
-- The official fixture includes a duplicate submission case (tm_07 submitting prj_07 and prj_41)
-- that are independently scored by overlapping judges.
-- To faithfully support this, a single team must be allowed to submit multiple distinct projects.

ALTER TABLE submissions
  DROP CONSTRAINT IF EXISTS fk_submission_team_unique;
