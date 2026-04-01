/**
 * Variable Credit Costs Per Scale Factor
 *
 * Proves that Clarity Upscaler (hd-upscale tier) charges different credits
 * depending on scale factor, while all other models remain flat.
 *
 * Problem solved: clarity-upscaler 4x costs $0.12 on Replicate (A100 per-second
 * billing) but was only charging 4 credits — same as 2x ($0.012). This caused
 * ~39% margins at 4x on Pro plan instead of the expected ~69%.
 *
 * Fix: MODEL_SCALE_CREDIT_MULTIPLIERS gives clarity-upscaler a 2.0x multiplier
 * at 4x, so hd-upscale tier costs 4 credits at 2x and 8 credits at 4x.
 */

import { describe, it, expect } from 'vitest';
import { MODEL_SCALE_CREDIT_MULTIPLIERS } from '@shared/config/model-costs.config';
import {
  getScaleCreditMultiplier,
  getCreditsForTierAtScale,
  getCreditRangeForTier,
} from '@shared/config/subscription.utils';

// ─── Config layer ───────────────────────────────────────────────────────────

describe('MODEL_SCALE_CREDIT_MULTIPLIERS — only clarity-upscaler is defined', () => {
  it('clarity-upscaler has 1.0x at 2x scale', () => {
    expect(MODEL_SCALE_CREDIT_MULTIPLIERS['clarity-upscaler']?.[2]).toBe(1.0);
  });

  it('clarity-upscaler has 2.0x at 4x scale (core fix)', () => {
    expect(MODEL_SCALE_CREDIT_MULTIPLIERS['clarity-upscaler']?.[4]).toBe(2.0);
  });

  it('real-esrgan has no entry (per-image billing, flat cost)', () => {
    expect(MODEL_SCALE_CREDIT_MULTIPLIERS['real-esrgan']).toBeUndefined();
  });

  it('gfpgan has no entry (T4 per-second but negligible diff)', () => {
    expect(MODEL_SCALE_CREDIT_MULTIPLIERS['gfpgan']).toBeUndefined();
  });

  it('nano-banana-pro has no entry (per-image billing, flat cost)', () => {
    expect(MODEL_SCALE_CREDIT_MULTIPLIERS['nano-banana-pro']).toBeUndefined();
  });

  it('realesrgan-anime has no entry (per-image billing, flat cost)', () => {
    expect(MODEL_SCALE_CREDIT_MULTIPLIERS['realesrgan-anime']).toBeUndefined();
  });
});

// ─── getScaleCreditMultiplier ────────────────────────────────────────────────

describe('getScaleCreditMultiplier', () => {
  describe('clarity-upscaler (A100 per-second, cost varies hugely by scale)', () => {
    it('returns 1.0 at 2x ($0.012 actual cost)', () => {
      expect(getScaleCreditMultiplier('clarity-upscaler', 2)).toBe(1.0);
    });

    it('returns 2.0 at 4x ($0.12 actual cost — 10x more expensive)', () => {
      expect(getScaleCreditMultiplier('clarity-upscaler', 4)).toBe(2.0);
    });

    it('returns 1.0 for unsupported scale (8x not in config)', () => {
      expect(getScaleCreditMultiplier('clarity-upscaler', 8)).toBe(1.0);
    });
  });

  describe('all other models — flat cost regardless of scale', () => {
    const flatModels = ['real-esrgan', 'gfpgan', 'nano-banana-pro', 'realesrgan-anime', 'nano-banana'];

    for (const modelId of flatModels) {
      it(`${modelId}: returns 1.0 at 2x and 4x`, () => {
        expect(getScaleCreditMultiplier(modelId, 2)).toBe(1.0);
        expect(getScaleCreditMultiplier(modelId, 4)).toBe(1.0);
      });
    }

    it('returns 1.0 for unknown models', () => {
      expect(getScaleCreditMultiplier('not-a-real-model', 4)).toBe(1.0);
    });
  });
});

// ─── getCreditsForTierAtScale ────────────────────────────────────────────────

describe('getCreditsForTierAtScale — the main pricing function', () => {
  describe('hd-upscale tier (clarity-upscaler) — THE KEY SCENARIO', () => {
    it('charges 4 credits at 2x (unchanged from before)', () => {
      expect(getCreditsForTierAtScale('hd-upscale', 2)).toBe(4);
    });

    it('charges 8 credits at 4x (was 4, now correctly doubled)', () => {
      expect(getCreditsForTierAtScale('hd-upscale', 4)).toBe(8);
    });

    it('4x costs exactly 2x more than 2x', () => {
      const cost2x = getCreditsForTierAtScale('hd-upscale', 2);
      const cost4x = getCreditsForTierAtScale('hd-upscale', 4);
      expect(cost4x).toBe(cost2x * 2);
    });
  });

  describe('quick tier (real-esrgan, per-image) — no change', () => {
    it('charges 1 credit at 2x', () => {
      expect(getCreditsForTierAtScale('quick', 2)).toBe(1);
    });

    it('charges 1 credit at 4x — same as 2x', () => {
      expect(getCreditsForTierAtScale('quick', 4)).toBe(1);
    });
  });

  describe('face-restore tier (gfpgan, per-second T4) — no change', () => {
    it('charges 2 credits at 2x', () => {
      expect(getCreditsForTierAtScale('face-restore', 2)).toBe(2);
    });

    it('charges 2 credits at 4x — same as 2x (T4 diff is negligible)', () => {
      expect(getCreditsForTierAtScale('face-restore', 4)).toBe(2);
    });
  });

  describe('ultra tier (nano-banana-pro, per-image) — no change', () => {
    it('charges 8 credits at 2x', () => {
      expect(getCreditsForTierAtScale('ultra', 2)).toBe(8);
    });

    it('charges 8 credits at 4x — same as 2x (per-image billing)', () => {
      expect(getCreditsForTierAtScale('ultra', 4)).toBe(8);
    });
  });

  describe('anime-upscale tier (realesrgan-anime, per-image) — no change', () => {
    it('charges 1 credit at 2x', () => {
      expect(getCreditsForTierAtScale('anime-upscale', 2)).toBe(1);
    });

    it('charges 1 credit at 4x — same as 2x', () => {
      expect(getCreditsForTierAtScale('anime-upscale', 4)).toBe(1);
    });
  });

  describe('enhancement-only tiers — scale irrelevant, no multiplier', () => {
    it('face-pro: always 6 credits', () => {
      expect(getCreditsForTierAtScale('face-pro', 2)).toBe(6);
      expect(getCreditsForTierAtScale('face-pro', 4)).toBe(6);
    });

    it('budget-edit: always 3 credits', () => {
      expect(getCreditsForTierAtScale('budget-edit', 2)).toBe(3);
      expect(getCreditsForTierAtScale('budget-edit', 4)).toBe(3);
    });

    it('seedream-edit: always 4 credits', () => {
      expect(getCreditsForTierAtScale('seedream-edit', 2)).toBe(4);
      expect(getCreditsForTierAtScale('seedream-edit', 4)).toBe(4);
    });
  });
});

// ─── getCreditRangeForTier — UI display ──────────────────────────────────────

describe('getCreditRangeForTier — drives ModelCard badge', () => {
  it('returns { min: 4, max: 8 } for hd-upscale (shows "4-8 CR" in UI)', () => {
    expect(getCreditRangeForTier('hd-upscale')).toEqual({ min: 4, max: 8 });
  });

  it('returns flat 1 for quick (shows "1 CR" in UI)', () => {
    expect(getCreditRangeForTier('quick')).toBe(1);
  });

  it('returns flat 2 for face-restore (shows "2 CR" in UI)', () => {
    expect(getCreditRangeForTier('face-restore')).toBe(2);
  });

  it('returns flat 8 for ultra (shows "8 CR" in UI)', () => {
    expect(getCreditRangeForTier('ultra')).toBe(8);
  });

  it('returns flat 6 for face-pro (shows "6 CR" in UI)', () => {
    expect(getCreditRangeForTier('face-pro')).toBe(6);
  });

  it('hd-upscale is the ONLY tier with a range — all others are flat', () => {
    const allTiers = [
      'quick', 'face-restore', 'budget-edit', 'face-pro', 'seedream-edit',
      'fast-edit', 'budget-old-photo', 'anime-upscale', 'ultra',
      'bg-removal', 'lighting-fix', 'resume-photo', 'photo-repair',
    ] as const;

    for (const tier of allTiers) {
      const range = getCreditRangeForTier(tier);
      expect(typeof range, `${tier} should be flat (number), not a range`).toBe('number');
    }

    // Only hd-upscale should return a range
    expect(typeof getCreditRangeForTier('hd-upscale')).toBe('object');
  });
});

// ─── Regression: existing tiers unaffected ───────────────────────────────────

describe('Regression: no unintended credit cost changes', () => {
  const expectedCosts: Array<{ tier: string; scale: 2 | 4; expectedCredits: number }> = [
    { tier: 'quick',        scale: 2, expectedCredits: 1 },
    { tier: 'quick',        scale: 4, expectedCredits: 1 },
    { tier: 'face-restore', scale: 2, expectedCredits: 2 },
    { tier: 'face-restore', scale: 4, expectedCredits: 2 },
    { tier: 'budget-edit',  scale: 2, expectedCredits: 3 },
    { tier: 'fast-edit',    scale: 2, expectedCredits: 2 },
    { tier: 'face-pro',     scale: 2, expectedCredits: 6 },
    { tier: 'ultra',        scale: 2, expectedCredits: 8 },
    { tier: 'ultra',        scale: 4, expectedCredits: 8 },
    { tier: 'anime-upscale', scale: 2, expectedCredits: 1 },
    { tier: 'anime-upscale', scale: 4, expectedCredits: 1 },
    { tier: 'hd-upscale',   scale: 2, expectedCredits: 4 }, // unchanged at 2x
    { tier: 'hd-upscale',   scale: 4, expectedCredits: 8 }, // fixed: was 4, now 8
  ] as const;

  for (const { tier, scale, expectedCredits } of expectedCosts) {
    it(`${tier} @${scale}x = ${expectedCredits} credits`, () => {
      expect(getCreditsForTierAtScale(tier as Parameters<typeof getCreditsForTierAtScale>[0], scale)).toBe(expectedCredits);
    });
  }
});

// ─── Economics proof ─────────────────────────────────────────────────────────

describe('Economics: margins at 4x with correct credit pricing', () => {
  const PRO_PRICE_CENTS = 4900; // $49
  const PRO_CREDITS = 1000;
  const CLARITY_4X_COST_USD = 0.12;

  it('Pro plan: hd-upscale 4x uses 8 credits correctly', () => {
    const creditsPerRun = getCreditsForTierAtScale('hd-upscale', 4);
    expect(creditsPerRun).toBe(8);
  });

  it('Pro plan: credit value exceeds API cost at 4x (margin > 0)', () => {
    const creditsPerRun = getCreditsForTierAtScale('hd-upscale', 4);
    const creditValueUsd = (PRO_PRICE_CENTS / 100 / PRO_CREDITS) * creditsPerRun;
    // Credit value ($0.392) should exceed API cost ($0.12)
    expect(creditValueUsd).toBeGreaterThan(CLARITY_4X_COST_USD);
  });

  it('Pro plan: margin at 4x is roughly 69% (healthy)', () => {
    const creditsPerRun = getCreditsForTierAtScale('hd-upscale', 4);
    const creditValueUsd = (PRO_PRICE_CENTS / 100 / PRO_CREDITS) * creditsPerRun;
    const margin = (creditValueUsd - CLARITY_4X_COST_USD) / creditValueUsd;
    // Should be ~69% margin (was 39% before the fix)
    expect(margin).toBeGreaterThan(0.6);
    expect(margin).toBeLessThan(0.85);
  });

  it('BEFORE fix (flat 4 credits): margin at 4x was dangerously low', () => {
    const creditsBeforeFix = 4; // old flat value
    const creditValueUsd = (PRO_PRICE_CENTS / 100 / PRO_CREDITS) * creditsBeforeFix;
    const margin = (creditValueUsd - CLARITY_4X_COST_USD) / creditValueUsd;
    // Was ~39% — below healthy threshold
    expect(margin).toBeLessThan(0.5);
  });
});
