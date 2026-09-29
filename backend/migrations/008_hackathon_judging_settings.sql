-- Migration: 008_hackathon_judging_settings.sql
ALTER TABLE hackathons
ADD COLUMN required_judges INTEGER DEFAULT NULL;
