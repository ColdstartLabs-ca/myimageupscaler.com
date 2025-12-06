/**
 * SubscriptionCredits Service Tests
 *
 * Tests all credit calculation scenarios for subscription upgrades/downgrades
 */

import { describe, it, expect } from 'vitest';
import { SubscriptionCreditsService } from '../SubscriptionCredits';

describe('SubscriptionCreditsService', () => {
  describe('calculateUpgradeCredits', () => {
    // ========================================================================
    // Scenario 1: Normal Upgrade (User Below Target)
    // ========================================================================
    describe('when user has less than new tier amount', () => {
      it('should add tier difference to preserve user balance', () => {
        const result = SubscriptionCreditsService.calculateUpgradeCredits({
          currentBalance: 210,
          previousTierCredits: 200, // Hobby
          newTierCredits: 1000, // Pro
        });

        expect(result.creditsToAdd).toBe(800); // Tier difference
        expect(result.reason).toBe('top_up_to_minimum'); // Because 210 < 1000
        expect(result.isLegitimate).toBe(true);
      });

      it('should work for free user upgrading to hobby', () => {
        const result = SubscriptionCreditsService.calculateUpgradeCredits({
          currentBalance: 10, // Free tier initial credits
          previousTierCredits: 10, // Free tier (10 one-time credits)
          newTierCredits: 200, // Hobby
        });

        expect(result.creditsToAdd).toBe(190); // Tier difference: 200 - 10
        expect(result.reason).toBe('top_up_to_minimum');
        expect(result.isLegitimate).toBe(true);
      });

      it('should work for hobby to business upgrade', () => {
        const result = SubscriptionCreditsService.calculateUpgradeCredits({
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
        const result = SubscriptionCreditsService.calculateUpgradeCredits({
          currentBalance: 300, // 200 + 100 rollover/purchases
          previousTierCredits: 200, // Hobby (max reasonable = 300)
          newTierCredits: 1000, // Pro
        });

        // maxReasonable = 200 * 1.5 = 300
        // currentBalance (300) <= maxReasonable (300)
        // Add tier difference: 1000 - 200 = 800
        expect(result.creditsToAdd).toBe(800);
        expect(result.reason).toBe('top_up_to_minimum'); // 300 < 1000
        expect(result.isLegitimate).toBe(true);
        expect(result.maxReasonableBalance).toBe(300);
      });

      it('should handle Pro user with rollover upgrading to Business', () => {
        const result = SubscriptionCreditsService.calculateUpgradeCredits({
          currentBalance: 1400, // 1000 + 400 rollover
          previousTierCredits: 1000, // Pro (max reasonable = 1500)
          newTierCredits: 5000, // Business
        });

        // maxReasonable = 1000 * 1.5 = 1500
        // currentBalance (1400) <= maxReasonable (1500)
        // Add tier difference: 5000 - 1000 = 4000
        expect(result.creditsToAdd).toBe(4000);
        expect(result.reason).toBe('top_up_to_minimum'); // 1400 < 5000
        expect(result.maxReasonableBalance).toBe(1500);
      });
    });

    // ========================================================================
    // Scenario 3: Farming Attempt (User Has Excessive Credits)
    // ========================================================================
    describe('when farming is detected', () => {
      it('should block credit addition for obvious farming', () => {
        const result = SubscriptionCreditsService.calculateUpgradeCredits({
          currentBalance: 5000, // User downgraded from Business to Hobby
          previousTierCredits: 200, // Hobby (max reasonable = 300)
          newTierCredits: 5000, // Trying to upgrade back to Business
        });

        // maxReasonable = 200 * 1.5 = 300
        // currentBalance (5000) > maxReasonable (300)
        // BLOCKED
        expect(result.creditsToAdd).toBe(0);
        expect(result.reason).toBe('farming_blocked');
        expect(result.isLegitimate).toBe(false);
        expect(result.maxReasonableBalance).toBe(300);
      });

      it('should block Hobby user with 1000 credits trying to upgrade', () => {
        const result = SubscriptionCreditsService.calculateUpgradeCredits({
          currentBalance: 1000, // From Pro downgrade
          previousTierCredits: 200, // Hobby
          newTierCredits: 1000, // Pro
        });

        // maxReasonable = 200 * 1.5 = 300
        // currentBalance (1000) > maxReasonable (300)
        expect(result.creditsToAdd).toBe(0);
        expect(result.reason).toBe('farming_blocked');
      });

      it('should block at the boundary (just over reasonable limit)', () => {
        const result = SubscriptionCreditsService.calculateUpgradeCredits({
          currentBalance: 301, // Just above 300 (200 * 1.5)
          previousTierCredits: 200, // Hobby
          newTierCredits: 1000, // Pro
        });

        expect(result.creditsToAdd).toBe(0);
        expect(result.reason).toBe('farming_blocked');
      });
    });

    // ========================================================================
    // Edge Cases
    // ========================================================================
    describe('edge cases', () => {
      it('should handle exact tier match (currentBalance === newTierCredits)', () => {
        const result = SubscriptionCreditsService.calculateUpgradeCredits({
          currentBalance: 1000,
          previousTierCredits: 200,
          newTierCredits: 1000,
        });

        // User has exactly the new tier amount, within reasonable limits
        // maxReasonable = 200 * 1.5 = 300
        // currentBalance (1000) > maxReasonable (300) → farming
        expect(result.creditsToAdd).toBe(0);
        expect(result.reason).toBe('farming_blocked');
      });

      it('should handle user at exact reasonable limit', () => {
        const result = SubscriptionCreditsService.calculateUpgradeCredits({
          currentBalance: 300, // Exactly 200 * 1.5
          previousTierCredits: 200,
          newTierCredits: 1000,
        });

        // At the boundary, should preserve excess
        expect(result.creditsToAdd).toBe(800); // tier difference
        expect(result.reason).toBe('top_up_to_minimum'); // Because 300 < 1000
      });

      it('should handle zero current balance', () => {
        const result = SubscriptionCreditsService.calculateUpgradeCredits({
          currentBalance: 0,
          previousTierCredits: 200,
          newTierCredits: 1000,
        });

        expect(result.creditsToAdd).toBe(800); // Tier difference
        expect(result.reason).toBe('top_up_to_minimum');
      });
    });

    // ========================================================================
    // Validation
    // ========================================================================
    describe('input validation', () => {
      it('should reject negative current balance', () => {
        expect(() => {
          SubscriptionCreditsService.calculateUpgradeCredits({
            currentBalance: -100,
            previousTierCredits: 200,
            newTierCredits: 1000,
          });
        }).toThrow('Credit amounts cannot be negative');
      });

      it('should reject negative previous tier credits', () => {
        expect(() => {
          SubscriptionCreditsService.calculateUpgradeCredits({
            currentBalance: 100,
            previousTierCredits: -200,
            newTierCredits: 1000,
          });
        }).toThrow('Credit amounts cannot be negative');
      });

      it('should reject negative new tier credits', () => {
        expect(() => {
          SubscriptionCreditsService.calculateUpgradeCredits({
            currentBalance: 100,
            previousTierCredits: 200,
            newTierCredits: -1000,
          });
        }).toThrow('Credit amounts cannot be negative');
      });

      it('should reject downgrade (newTier < previousTier)', () => {
        expect(() => {
          SubscriptionCreditsService.calculateUpgradeCredits({
            currentBalance: 100,
            previousTierCredits: 1000, // Pro
            newTierCredits: 200, // Hobby (downgrade)
          });
        }).toThrow('New tier must have more credits than previous tier');
      });

      it('should reject same tier (newTier === previousTier)', () => {
        expect(() => {
          SubscriptionCreditsService.calculateUpgradeCredits({
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
      const result = SubscriptionCreditsService.calculateDowngradeCredits();

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
      const result = SubscriptionCreditsService.calculateUpgradeCredits({
        currentBalance: 210,
        previousTierCredits: 200,
        newTierCredits: 1000,
      });

      const explanation = SubscriptionCreditsService.getExplanation(result, {
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
      const result = SubscriptionCreditsService.calculateUpgradeCredits({
        currentBalance: 1100, // Reasonable excess (within 1000 * 1.5 = 1500)
        previousTierCredits: 1000,
        newTierCredits: 5000,
      });

      const explanation = SubscriptionCreditsService.getExplanation(result, {
        currentBalance: 1100,
        previousTierCredits: 1000,
        newTierCredits: 5000,
      });

      expect(explanation).toContain('1100 credits');
      expect(explanation).toContain('below new tier');
      expect(explanation).toContain('5000'); // New tier amount
      expect(explanation).toContain('4000'); // Tier difference
    });

    it('should explain farming block scenario', () => {
      const result = SubscriptionCreditsService.calculateUpgradeCredits({
        currentBalance: 5000,
        previousTierCredits: 200,
        newTierCredits: 5000,
      });

      const explanation = SubscriptionCreditsService.getExplanation(result, {
        currentBalance: 5000,
        previousTierCredits: 200,
        newTierCredits: 5000,
      });

      expect(explanation).toContain('Farming detected');
      expect(explanation).toContain('5000 credits');
      expect(explanation).toContain('300'); // maxReasonable
      expect(explanation).toContain('Blocking');
    });

    it('should explain downgrade scenario', () => {
      const result = SubscriptionCreditsService.calculateDowngradeCredits();

      const explanation = SubscriptionCreditsService.getExplanation(result, {
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
