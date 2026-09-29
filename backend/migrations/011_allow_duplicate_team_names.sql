-- Migration 011: Allow duplicate team names
--
-- The official fixture contains case-insensitive duplicate team names
-- (e.g. OpenSignal, StillTrail, AmberSwitch) as distinct teams with distinct IDs.
-- This removes the unique name constraint to faithfully support the official data.

DROP INDEX IF EXISTS idx_teams_hackathon_name;
