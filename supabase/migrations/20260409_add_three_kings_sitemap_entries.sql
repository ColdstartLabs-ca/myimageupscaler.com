CREATE TABLE three_kings_sitemap_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refresh_run_id UUID NOT NULL,
  url TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT,
  -- GSC metrics
  position REAL NOT NULL,
  impressions INTEGER NOT NULL,
  clicks INTEGER NOT NULL,
  ctr REAL NOT NULL,
  -- Scoring
  opportunity_score REAL NOT NULL,
  position_score REAL NOT NULL,
  impression_score REAL NOT NULL,
  ctr_gap_score REAL NOT NULL,
  query_intent_score REAL NOT NULL,
  -- Metadata
  top_query TEXT,
  source_property TEXT NOT NULL,
  source_range_start DATE NOT NULL,
  source_range_end DATE NOT NULL,
  source_lag_days INTEGER NOT NULL DEFAULT 3,
  last_refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_3kings_refresh_run
  ON three_kings_sitemap_entries (refresh_run_id);

CREATE INDEX idx_3kings_opportunity
  ON three_kings_sitemap_entries (refresh_run_id, opportunity_score DESC);

CREATE INDEX idx_3kings_refreshed
  ON three_kings_sitemap_entries (last_refreshed_at DESC);

ALTER TABLE three_kings_sitemap_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage three_kings_sitemap_entries"
  ON three_kings_sitemap_entries
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON three_kings_sitemap_entries
  TO service_role;
