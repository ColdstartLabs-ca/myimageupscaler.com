/**
 * SubscriptionCredits Service Tests
 *
 * Tests all credit calculation scenarios for subscription upgrades/downgrades
 */

import { describe, it, expect } from 'vitest';
import { SubscriptionCreditsService } from '../SubscriptionCredits';

// Create service instance for tests
const service = new SubscriptionCreditsService();

describe('SubscriptionCreditsService', () => {
  describe('calculateUpgradeCredits', () => {
    // ========================================================================
    // Scenario 1: Normal Upgrade (User Below Target)
    // ========================================================================
    describe('when user has less than new tier amount', () => {
      it('should add tier difference to preserve user balance', () => {
        const result = service.calculateUpgradeCredits({
          currentBalance: 210,
          previousTierCredits: 200, // Hobby
          newTierCredits: 1000, // Pro
        });

        expect(result.creditsToAdd).toBe(800); // Tier difference
        expect(result.reason).toBe('top_up_to_minimum'); // Because 210 < 1000
        expect(result.isLegitimate).toBe(true);
      });

      it('should work for free user upgrading to hobby', () => {
        const result = service.calculateUpgradeCredits({
          currentBalance: 10, // Free tier initial credits
          previousTierCredits: 10, // Free tier (10 one-time credits)
          newTierCredits: 200, // Hobby
        });

        expect(result.creditsToAdd).toBe(190); // Tier difference: 200 - 10
        expect(result.reason).toBe('top_up_to_minimum');
        expect(result.isLegitimate).toBe(true);
      });

      it('should work for hobby to business upgrade', () => {
        const result = service.calculateUpgradeCredits({
          currentBalance: 150,
          previousTierCredits: 200, // Hobby
          newTierCredits: 5000, // Business
        });

        expect(result.creditsToAdd).toBe(4800); // Tier difference: 5000 - 200
        expect(result.reason).toBe('top_up_to_minimum');
      });
    });

    // ========================================================================
    // Scenario 2: Upgrade with Rollover (User Above Target but Reasonable)
    // ========================================================================
    describe('when user has reasonable excess credits', () => {
      it('should preserve rollover credits by adding tier difference', () => {
        const result = service.calculateUpgradeCredits({
          currentBalance: 300, // 200 + 100 rollover/purchases
          previousTierCredits: 200, // Hobby (max reasonable = 300)
          newTierCredits: 1000, // Pro
        });

        // With simplified logic: always add tier difference
        expect(result.creditsToAdd).toBe(800);
        expect(result.reason).toBe('top_up_to_minimum');
        expect(result.isLegitimate).toBe(true);
        expect(result.maxReasonableBalance).toBe(0); // Not used anymore
      });

      it('should handle Pro user with rollover upgrading to Business', () => {
        const result = service.calculateUpgradeCredits({
          currentBalance: 1400, // 1000 + 400 rollover
          previousTierCredits: 1000, // Pro (max reasonable = 1500)
          newTierCredits: 5000, // Business
        });

        // With simplified logic: always add tier difference
        expect(result.creditsToAdd).toBe(4000);
        expect(result.reason).toBe('top_up_to_minimum');
        expect(result.isLegitimate).toBe(true);
        expect(result.maxReasonableBalance).toBe(0); // Not used anymore
      });
    });

    // ========================================================================
    // Scenario 3: High Balance Users (No More Blocking)
    // ========================================================================
    describe('when user has high existing balance', () => {
      it('should still add tier difference for high-balance users (PRD fix)', () => {
        const result = service.calculateUpgradeCredits({
          currentBalance: 5000, // User downgraded from Business to Hobby, now upgrading back
          previousTierCredits: 200, // Hobby
          newTierCredits: 5000, // Business
        });

        // With simplified logic: always add tier difference
        expect(result.creditsToAdd).toBe(4800); // 5000 - 200
        expect(result.reason).toBe('top_up_to_minimum');
        expect(result.isLegitimate).toBe(true);
        expect(result.maxReasonableBalance).toBe(0); // Not used anymore
      });

      it('should add credits for Hobby user with 1000 credits upgrading to Pro', () => {
        const result = service.calculateUpgradeCredits({
          currentBalance: 1000, // High balance from previous usage
          previousTierCredits: 200, // Hobby
          newTierCredits: 1000, // Pro
        });

        // With simplified logic: always add tier difference
        expect(result.creditsToAdd).toBe(800); // 1000 - 200
        expect(result.reason).toBe('top_up_to_minimum');
        expect(result.isLegitimate).toBe(true);
      });

      it('should handle extreme rollover scenarios', () => {
        const result = service.calculateUpgradeCredits({
          currentBalance: 10000, // Very high balance from purchases and rollover
          previousTierCredits: 1000, // Pro
          newTierCredits: 5000, // Business
        });

        // With simplified logic: still add tier difference
        expect(result.creditsToAdd).toBe(4000); // 5000 - 1000
        expect(result.reason).toBe('top_up_to_minimum');
        expect(result.isLegitimate).toBe(true);
      });
    });

    // ========================================================================
    // Edge Cases
    // ========================================================================
    describe('edge cases', () => {
      it('should handle exact tier match (currentBalance === newTierCredits)', () => {
        const result = service.calculateUpgradeCredits({
          currentBalance: 1000,
          previousTierCredits: 200,
          newTierCredits: 1000,
        });

        // With simplified logic: always add tier difference regardless of balance
        expect(result.creditsToAdd).toBe(800); // 1000 - 200
        expect(result.reason).toBe('top_up_to_minimum');
        expect(result.isLegitimate).toBe(true);
      });

      it('should handle user with zero balance upgrading', () => {
        const result = service.calculateUpgradeCredits({
          currentBalance: 0,
          previousTierCredits: 200,
          newTierCredits: 1000,
        });

        // Always add tier difference
        expect(result.creditsToAdd).toBe(800); // 1000 - 200
        expect(result.reason).toBe('top_up_to_minimum');
        expect(result.isLegitimate).toBe(true);
      });
    });

    // ========================================================================
    // Validation
    // ========================================================================
    describe('input validation', () => {
      it('should reject negative current balance', () => {
        expect(() => {
          service.calculateUpgradeCredits({
            currentBalance: -100,
            previousTierCredits: 200,
            newTierCredits: 1000,
          });
        }).toThrow('Credit amounts cannot be negative');
      });

      it('should reject negative previous tier credits', () => {
        expect(() => {
          service.calculateUpgradeCredits({
            currentBalance: 100,
            previousTierCredits: -200,
            newTierCredits: 1000,
          });
        }).toThrow('Credit amounts cannot be negative');
      });

      it('should reject negative new tier credits', () => {
        expect(() => {
          service.calculateUpgradeCredits({
            currentBalance: 100,
            previousTierCredits: 200,
            newTierCredits: -1000,
          });
        }).toThrow('Credit amounts cannot be negative');
      });

      it('should reject downgrade (newTier < previousTier)', () => {
        expect(() => {
          service.calculateUpgradeCredits({
            currentBalance: 100,
            previousTierCredits: 1000, // Pro
            newTierCredits: 200, // Hobby (downgrade)
          });
        }).toThrow('New tier must have more credits than previous tier');
      });

      it('should reject same tier (newTier === previousTier)', () => {
        expect(() => {
          service.calculateUpgradeCredits({
            currentBalance: 100,
            previousTierCredits: 1000,
            newTierCredits: 1000,
          });
        }).toThrow('New tier must have more credits than previous tier');
      });
    });
  });

  // ========================================================================
  // Downgrade Tests
  // ========================================================================
  describe('calculateDowngradeCredits', () => {
    it('should always return 0 credits for downgrade (user keeps credits)', () => {
      const result = service.calculateDowngradeCredits();

      expect(result.creditsToAdd).toBe(0);
      expect(result.reason).toBe('preserve_legitimate_excess');
      expect(result.isLegitimate).toBe(true);
    });
  });

  // ========================================================================
  // Explanation Tests
  // ========================================================================
  describe('getExplanation', () => {
    it('should explain top-up scenario', () => {
      const result = service.calculateUpgradeCredits({
        currentBalance: 210,
        previousTierCredits: 200,
        newTierCredits: 1000,
      });

      const explanation = service.getExplanation(result, {
        currentBalance: 210,
        previousTierCredits: 200,
        newTierCredits: 1000,
      });

      expect(explanation).toContain('210 credits');
      expect(explanation).toContain('1000');
      expect(explanation).toContain('800'); // Tier difference
      expect(explanation).toContain('1010'); // Final balance
    });

    it('should explain top up with reasonable excess scenario', () => {
      const result = service.calculateUpgradeCredits({
        currentBalance: 1100, // Reasonable excess (within 1000 * 1.5 = 1500)
        previousTierCredits: 1000,
        newTierCredits: 5000,
      });

      const explanation = service.getExplanation(result, {
        currentBalance: 1100,
        previousTierCredits: 1000,
        newTierCredits: 5000,
      });

      expect(explanation).toContain('1100 credits');
      expect(explanation).toContain('upgrade to');
      expect(explanation).toContain('5000'); // New tier amount
      expect(explanation).toContain('4000'); // Tier difference
    });

    it('should explain high balance scenario (PRD fix)', () => {
      const result = service.calculateUpgradeCredits({
        currentBalance: 5000, // High balance user
        previousTierCredits: 200,
        newTierCredits: 5000,
      });

      const explanation = service.getExplanation(result, {
        currentBalance: 5000,
        previousTierCredits: 200,
        newTierCredits: 5000,
      });

      // With simplified logic, high balance users are no longer blocked
      expect(explanation).toContain('5000 credits');
      expect(explanation).toContain('4800'); // tier difference
      expect(explanation).toContain('9800'); // final balance
      expect(explanation).toContain('upgrade to 5000 tier');
    });

    it('should explain downgrade scenario', () => {
      const result = service.calculateDowngradeCredits();

      const explanation = service.getExplanation(result, {
        currentBalance: 1000,
        previousTierCredits: 1000,
        newTierCredits: 200,
      });

      expect(explanation).toContain('Downgrade');
      expect(explanation).toContain('keeps');
      expect(explanation).toContain('1000 credits');
    });
  });
});
