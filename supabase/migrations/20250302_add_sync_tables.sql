-- ============================================================================
-- Stripe x Database Sync System - Database Schema
-- ============================================================================
-- This migration adds tables and columns needed for scheduled synchronization
-- between Stripe and our database.
--
-- Changes:
-- 1. Create sync_runs table for observability
-- 2. Add retry columns to webhook_events table
-- 3. Add indexes for efficient queries
-- 4. Set up RLS policies
-- ============================================================================

-- ============================================================================
-- Create sync_runs table
-- ============================================================================
-- Tracks execution history of scheduled sync jobs (expiration checks,
-- webhook recovery, full reconciliation)

CREATE TABLE IF NOT EXISTS sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL CHECK (job_type IN ('expiration_check', 'webhook_recovery', 'full_reconciliation')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  records_processed INTEGER DEFAULT 0,
  records_fixed INTEGER DEFAULT 0,
  discrepancies_found INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for querying sync history
CREATE INDEX idx_sync_runs_job_type ON sync_runs(job_type);
CREATE INDEX idx_sync_runs_started_at ON sync_runs(started_at DESC);
CREATE INDEX idx_sync_runs_status ON sync_runs(status);

-- ============================================================================
-- Add retry tracking columns to webhook_events
-- ============================================================================
-- These columns enable webhook recovery functionality

ALTER TABLE webhook_events
ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS recoverable BOOLEAN DEFAULT TRUE;

-- Index for finding retryable failed events
CREATE INDEX IF NOT EXISTS idx_webhook_events_retryable
ON webhook_events(status, recoverable, retry_count)
WHERE status = 'failed' AND recoverable = TRUE;

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS on sync_runs (admin/service role only)
ALTER TABLE sync_runs ENABLE ROW LEVEL SECURITY;

-- Service role can manage sync_runs
CREATE POLICY "Service role can manage sync_runs" ON sync_runs
  FOR ALL
  USING (auth.role() = 'service_role');

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE ON sync_runs TO service_role;

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to get recent sync run statistics
CREATE OR REPLACE FUNCTION get_sync_run_stats(
  p_job_type TEXT DEFAULT NULL,
  p_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
  job_type TEXT,
  total_runs BIGINT,
  successful_runs BIGINT,
  failed_runs BIGINT,
  avg_records_processed NUMERIC,
  avg_records_fixed NUMERIC,
  last_run_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sr.job_type,
    COUNT(*) as total_runs,
    COUNT(*) FILTER (WHERE sr.status = 'completed') as successful_runs,
    COUNT(*) FILTER (WHERE sr.status = 'failed') as failed_runs,
    AVG(sr.records_processed) as avg_records_processed,
    AVG(sr.records_fixed) as avg_records_fixed,
    MAX(sr.started_at) as last_run_at
  FROM sync_runs sr
  WHERE
    sr.started_at > NOW() - (p_hours || ' hours')::INTERVAL
    AND (p_job_type IS NULL OR sr.job_type = p_job_type)
  GROUP BY sr.job_type
  ORDER BY sr.job_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get failed webhook events ready for retry
CREATE OR REPLACE FUNCTION get_retryable_webhook_events(
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  event_id TEXT,
  event_type TEXT,
  retry_count INTEGER,
  last_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  error_message TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    we.id,
    we.event_id,
    we.event_type,
    we.retry_count,
    we.last_retry_at,
    we.created_at,
    we.error_message
  FROM webhook_events we
  WHERE
    we.status = 'failed'
    AND we.recoverable = TRUE
    AND we.retry_count < 3
  ORDER BY we.created_at ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Comments for documentation
-- ============================================================================

COMMENT ON TABLE sync_runs IS 'Tracks scheduled synchronization job executions between Stripe and database';
COMMENT ON COLUMN sync_runs.job_type IS 'Type of sync job: expiration_check, webhook_recovery, or full_reconciliation';
COMMENT ON COLUMN sync_runs.metadata IS 'JSON metadata including detailed issues found and actions taken';
COMMENT ON COLUMN webhook_events.retry_count IS 'Number of times recovery has been attempted for failed webhooks';
COMMENT ON COLUMN webhook_events.recoverable IS 'Whether this event can be recovered (false if too old or permanently failed)';
