import type { ICreditCalculationInput, ICreditCalculationResult } from '../services/SubscriptionCredits';

/**
 * Subscription credits service interface
 * Handles credit calculation logic for subscription changes
 */
export interface ISubscriptionCredits {
  /**
   * Calculate how many credits to add on a subscription upgrade
   */
  calculateUpgradeCredits(input: ICreditCalculationInput): ICreditCalculationResult;

  /**
   * Check if a downgrade should clawback credits
   * Currently always returns 0 (no clawback on downgrade)
   */
  calculateDowngradeCredits(): ICreditCalculationResult;

  /**
   * Get a human-readable explanation of the credit calculation
   */
  getExplanation(result: ICreditCalculationResult, input: ICreditCalculationInput): string;
}
