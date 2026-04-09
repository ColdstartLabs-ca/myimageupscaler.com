-- Pricing Bandit Arms
-- Multi-armed bandit for auto-optimizing regional discount levels.
-- Thompson Sampling selects arms per region in /api/geo.
-- Conversions + revenue updated by Stripe webhook on checkout.session.completed.

CREATE TABLE IF NOT EXISTS pricing_bandit_arms (
  id SERIAL PRIMARY KEY,
  region TEXT NOT NULL,
  discount_percent INTEGER NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  revenue_cents INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (region, discount_percent)
);

-- RLS: Only service role can write; no public access
ALTER TABLE pricing_bandit_arms ENABLE ROW LEVEL SECURITY;

-- No public SELECT — this is internal pricing intelligence
-- Service role bypasses RLS automatically

CREATE INDEX IF NOT EXISTS idx_pricing_bandit_arms_region ON pricing_bandit_arms (region) WHERE is_active = true;

-- Seed arms per region based on PRD "Arms to Test" table
-- LATAM: has some conversions at 50%, explore around it
INSERT INTO pricing_bandit_arms (region, discount_percent) VALUES
  ('latam', 35),
  ('latam', 45),
  ('latam', 55),
  ('latam', 65)
ON CONFLICT (region, discount_percent) DO NOTHING;

-- Eastern Europe: has some conversions at 40%, explore around it
INSERT INTO pricing_bandit_arms (region, discount_percent) VALUES
  ('eastern_europe', 25),
  ('eastern_europe', 35),
  ('eastern_europe', 45),
  ('eastern_europe', 55)
ON CONFLICT (region, discount_percent) DO NOTHING;

-- South Asia: zero conversions despite 65%, needs wider exploration
INSERT INTO pricing_bandit_arms (region, discount_percent) VALUES
  ('south_asia', 50),
  ('south_asia', 65),
  ('south_asia', 75),
  ('south_asia', 80)
ON CONFLICT (region, discount_percent) DO NOTHING;

-- Southeast Asia: zero conversions
INSERT INTO pricing_bandit_arms (region, discount_percent) VALUES
  ('southeast_asia', 45),
  ('southeast_asia', 60),
  ('southeast_asia', 70),
  ('southeast_asia', 80)
ON CONFLICT (region, discount_percent) DO NOTHING;

-- Africa: zero conversions
INSERT INTO pricing_bandit_arms (region, discount_percent) VALUES
  ('africa', 50),
  ('africa', 65),
  ('africa', 75),
  ('africa', 80)
ON CONFLICT (region, discount_percent) DO NOTHING;
