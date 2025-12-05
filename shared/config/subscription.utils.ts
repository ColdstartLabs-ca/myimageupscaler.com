/**
 * Subscription Configuration Utilities
 * Helper functions to access configuration values
 */

import { getSubscriptionConfig } from './subscription.config';
import type { IPlanConfig, ProcessingMode, ICreditsExpirationConfig, ICreditPack } from './subscription.types';

// ============================================
// Plan Lookup Functions
// ============================================

/**
 * Get plan configuration by Stripe price ID
 */
export function getPlanByPriceId(priceId: string): IPlanConfig | null {
  const config = getSubscriptionConfig();
  return config.plans.find(p => p.stripePriceId === priceId) ?? null;
}

/**
 * Get plan configuration by plan key (e.g., 'hobby', 'pro')
 */
export function getPlanByKey(key: string): IPlanConfig | null {
  const config = getSubscriptionConfig();
  return config.plans.find(p => p.key === key) ?? null;
}

/**
 * Get all enabled plans
 */
export function getEnabledPlans(): IPlanConfig[] {
  const config = getSubscriptionConfig();
  return config.plans.filter(p => p.enabled).sort((a, b) => a.displayOrder - b.displayOrder);
}

/**
 * Get the recommended plan
 */
export function getRecommendedPlan(): IPlanConfig | null {
  const config = getSubscriptionConfig();
  return config.plans.find(p => p.recommended && p.enabled) ?? null;
}

// ============================================
// Credit Pack Functions
// ============================================

/**
 * Get credit pack by Stripe price ID
 */
export function getCreditPackByPriceId(priceId: string): ICreditPack | null {
  const config = getSubscriptionConfig();
  return config.creditPacks.find(pack => pack.stripePriceId === priceId && pack.enabled) ?? null;
}

/**
 * Get credit pack by key
 */
export function getCreditPackByKey(key: string): ICreditPack | null {
  const config = getSubscriptionConfig();
  return config.creditPacks.find(pack => pack.key === key && pack.enabled) ?? null;
}

/**
 * Get all enabled credit packs
 */
export function getEnabledCreditPacks(): ICreditPack[] {
  const config = getSubscriptionConfig();
  return config.creditPacks.filter(pack => pack.enabled);
}

/**
 * Check if a price ID is a credit pack (one-time) or subscription
 */
export function isPriceIdCreditPack(priceId: string): boolean {
  return getCreditPackByPriceId(priceId) !== null;
}

// ============================================
// Credit Functions
// ============================================

/**
 * Calculate credit cost for a processing operation
 * Replaces hardcoded switch statement in image-generation.service.ts
 */
export function calculateCreditCost(config: { mode: ProcessingMode; scale?: number }): number {
  const { creditCosts } = getSubscriptionConfig();

  // Base cost from mode
  let cost = creditCosts.modes[config.mode] ?? creditCosts.modes.enhance;

  // Apply scale multiplier if provided
  if (config.scale) {
    const scaleKey = `${config.scale}x` as '2x' | '4x';
    const multiplier = creditCosts.scaleMultipliers[scaleKey] ?? 1.0;
    cost = Math.ceil(cost * multiplier);
  }

  // Apply bounds
  cost = Math.max(cost, creditCosts.minimumCost);
  cost = Math.min(cost, creditCosts.maximumCost);

  return cost;
}

/**
 * Get credit cost for a specific mode (for UI display)
 */
export function getCreditCostForMode(mode: ProcessingMode): number {
  const { creditCosts } = getSubscriptionConfig();
  return creditCosts.modes[mode] ?? creditCosts.minimumCost;
}

/**
 * Get all mode costs (for pricing display)
 */
export function getAllCreditCosts(): Record<ProcessingMode, number> {
  const { creditCosts } = getSubscriptionConfig();
  return { ...creditCosts.modes };
}

/**
 * Get free user initial credits
 */
export function getFreeUserCredits(): number {
  const { freeUser } = getSubscriptionConfig();
  return freeUser.initialCredits;
}

/**
 * Get low credit warning threshold
 */
export function getLowCreditThreshold(): number {
  const { warnings } = getSubscriptionConfig();
  return warnings.lowCreditThreshold;
}

/**
 * Get low credit warning configuration
 */
export function getLowCreditWarningConfig(): {
  threshold: number;
  percentage: number;
  showToast: boolean;
  checkIntervalMs: number;
} {
  const { warnings } = getSubscriptionConfig();
  return {
    threshold: warnings.lowCreditThreshold,
    percentage: warnings.lowCreditPercentage,
    showToast: warnings.showToastOnDashboard,
    checkIntervalMs: warnings.checkIntervalMs,
  };
}

// ============================================
// Credits Expiration Functions
// ============================================

/**
 * Get expiration configuration for a plan
 */
export function getExpirationConfig(priceId: string): ICreditsExpirationConfig | null {
  const plan = getPlanByPriceId(priceId);
  return plan ? plan.creditsExpiration : null;
}

/**
 * Check if credits expire for a given plan
 */
export function creditsExpireForPlan(priceId: string): boolean {
  const config = getExpirationConfig(priceId);
  return config ? config.mode !== 'never' : false;
}

/**
 * Calculate new balance after applying expiration logic
 * Returns the new balance and amount expired
 */
export function calculateBalanceWithExpiration(params: {
  currentBalance: number;
  newCredits: number;
  expirationMode: 'never' | 'end_of_cycle' | 'rolling_window';
  maxRollover?: number | null;
}): {
  newBalance: number;
  expiredAmount: number;
} {
  const { currentBalance, newCredits, expirationMode, maxRollover } = params;

  switch (expirationMode) {
    case 'end_of_cycle':
    case 'rolling_window':
      // Credits expire - reset to 0 and add new allocation
      return {
        newBalance: newCredits,
        expiredAmount: currentBalance,
      };

    case 'never':
    default: {
      // Rollover with cap
      const uncappedBalance = currentBalance + newCredits;
      const cappedBalance =
        maxRollover !== null && maxRollover !== undefined
          ? Math.min(uncappedBalance, maxRollover)
          : uncappedBalance;

      return {
        newBalance: cappedBalance,
        expiredAmount: 0,
      };
    }
  }
}

/**
 * Check if expiration warning should be sent
 */
export function shouldSendExpirationWarning(params: {
  priceId: string;
  daysUntilExpiration: number;
}): boolean {
  const config = getExpirationConfig(params.priceId);
  if (!config) return false;

  return (
    config.sendExpirationWarning &&
    config.mode !== 'never' &&
    params.daysUntilExpiration <= config.warningDaysBefore &&
    params.daysUntilExpiration >= 0
  );
}

// ============================================
// Backward Compatibility Exports
// ============================================

/**
 * Build SUBSCRIPTION_PRICE_MAP from config
 * For backward compatibility with existing code
 */
export function buildSubscriptionPriceMap(): Record<
  string,
  {
    key: string;
    name: string;
    creditsPerMonth: number;
    maxRollover: number;
    features: readonly string[];
    recommended: boolean;
  }
> {
  const config = getSubscriptionConfig();
  const map: Record<
    string,
    {
      key: string;
      name: string;
      creditsPerMonth: number;
      maxRollover: number;
      features: readonly string[];
      recommended: boolean;
    }
  > = {};

  for (const plan of config.plans) {
    map[plan.stripePriceId] = {
      key: plan.key,
      name: plan.name,
      creditsPerMonth: plan.creditsPerCycle,
      maxRollover: plan.maxRollover ?? plan.creditsPerCycle * plan.rolloverMultiplier,
      features: plan.features,
      recommended: plan.recommended,
    };
  }

  return map;
}

/**
 * Build STRIPE_PRICES object from config
 * For backward compatibility with existing code
 */
export function buildStripePrices(): Record<string, string> {
  const config = getSubscriptionConfig();
  const prices: Record<string, string> = {};

  for (const plan of config.plans) {
    const key = `${plan.key.toUpperCase()}_${plan.interval.toUpperCase()}LY`;
    prices[key] = plan.stripePriceId;
  }

  return prices;
}

/**
 * Build SUBSCRIPTION_PLANS object from config
 * For backward compatibility with existing code
 */
export function buildSubscriptionPlans(): Record<
  string,
  {
    name: string;
    description: string;
    price: number;
    interval: 'month' | 'year';
    creditsPerMonth: number;
    features: readonly string[];
    recommended?: boolean;
  }
> {
  const config = getSubscriptionConfig();
  const plans: Record<
    string,
    {
      name: string;
      description: string;
      price: number;
      interval: 'month' | 'year';
      creditsPerMonth: number;
      features: readonly string[];
      recommended?: boolean;
    }
  > = {};

  for (const plan of config.plans) {
    const key = `${plan.key.toUpperCase()}_${plan.interval.toUpperCase()}LY`;
    plans[key] = {
      name: plan.name,
      description: plan.description,
      price: plan.priceInCents / 100,
      interval: plan.interval,
      creditsPerMonth: plan.creditsPerCycle,
      features: plan.features,
      recommended: plan.recommended || undefined,
    };
  }

  return plans;
}

/**
 * Build HOMEPAGE_TIERS from config
 * For backward compatibility with homepage pricing display
 */
export function buildHomepageTiers(): Array<{
  name: string;
  price: string;
  priceValue: number;
  period: string;
  description: string;
  features: string[];
  cta: string;
  variant: 'outline' | 'primary' | 'secondary';
  priceId: string | null;
  recommended: boolean;
}> {
  const config = getSubscriptionConfig();
  const tiers: Array<{
    name: string;
    price: string;
    priceValue: number;
    period: string;
    description: string;
    features: string[];
    cta: string;
    variant: 'outline' | 'primary' | 'secondary';
    priceId: string | null;
    recommended: boolean;
  }> = [];

  // Add free tier
  tiers.push({
    name: 'Free Tier',
    price: '$0',
    priceValue: 0,
    period: '/mo',
    description: 'For testing and personal use.',
    features: [
      '10 free images to start',
      '2x & 4x Upscaling',
      'Basic Enhancement',
      'No watermark',
      '5MB file limit',
    ],
    cta: 'Start for Free',
    variant: 'outline' as const,
    priceId: null,
    recommended: false,
  });

  // Add paid plans
  for (const plan of config.plans
    .filter(p => p.enabled)
    .sort((a, b) => a.displayOrder - b.displayOrder)) {
    tiers.push({
      name: plan.name,
      price: `$${plan.priceInCents / 100}`,
      priceValue: plan.priceInCents / 100,
      period: `/${plan.interval.charAt(0)}o`,
      description: plan.description,
      features: [...plan.features],
      cta: 'Get Started',
      variant: plan.recommended ? ('primary' as const) : ('secondary' as const),
      priceId: plan.stripePriceId,
      recommended: plan.recommended,
    });
  }

  return tiers;
}
