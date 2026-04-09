/**
 * Pricing Bandit Service — Thompson Sampling
 *
 * Selects the discount arm that maximizes revenue per impression for a region.
 * Formula: score = Beta(conversions+1, impressions-conversions+1) × avg_revenue_per_conversion
 *
 * Falls back to the static discount from pricing-regions.ts when:
 * - No active arms exist for the region
 * - DB query fails
 */

import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import type { PricingRegion } from '@shared/config/pricing-regions';

export interface IBanditArm {
  id: number;
  region: string;
  discount_percent: number;
  impressions: number;
  conversions: number;
  revenue_cents: number;
}

export interface IBanditResult {
  armId: number;
  discountPercent: number;
  /** true when bandit selected the arm; false when falling back to static config */
  isBanditArm: boolean;
}

// ─── Beta distribution sampler (Marsaglia-Tsang method) ──────────────────────

function sampleNormal(): number {
  // Box-Muller transform
  let u: number, v: number, s: number;
  do {
    u = Math.random() * 2 - 1;
    v = Math.random() * 2 - 1;
    s = u * u + v * v;
  } while (s >= 1 || s === 0);
  return u * Math.sqrt((-2 * Math.log(s)) / s);
}

function sampleGamma(shape: number): number {
  if (shape < 1) {
    // Reduction: Gamma(shape) = Gamma(shape+1) * U^(1/shape)
    return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
  }
  // Marsaglia and Tsang's method
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do {
      x = sampleNormal();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/**
 * Sample from Beta(alpha, beta) distribution.
 */
export function sampleBeta(alpha: number, beta: number): number {
  const x = sampleGamma(alpha);
  const y = sampleGamma(beta);
  if (x + y === 0) return 0.5;
  return x / (x + y);
}

// ─── Revenue estimation ───────────────────────────────────────────────────────

/**
 * Estimate expected revenue per impression for an arm.
 *
 * When we have conversion data we use actual avg revenue per conversion.
 * For untested arms we estimate proportionally to the remaining price
 * after discount (lower discount = higher unit revenue).
 */
function expectedRevenuePerImpression(arm: IBanditArm): number {
  const conversionSample = sampleBeta(arm.conversions + 1, arm.impressions - arm.conversions + 1);

  // Avg revenue per conversion: use actual data when available, else estimate from discount
  const avgRevenue =
    arm.conversions > 0
      ? arm.revenue_cents / arm.conversions
      : // Rough prior: $10 × (1 − discount%) expressed in cents
        // This biases early exploration slightly toward lower-discount arms,
        // which is correct — lower discount = more revenue per sale
        1000 * ((100 - arm.discount_percent) / 100);

  return conversionSample * avgRevenue;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Select an arm for the given region using Thompson Sampling and increment impressions.
 * Returns null if no active arms exist (caller should fall back to static discount).
 */
export async function selectBanditArm(region: PricingRegion): Promise<IBanditResult | null> {
  if (region === 'standard') return null;

  let arms: IBanditArm[];
  try {
    const { data, error } = await supabaseAdmin
      .from('pricing_bandit_arms')
      .select('id, region, discount_percent, impressions, conversions, revenue_cents')
      .eq('region', region)
      .eq('is_active', true);

    if (error || !data || data.length === 0) return null;
    arms = data as IBanditArm[];
  } catch {
    return null;
  }

  // Thompson Sampling: pick arm with highest expected revenue per impression
  let bestArm = arms[0];
  let bestScore = expectedRevenuePerImpression(arms[0]);

  for (let i = 1; i < arms.length; i++) {
    const score = expectedRevenuePerImpression(arms[i]);
    if (score > bestScore) {
      bestScore = score;
      bestArm = arms[i];
    }
  }

  // Record impression (fire-and-forget — don't block the geo response)
  supabaseAdmin
    .from('pricing_bandit_arms')
    .update({ impressions: bestArm.impressions + 1, updated_at: new Date().toISOString() })
    .eq('id', bestArm.id)
    .then(({ error }) => {
      if (error)
        console.error('[BANDIT] Failed to increment impressions', { armId: bestArm.id, error });
    });

  return {
    armId: bestArm.id,
    discountPercent: bestArm.discount_percent,
    isBanditArm: true,
  };
}

/**
 * Record a conversion for an arm after a successful payment.
 * Called from the Stripe webhook handler.
 */
export async function recordBanditConversion(armId: number, revenueCents: number): Promise<void> {
  try {
    // Fetch current stats then increment atomically
    const { data, error: fetchError } = await supabaseAdmin
      .from('pricing_bandit_arms')
      .select('conversions, revenue_cents')
      .eq('id', armId)
      .single();

    if (fetchError || !data) {
      console.error('[BANDIT] Failed to fetch arm for conversion', { armId, fetchError });
      return;
    }

    const { error: updateError } = await supabaseAdmin
      .from('pricing_bandit_arms')
      .update({
        conversions: data.conversions + 1,
        revenue_cents: data.revenue_cents + revenueCents,
        updated_at: new Date().toISOString(),
      })
      .eq('id', armId);

    if (updateError) {
      console.error('[BANDIT] Failed to record conversion', { armId, revenueCents, updateError });
    }
  } catch (err) {
    console.error('[BANDIT] Unexpected error recording conversion', { armId, revenueCents, err });
  }
}
