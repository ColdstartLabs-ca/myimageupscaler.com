import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const pricingPageSource = readFileSync('app/[locale]/pricing/PricingPageClient.tsx', 'utf8');
const experimentMigration = readFileSync(
  'supabase/migrations/20260801000004_seed_insufficient_credits_purchase_path.sql',
  'utf8'
);

describe('payment recovery entry contract', () => {
  it('maps only allowlisted recovery links and preserves a stable funnel attempt', () => {
    expect(pricingPageSource).toContain("recovery === 'checkout-abandoned'");
    expect(pricingPageSource).toContain("recovery === 'credit-wall'");
    expect(pricingPageSource).toContain("recoveryChannel: 'email'");
    expect(pricingPageSource).toContain('funnelAttemptId');
    expect(pricingPageSource).toContain('setCheckoutTrackingContext');
  });

  it('ships the approved arms inactive until the rollout gate is signed off', () => {
    expect(experimentMigration).toContain("'insufficient_credits_purchase_path'");
    expect(experimentMigration).toContain("'current_modal_control'");
    expect(experimentMigration).toContain("'sufficient_pack_focus'");
    expect(experimentMigration).toContain("'direct_sufficient_pack'");
    expect(experimentMigration).toMatch(/'current_modal_control'[\s\S]*?,\s*false\s*\)/);
    expect(experimentMigration).toMatch(/'sufficient_pack_focus'[\s\S]*?,\s*false\s*\)/);
    expect(experimentMigration).toMatch(/'direct_sufficient_pack'[\s\S]*?,\s*false\s*\)/);
  });
});
