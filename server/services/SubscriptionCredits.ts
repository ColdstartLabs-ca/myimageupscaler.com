/**
 * SubscriptionCredits Service
 *
 * Handles all credit calculation logic for subscription upgrades/downgrades.
 * This service is pure business logic - no database calls, just calculations.
 */

export interface ICreditCalculationInput {
  /** Current user credit balance */
  currentBalance: number;
  /** Credits per cycle for the PREVIOUS tier */
  previousTierCredits: number;
  /** Credits per cycle for the NEW tier */
  newTierCredits: number;
}

export interface ICreditCalculationResult {
  /** How many credits to add */
  creditsToAdd: number;
  /** Why this amount was chosen */
  reason: 'top_up_to_minimum' | 'preserve_legitimate_excess' | 'farming_blocked';
  /** Maximum reasonable balance for the previous tier */
  maxReasonableBalance: number;
  /** Whether this is a legitimate upgrade */
  isLegitimate: boolean;
}

export class SubscriptionCreditsService {
  /**
   * Factor to determine "reasonable" credit balance
   * A user with 1.5x their tier credits is considered to have legitimate rollover/purchases
   */
  private static readonly REASONABLE_EXCESS_FACTOR = 1.5;

  /**
   * Calculate how many credits to add on a subscription upgrade
   *
   * Logic:
   * 1. Check if user's current balance is "reasonable" for their current tier (≤ 1.5x tier credits)
   * 2. If reasonable → add tier difference (preserves rollover/purchases)
   * 3. If excessive → block (farming attempt)
   *
   * @param input - Current balance and tier credit amounts
   * @returns Calculation result with credits to add and reason
   */
  static calculateUpgradeCredits(input: ICreditCalculationInput): ICreditCalculationResult {
    const { currentBalance, previousTierCredits, newTierCredits } = input;

    // Validate inputs
    if (currentBalance < 0 || previousTierCredits < 0 || newTierCredits < 0) {
      throw new Error('Credit amounts cannot be negative');
    }

    if (newTierCredits <= previousTierCredits) {
      throw new Error('New tier must have more credits than previous tier (use this for upgrades only)');
    }

    const tierDifference = newTierCredits - previousTierCredits;
    const maxReasonableBalance = Math.floor(previousTierCredits * this.REASONABLE_EXCESS_FACTOR);

    // Check if user's balance is reasonable for their CURRENT tier
    if (currentBalance <= maxReasonableBalance) {
      // User has reasonable credits - add tier difference to preserve their balance
      const reason = currentBalance < newTierCredits ? 'top_up_to_minimum' : 'preserve_legitimate_excess';

      return {
        creditsToAdd: tierDifference,
        reason,
        maxReasonableBalance,
        isLegitimate: true,
      };
    }

    // User has excessive credits (likely from downgrade farming) - block
    return {
      creditsToAdd: 0,
      reason: 'farming_blocked',
      maxReasonableBalance,
      isLegitimate: false,
    };
  }

  /**
   * Check if a downgrade should clawback credits
   *
   * Current design: Users keep their credits on downgrade until next renewal
   * This is intentional - we don't clawback on downgrades
   *
   * @returns Always returns 0 for downgrades (no clawback)
   */
  static calculateDowngradeCredits(): ICreditCalculationResult {
    return {
      creditsToAdd: 0,
      reason: 'preserve_legitimate_excess', // User keeps credits on downgrade
      maxReasonableBalance: 0, // Not applicable for downgrades
      isLegitimate: true,
    };
  }

  /**
   * Get a human-readable explanation of the credit calculation
   */
  static getExplanation(result: ICreditCalculationResult, input: ICreditCalculationInput): string {
    const { currentBalance, previousTierCredits, newTierCredits } = input;

    switch (result.reason) {
      case 'top_up_to_minimum':
        return `User has ${currentBalance} credits (below new tier's ${newTierCredits}). Adding ${result.creditsToAdd} (tier difference) to reach ${currentBalance + result.creditsToAdd}.`;

      case 'preserve_legitimate_excess':
        if (result.creditsToAdd === 0) {
          // Downgrade case
          return `Downgrade: User keeps their ${currentBalance} credits until next renewal.`;
        }
        return `User has ${currentBalance} credits (reasonable excess from rollover/purchases). Adding ${result.creditsToAdd} (tier difference) to preserve their excess.`;

      case 'farming_blocked':
        return `Farming detected: User has ${currentBalance} credits, which exceeds reasonable amount (${result.maxReasonableBalance}) for previous tier (${previousTierCredits}). Blocking credit addition.`;

      default:
        return 'Unknown calculation reason';
    }
  }
}
