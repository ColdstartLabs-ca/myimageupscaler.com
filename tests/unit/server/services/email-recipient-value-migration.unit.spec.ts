import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readMigration(name: string): string {
  return readFileSync(join(process.cwd(), 'supabase/migrations', name), 'utf8');
}

describe('recipient-value queue migrations', () => {
  it('adds nullable policy metadata and count-only pruning runs', () => {
    const migration = readMigration('20260712000100_email_recipient_value_classification.sql');

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.email_queue_pruning_runs');
    expect(migration).toContain('candidate_checksum TEXT NOT NULL');
    expect(migration).toContain('summary_by_country JSONB NOT NULL');
    expect(migration).toContain('recipient_value_score INTEGER NULL');
    expect(migration).toContain('recipient_value_reasons JSONB NOT NULL DEFAULT');
    expect(migration).toContain('recipient_value_run_id UUID NULL');
    expect(migration).toContain('idx_email_lifecycle_queue_recipient_value_due');
    expect(migration).toContain('never store recipient PII');
  });

  it('guards apply and rollback with a transaction lock and snapshot checksum', () => {
    const migration = readMigration('20260712000200_email_recipient_value_apply_rpc.sql');

    expect(migration).toContain('pg_try_advisory_xact_lock');
    expect(migration).toContain('Recipient-value queue snapshot changed; refusing mutation');
    expect(migration).toContain("reason = 'recipient_value_pruned'");
    expect(migration).toContain("mode = 'rolled_back'");
    expect(migration).toContain('recipient_value_run_id = p_run_id');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.apply_email_recipient_value_run');
  });

  it('keeps unclassified rows eligible and excludes hold/cancel decisions from cron', () => {
    const migration = readMigration('20260712000300_email_recipient_value_due_queue.sql');

    expect(migration).toContain("COALESCE(q.recipient_value_decision, 'keep_medium')");
    expect(migration).toContain("'protected', 'keep_high', 'keep_medium'");
    expect(migration).toContain('q.recipient_value_score DESC NULLS LAST');
    expect(migration).toContain('c.sort_priority DESC NULLS LAST');
  });

  it('privacy-filters regional performance and exposes Wilson evidence fields', () => {
    const migration = readMigration('20260712000400_email_recipient_value_performance.sql');

    expect(migration).toContain('conversion_ci_lower NUMERIC');
    expect(migration).toContain('conversion_ci_upper NUMERIC');
    expect(migration).toContain('revenue_multiplier NUMERIC');
    expect(migration).toContain('WHERE q.sent_count >= 20');
    expect(migration).toContain("'insufficient_evidence'");
    expect(migration).toContain("INTERVAL '7 days'");
    expect(migration).toContain('public.email_logs');
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.get_email_recipient_value_performance'
    );
  });
});
