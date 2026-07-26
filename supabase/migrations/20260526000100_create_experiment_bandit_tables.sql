CREATE TABLE IF NOT EXISTS experiment_arms (
  id BIGSERIAL PRIMARY KEY,
  experiment_key TEXT NOT NULL,
  context_key TEXT NOT NULL DEFAULT 'global',
  arm_key TEXT NOT NULL,
  arm_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  impressions INTEGER NOT NULL DEFAULT 0,
  rewards INTEGER NOT NULL DEFAULT 0,
  revenue_cents INTEGER NOT NULL DEFAULT 0,
  guardrail_failures INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (experiment_key, context_key, arm_key)
);

CREATE TABLE IF NOT EXISTS experiment_assignments (
  id BIGSERIAL PRIMARY KEY,
  experiment_key TEXT NOT NULL,
  context_key TEXT NOT NULL,
  arm_id BIGINT NOT NULL REFERENCES experiment_arms(id),
  assignment_key TEXT NOT NULL,
  surface TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (experiment_key, context_key, assignment_key)
);

CREATE TABLE IF NOT EXISTS experiment_rewards (
  id BIGSERIAL PRIMARY KEY,
  experiment_key TEXT NOT NULL,
  context_key TEXT NOT NULL,
  arm_id BIGINT NOT NULL REFERENCES experiment_arms(id),
  assignment_key TEXT,
  reward_type TEXT NOT NULL,
  reward_value INTEGER NOT NULL DEFAULT 1,
  revenue_cents INTEGER NOT NULL DEFAULT 0,
  source_event TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  rewarded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE experiment_arms ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiment_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiment_rewards ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_experiment_arms_active
  ON experiment_arms (experiment_key, context_key)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_experiment_rewards_arm
  ON experiment_rewards (arm_id, rewarded_at);
