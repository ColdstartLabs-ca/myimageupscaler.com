/**
 * Engagement Discount Service Tests
 *
 * Tests for the pure functions in the engagement discount service.
 * DB-dependent functions (checkEligibility, offerDiscount, etc.) are
 * tested via integration tests and are excluded here.
 *
 * @see server/services/engagement-discount.service.ts
 */

import { describe, test, expect } from 'vitest';
import { calculateStackedDiscount } from '@server/services/engagement-discount.service';

describe('calculateStackedDiscount', () => {
  test('applies regional discount then engagement discount sequentially', () => {
    const basePriceCents = 1499; // $14.99
    const regionalDiscount = 50; // 50% off
    const engagementDiscount = 20; // 20% off

    const result = calculateStackedDiscount(basePriceCents, regionalDiscount, engagementDiscount);

    // Step 1: 1499 * (1 - 0.5) = 749.5
    // Step 2: 749.5 * (1 - 0.2) = 599.6 → rounds to 600
    expect(result).toBe(600);
  });

  test('with zero regional discount applies only engagement discount', () => {
    const basePriceCents = 1000;
    const result = calculateStackedDiscount(1000, 0, 20);

    // 1000 * 1.0 * 0.8 = 800
    expect(result).toBe(800);
  });

  test('with zero engagement discount applies only regional discount', () => {
    const result = calculateStackedDiscount(1000, 65, 0);

    // 1000 * 0.35 * 1.0 = 350
    expect(result).toBe(350);
  });

  test('with both zero discounts returns original price', () => {
    expect(calculateStackedDiscount(1499, 0, 0)).toBe(1499);
  });

  test('stacked discounts produce less than sum of discounts alone', () => {
    const base = 1000;
    const onlyRegional = calculateStackedDiscount(base, 50, 0);
    const onlyEngagement = calculateStackedDiscount(base, 0, 20);
    const stacked = calculateStackedDiscount(base, 50, 20);

    // Stacked should be MORE than just applying either alone
    expect(stacked).toBeLessThan(onlyRegional);
    expect(stacked).toBeLessThan(onlyEngagement);

    // And more than 70% off (50 + 20)
    const naiveSum = base * (1 - 0.7);
    expect(stacked).toBeGreaterThan(naiveSum);
  });

  test('rounds result to nearest integer', () => {
    // 1499 * 0.65 = 974.35 → regional after 35%: 524.65 → engagement 20%: 419.72 → rounds to 420
    const result = calculateStackedDiscount(1499, 35, 20);
    expect(Number.isInteger(result)).toBe(true);
  });

  test('works with typical India pricing scenario', () => {
    // $14.99 medium pack, India (65% off) + 20% engagement discount
    const basePriceCents = 1499;
    const result = calculateStackedDiscount(basePriceCents, 65, 20);

    // Step 1: 1499 * 0.35 = 524.65
    // Step 2: 524.65 * 0.80 = 419.72 → 420
    expect(result).toBe(420);
  });

  test('handles 100% regional discount', () => {
    // Free after regional = 0, engagement on 0 = 0
    expect(calculateStackedDiscount(1000, 100, 20)).toBe(0);
  });
});
