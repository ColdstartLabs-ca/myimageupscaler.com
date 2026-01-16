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
  /** Maximum rollover cap for the NEW tier (optional) */
  maxRollover?: number;
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
   * Calculate how many credits to add on a subscription upgrade
   *
   * Logic:
   * 1. Award the difference in tier credits on upgrade
   * 2. MEDIUM-23 FIX: Apply maxRollover cap to prevent balance exceeding tier limit
   *
   * @param input - Current balance and tier credit amounts
   * @returns Calculation result with credits to add and reason
   */
  static calculateUpgradeCredits(input: ICreditCalculationInput): ICreditCalculationResult {
    const { currentBalance, previousTierCredits, newTierCredits, maxRollover } = input;

    // Validate inputs
    if (currentBalance < 0 || previousTierCredits < 0 || newTierCredits < 0) {
      throw new Error('Credit amounts cannot be negative');
    }

    if (newTierCredits <= previousTierCredits) {
      throw new Error(
        'New tier must have more credits than previous tier (use this for upgrades only)'
      );
    }

    // Calculate base tier difference
    const tierDifference = newTierCredits - previousTierCredits;

    // MEDIUM-23 FIX: Apply maxRollover cap if provided
    // Reduce creditsToAdd so that currentBalance + creditsToAdd does not exceed maxRollover
    let creditsToAdd = tierDifference;
    let reason: ICreditCalculationResult['reason'] = 'top_up_to_minimum';

    if (maxRollover !== undefined && maxRollover > 0) {
      const potentialNewBalance = currentBalance + tierDifference;

      if (potentialNewBalance > maxRollover) {
        // Cap the credits to not exceed maxRollover
        creditsToAdd = Math.max(0, maxRollover - currentBalance);
        reason = 'preserve_legitimate_excess'; // Using existing reason for capped scenario

        if (creditsToAdd < tierDifference) {
          console.log(
            `[UPGRADE_CAP] Reduced credits from ${tierDifference} to ${creditsToAdd} ` +
              `due to maxRollover cap of ${maxRollover} (current: ${currentBalance})`
          );
        }
      }
    }

    return {
      creditsToAdd,
      reason,
      maxReasonableBalance: maxRollover ?? 0,
      isLegitimate: true,
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
        return `User has ${currentBalance} credits. Adding ${result.creditsToAdd} (tier difference) to reach ${currentBalance + result.creditsToAdd} on upgrade to ${newTierCredits} tier.`;

      case 'preserve_legitimate_excess':
        if (result.creditsToAdd === 0) {
          // Downgrade case
          return `Downgrade: User keeps their ${currentBalance} credits until next renewal.`;
        }
        return `User has ${currentBalance} credits. Adding ${result.creditsToAdd} (tier difference) to preserve their balance on upgrade.`;

      case 'farming_blocked':
        // This case should no longer occur with simplified logic, but keep for backward compatibility
        return `Farming detected: User has ${currentBalance} credits, which exceeds reasonable amount (${result.maxReasonableBalance}) for previous tier (${previousTierCredits}). Blocking credit addition.`;

      default:
        return 'Unknown calculation reason';
    }
  }
}
