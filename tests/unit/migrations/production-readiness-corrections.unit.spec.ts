import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function migration(name: string): string {
  return readFileSync(join(process.cwd(), `supabase/migrations/${name}`), 'utf8');
}

describe('production-readiness corrective migrations', () => {
  it('scopes lifecycle queue claims and retention suppression', () => {
    const sql = migration('20260711001200_production_readiness_email_retention.sql');
    expect(sql).toContain('claim_email_lifecycle_queue_row');
    expect(sql).toContain('LEFT JOIN public.email_lifecycle_campaigns');
    expect(sql).toContain("e.event_type IN ('offer_shown', 'offer_accepted')");
    expect(sql).toContain('e.subscription_id = NEW.id');
    expect(sql).toContain("interval '90 days'");
    expect(sql).toContain("cohort_variant = 'treatment'");
    expect(sql).not.toContain('WHERE user_id = NEW.user_id AND status = \'pending\'');
  });

  it('keeps active auto top-up settings out of abandoned checkout consent', () => {
    const sql = migration('20260711001300_production_readiness_auto_top_up.sql');
    expect(sql).toContain('auto_top_up_checkout_consents');
    expect(sql).toContain('threshold_credits BETWEEN 1 AND 50');
    expect(sql).toContain('claim_auto_top_up_failure_notification');
    expect(sql).toContain("v_attempt.status <> 'payment_pending'");
  });

  it('treats zero-purchase reward-health days as healthy', () => {
    const sql = migration('20260711001400_production_readiness_reward_health.sql');
    expect(sql).toContain('COALESCE(daily_counts.paid_count, 0) = 0');
    expect(sql).toContain('>= 0.95');
  });

  it('increments bandit counters atomically', () => {
    const sql = migration('20260711001500_production_readiness_bandit_counters.sql');
    expect(sql).toContain('increment_pricing_bandit_arm');
    expect(sql).toContain('impressions = impressions + p_impressions');
    expect(sql).toContain('UPDATE public.pricing_bandit_arms');
  });
});
