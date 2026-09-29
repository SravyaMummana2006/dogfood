-- Migration 009: Add submissions_close deadline to hackathons
--
-- This column stores the DOGFOOD event submission deadline as required by
-- the official spec.md and fixtures. It is nullable because:
--   1. Existing hackathon rows must not be broken by this migration.
--   2. Organizers may leave the deadline unset for DRAFT hackathons.
--   3. Enforcement logic (rejecting late submissions) happens at the
--      application layer and can only trigger when the value is non-null.
--
-- No default is supplied deliberately: a NULL value means "deadline not
-- configured yet" rather than a silent future or past deadline.
-- This matches the Phase 5F convention for unconfigured settings.

ALTER TABLE hackathons
  ADD COLUMN IF NOT EXISTS submissions_close TIMESTAMPTZ DEFAULT NULL;
