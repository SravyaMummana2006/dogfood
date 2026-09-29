CREATE TABLE community_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hackathon_id UUID NOT NULL REFERENCES hackathons(id) ON DELETE CASCADE,
    submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Prevent duplicate votes by the same user for the same submission
CREATE UNIQUE INDEX idx_community_votes_unique
ON community_votes (submission_id, user_id);

CREATE INDEX idx_community_votes_submission
ON community_votes (submission_id);

CREATE INDEX idx_community_votes_hackathon
ON community_votes (hackathon_id);
