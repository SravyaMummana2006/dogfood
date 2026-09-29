CREATE TABLE IF NOT EXISTS server_signing_keys (
  kid VARCHAR(255) PRIMARY KEY,
  public_key TEXT NOT NULL,
  encrypted_private_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retired_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS verifiable_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(50) NOT NULL,
  target_user_id UUID,
  hackathon_id UUID NOT NULL,
  submission_id UUID,
  idempotency_key VARCHAR(255) UNIQUE NOT NULL,
  payload JSONB NOT NULL,
  signature TEXT NOT NULL,
  kid VARCHAR(255) NOT NULL REFERENCES server_signing_keys(kid),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
