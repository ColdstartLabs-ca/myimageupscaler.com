import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260725000100_restore_email_queue_eligibility.sql'
  ),
  'utf8'
);

describe('lifecycle queue eligibility restoration migration', () => {
  it('should require guarded backfill and reject future unclassified pending marketing rows', () => {
    expect(migration).toContain('email:queue:audit:prod');
    expect(migration).not.toContain('eligibility_restoration_backfill');
    expect(migration).not.toContain('recipient_value_backfill_expired');
    expect(migration).toContain('enforce_email_lifecycle_marketing_classification');
    expect(migration).toContain('Unclassified pending marketing lifecycle row is forbidden');
    expect(migration).toContain('BEFORE INSERT OR UPDATE');
  });

  it('should scope apply drift detection to the persisted run item set', () => {
    expect(migration).toContain('Recipient-value run item changed; refusing mutation');
    expect(migration).toContain('i.queue_updated_at');
    expect(migration).toContain(
      "i.recipient_value_decision = 'protected' AND i.recipient_value_band <> 'protected'"
    );
    expect(migration).toContain(
      "i.recipient_value_decision = 'keep_high' AND i.recipient_value_band <> 'high'"
    );
    expect(migration).not.toContain('Recipient-value queue snapshot changed; refusing mutation');
    expect(migration).not.toMatch(/FROM public\.email_lifecycle_queue AS q\s+WHERE q\.status = 'pending';/);
  });

  it('should release a deterministic bounded holdout and expose it to the due queue', () => {
    expect(migration).toContain('release_email_recipient_value_holdout');
    expect(migration).toContain('extensions.digest(');
    expect(migration).toContain('pg_catalog.floor(s.stratum_count * 0.1)');
    expect(migration).toContain('LEAST(GREATEST(p_daily_limit, 1), 100)');
    expect(migration).toContain('IF v_released_today > 0 THEN');
    expect(migration).toContain('recipient_value_holdout_released_at');
    expect(migration).toContain('q.recipient_value_holdout_released_at IS NULL');
    expect(migration).toContain('q.recipient_value_holdout_released_at IS NOT NULL');
    expect(migration).toContain("recipient_value_decision = 'hold_experiment'");
  });

  it('should report actionable health counts and fair oldest-first queue ordering', () => {
    expect(migration).toContain('get_email_lifecycle_queue_health');
    for (const metric of [
      'pending_count',
      'overdue_count',
      'eligible_count',
      'held_count',
      'unclassified_count',
    ]) {
      expect(migration).toContain(metric);
    }
    expect(migration).toContain('campaign_position');
    expect(migration).toContain('PARTITION BY q.campaign_key');
    expect(migration).toContain('q.scheduled_for ASC');
    expect(migration).toContain('unsubscribe_rate');
    expect(migration).toContain('provider_block_count > 0');
    expect(migration).toContain("g.unsubscribe_count::NUMERIC / NULLIF(g.sent_count, 0) > 0.03");
    expect(migration).toContain(
      "m.hard_bounce_count::NUMERIC / NULLIF(m.sent_count, 0) > 0.02"
    );
  });

  it('should cancel expired triggers instead of delivering stale backlog rows', () => {
    expect(migration).toContain('cancel_expired_email_lifecycle_queue');
    expect(migration).toContain('stale_checkout_recovery');
    expect(migration).toContain('stale_first_result_followup');
    expect(migration).toContain('stale_lifecycle_trigger');
  });
});
