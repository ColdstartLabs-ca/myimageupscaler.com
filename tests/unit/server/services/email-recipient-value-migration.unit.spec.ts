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
    expect(migration).toContain('recipient_value_decision = NULL');
    expect(migration).toContain('recipient_value_run_id = NULL');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.apply_email_recipient_value_run');
  });

  it('keeps unclassified rows eligible and excludes hold/cancel decisions from cron', () => {
    const migration = readMigration('20260712000300_email_recipient_value_due_queue.sql');

    expect(migration).toContain("COALESCE(q.recipient_value_decision, 'keep_medium')");
    expect(migration).toContain("'protected', 'keep_high', 'keep_medium'");
    expect(migration).toContain('q.recipient_value_score DESC NULLS LAST');
    expect(migration).toContain('c.sort_priority DESC NULLS LAST');
  });

  it('should exclude unclassified marketing rows from the due queue', () => {
    const migration = readMigration('20260715000100_restore_lifecycle_delivery_queue.sql');

    expect(migration).toContain("c.email_type = 'marketing'");
    expect(migration).toContain('q.recipient_value_decision IS NOT NULL');
    expect(migration).toContain(
      "q.recipient_value_decision IN ('protected', 'keep_high', 'keep_medium')"
    );
    expect(migration).toContain("q.recipient_value_policy_version = 'v1'");
    expect(migration).not.toContain("COALESCE(q.recipient_value_decision, 'keep_medium')");
  });

  it('keeps the due-queue SQL policy version aligned with the TypeScript policy', () => {
    const migration = readMigration('20260725000100_restore_email_queue_eligibility.sql');
    const policySource = readFileSync(
      join(process.cwd(), 'server/services/email-recipient-value.service.ts'),
      'utf8'
    );
    const policyVersion = policySource.match(/RECIPIENT_VALUE_POLICY_VERSION\s*=\s*'([^']+)'/)?.[1];

    expect(policyVersion).toBeDefined();
    expect(migration).toContain(`q.recipient_value_policy_version = '${policyVersion}'`);
  });

  it('should allow transactional rows without recipient classification', () => {
    const migration = readMigration('20260715000100_restore_lifecycle_delivery_queue.sql');

    expect(migration).toContain("c.email_type = 'transactional'");
    expect(migration).toMatch(
      /c\.email_type = 'transactional'\s+OR \(\s+c\.email_type = 'marketing'/
    );
  });

  it('should exclude disabled and active-claim rows while preserving stale-claim release', () => {
    const migration = readMigration('20260715000100_restore_lifecycle_delivery_queue.sql');

    expect(migration).toContain('c.enabled IS TRUE');
    expect(migration).toContain('q.processing_claim_id IS NULL');
    expect(migration).toContain(
      "q.processing_claimed_at < pg_catalog.now() - INTERVAL '10 minutes'"
    );
  });

  it('should preserve deterministic value ordering and add bounded lookup indexes', () => {
    const migration = readMigration('20260715000100_restore_lifecycle_delivery_queue.sql');

    expect(migration).toContain("WHEN 'keep_high' THEN 1");
    expect(migration).toContain("WHEN 'keep_medium' THEN 2");
    expect(migration).toContain('q.recipient_value_score DESC NULLS LAST');
    expect(migration).toContain('q.scheduled_for ASC');
    expect(migration).toContain('q.id ASC');
    expect(migration).toContain('idx_email_lifecycle_queue_due_claim');
    expect(migration).toContain('idx_email_lifecycle_queue_pending_audit');
    expect(migration).toContain('idx_email_lifecycle_queue_user_sent_history');
    expect(migration).toContain('idx_email_lifecycle_queue_suppression_observation');
    expect(migration).toContain('idx_email_lifecycle_queue_value_due_order');
  });

  it('should atomically enforce suppression idempotency and the 200 per day marketing budget', () => {
    const migration = readMigration('20260715000100_restore_lifecycle_delivery_queue.sql');
    expect(migration).toContain('record_email_lifecycle_suppression');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain("q.created_at >= pg_catalog.now() - INTERVAL '24 hours'");
    expect(migration).toContain('claim_email_lifecycle_queue_row_for_delivery');
    expect(migration).toContain('p_marketing_daily_limit INTEGER DEFAULT 200');
    expect(migration).toContain("RETURN 'capacity_exhausted'");
  });

  it('should aggregate transaction signals per user and provide exact rollback statements', () => {
    const migration = readMigration('20260715000100_restore_lifecycle_delivery_queue.sql');

    expect(migration).toContain('get_email_recipient_value_transaction_signals');
    expect(migration).toContain('GROUP BY t.user_id');
    expect(migration).toContain("pg_catalog.bool_or(t.type = 'purchase')");
    expect(migration).toContain("WHERE t.type = 'usage' AND t.amount < 0");
    expect(migration).toContain(
      'DROP FUNCTION IF EXISTS public.get_email_recipient_value_transaction_signals(UUID[])'
    );
    for (const index of [
      'idx_email_lifecycle_queue_due_claim',
      'idx_email_lifecycle_queue_pending_audit',
      'idx_email_lifecycle_queue_user_sent_history',
      'idx_email_lifecycle_queue_suppression_observation',
      'idx_email_lifecycle_queue_value_due_order',
    ]) {
      expect(migration).toContain(`DROP INDEX IF EXISTS public.${index}`);
    }
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

  it('should bound production performance reporting to sent rows and exact provider messages', () => {
    const migration = readMigration('20260716000100_optimize_recipient_value_performance.sql');

    expect(migration).toContain('q.sent_at >= p_since');
    expect(migration).not.toContain('q.created_at >= p_since');
    expect(migration).toContain("e.metadata ->> 'messageId'");
    expect(migration).toContain("l.provider_response ->> 'messageId' = se.message_id");
    expect(migration).toContain('idx_email_lifecycle_events_type_time_queue');
    expect(migration).toContain('idx_email_logs_failed_message_time');
    expect(migration).toContain('WHERE g.sent_count >= 20');
    expect(migration).not.toContain('pg_catalog.greatest');

    expect(migration).toContain(
      'DROP INDEX IF EXISTS public.idx_email_lifecycle_events_type_time_queue'
    );
    expect(migration).toContain('DROP INDEX IF EXISTS public.idx_email_logs_failed_message_time');
    expect(migration).toContain(
      'DROP INDEX IF EXISTS public.idx_email_lifecycle_queue_sent_report'
    );
    expect(migration).toContain('\\ir 20260712000400_email_recipient_value_performance.sql');
  });
});
