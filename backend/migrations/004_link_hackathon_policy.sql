-- Phase 5B.1: Judging Context Integrity

ALTER TABLE hackathons 
ADD COLUMN policy_id UUID REFERENCES judging_policies(id);
