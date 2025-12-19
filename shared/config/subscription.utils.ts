/**
 * Subscription Configuration Utilities
 * Helper functions to access configuration values
 */

import { QUALITY_TIER_CONFIG, type QualityTier } from '../types/coreflow.types';
import { getSubscriptionConfig } from './subscription.config';
import type {
  ICreditPack,
  ICreditsExpirationConfig,
  IPlanConfig,
  ProcessingMode,
} from './subscription.types';

// ============================================
// Unified Pricing Resolver - Single Source of Truth
// ============================================

/**
 * Unified price index that maps all Stripe price IDs to their metadata
 * This combines plans and credit packs into a single lookup table
 */
interface IPriceIndexEntry {
  type: 'plan' | 'pack';
  key: string;
  name: string;
  stripePriceId: string;
  priceInCents: number;
  currency: string;
  credits: number; // creditsPerCycle for plans, credits for packs
  maxRollover: number | null;
}

let _priceIndex: Record<string, IPriceIndexEntry> | null = null;

/**
 * Build the unified price index from subscription.config.ts
 * This should be the ONLY source of truth for all price lookups
 */
function buildPriceIndex(): Record<string, IPriceIndexEntry> {
  const config = getSubscriptionConfig();
  const index: Record<string, IPriceIndexEntry> = {};

  // Add subscription plans to index
  for (const plan of config.plans.filter(p => p.enabled)) {
    index[plan.stripePriceId] = {
      type: 'plan',
      key: plan.key,
      name: plan.name,
      stripePriceId: plan.stripePriceId,
      priceInCents: plan.priceInCents,
      currency: plan.currency,
      credits: plan.creditsPerCycle,
      maxRollover: plan.maxRollover ?? plan.creditsPerCycle * plan.rolloverMultiplier,
    };
  }

  // Add credit packs to index
  for (const pack of config.creditPacks.filter(p => p.enabled)) {
    index[pack.stripePriceId] = {
      type: 'pack',
      key: pack.key,
      name: pack.name,
      stripePriceId: pack.stripePriceId,
      priceInCents: pack.priceInCents,
      currency: pack.currency,
      credits: pack.credits,
      maxRollover: null, // Credit packs don't have rollover
    };
  }

  return index;
}

/**
 * Get the unified price index (cached)
 */
export function getPriceIndex(): Record<string, IPriceIndexEntry> {
  if (!_priceIndex) {
    _priceIndex = buildPriceIndex();
  }
  return _priceIndex;
}

/**
 * Resolve a price ID to its metadata (unified resolver)
 * Returns null for unknown price IDs - this should be treated as an error
 */
export function resolvePriceId(priceId: string): IPriceIndexEntry | null {
  const index = getPriceIndex();
  return index[priceId] ?? null;
}

/**
 * Assert that a price ID is known and valid
 * Throws an error if the price ID is not found in the index
 */
export function assertKnownPriceId(priceId: string): IPriceIndexEntry {
  const resolved = resolvePriceId(priceId);
  if (!resolved) {
    throw new Error(
      `Unknown price ID: ${priceId}. This price is not configured in the subscription config.`
    );
  }
  return resolved;
}

/**
 * Resolve a price ID and return normalized data for webhook/session metadata
 */
export function resolvePlanOrPack(priceId: string): {
  type: 'plan' | 'pack';
  key: string;
  name: string;
  creditsPerCycle?: number; // for plans
  credits?: number; // for packs
  maxRollover?: number | null; // for plans
} | null {
  const resolved = resolvePriceId(priceId);
  if (!resolved) return null;

  if (resolved.type === 'plan') {
    return {
      type: 'plan',
      key: resolved.key,
      name: resolved.name,
      creditsPerCycle: resolved.credits,
      maxRollover: resolved.maxRollover,
    };
  } else {
    return {
      type: 'pack',
      key: resolved.key,
      name: resolved.name,
      credits: resolved.credits,
    };
  }
}

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
// Quality Tier Functions
// ============================================

/**
 * Get credits cost for a specific quality tier
 */
export function getCreditsForTier(tier: QualityTier): number {
  const config = QUALITY_TIER_CONFIG[tier].credits;
  return config === 'variable' ? 0 : config; // Auto tier cost determined at runtime
}

/**
 * Get model ID for a specific quality tier
 */
export function getModelForTier(tier: QualityTier): string | null {
  return QUALITY_TIER_CONFIG[tier].modelId;
}

/**
 * Get complete configuration for a specific quality tier
 */
export function getTierConfig(tier: QualityTier): {
  label: string;
  credits: number | 'variable';
  modelId: string | null;
  description: string;
  bestFor: string;
  smartAnalysisAlwaysOn: boolean;
} {
  return QUALITY_TIER_CONFIG[tier];
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
 * Get all model multipliers for display
 */
export function getAllModelMultipliers(): Record<string, number> {
  const { creditCosts } = getSubscriptionConfig();
  return { ...creditCosts.modelMultipliers };
}

/**
 * Get model multiplier for a specific model
 */
export function getModelMultiplier(modelId: string): number {
  const { creditCosts } = getSubscriptionConfig();
  return creditCosts.modelMultipliers[modelId] ?? 1;
}

/**
 * Calculate total credits needed for a batch
 * Used for pre-processing cost preview in the UI
 */
export function calculateBatchCost(imageCount: number, costPerImage: number): number {
  return imageCount * costPerImage;
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
// Batch Limit Functions
// ============================================

/**
 * Get batch limit for a user based on their subscription tier
 * @param subscriptionTier - The user's subscription tier key (null = free user)
 * @returns Maximum images allowed in queue
 */
export function getBatchLimit(subscriptionTier: string | null): number {
  const config = getSubscriptionConfig();

  if (!subscriptionTier) {
    return config.freeUser.batchLimit;
  }

  const plan = config.plans.find(p => p.key === subscriptionTier);
  if (!plan) {
    // Unknown tier, default to free limit
    return config.freeUser.batchLimit;
  }

  return plan.batchLimit ?? Infinity;
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

  // Add subscription plans
  for (const plan of config.plans) {
    const key = `${plan.key.toUpperCase()}_${plan.interval.toUpperCase()}LY`;
    prices[key] = plan.stripePriceId;
  }

  // Add credit packs with new naming convention
  for (const pack of config.creditPacks) {
    const key = `${pack.key.toUpperCase()}_CREDITS`;
    prices[key] = pack.stripePriceId;
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
 * Build CREDIT_PACKS object from config
 * For backward compatibility with existing code
 */
export function buildCreditPacks(): Record<
  string,
  {
    name: string;
    description: string;
    price: number;
    credits: number;
    features: readonly string[];
    popular?: boolean;
  }
> {
  const config = getSubscriptionConfig();
  const packs: Record<
    string,
    {
      name: string;
      description: string;
      price: number;
      credits: number;
      features: readonly string[];
      popular?: boolean;
    }
  > = {};

  for (const pack of config.creditPacks) {
    const key = `${pack.key.toUpperCase()}_CREDITS`;
    packs[key] = {
      name: pack.name,
      description: pack.description,
      price: pack.priceInCents / 100,
      credits: pack.credits,
      features: [], // Credit packs don't have features array in config
      popular: pack.popular || undefined,
    };
  }

  return packs;
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

/**
 * Helper function to map model ID to quality tier
 */
export function modelIdToTier(modelId: string): QualityTier {
  switch (modelId) {
    case 'real-esrgan':
      return 'quick';
    case 'gfpgan':
      return 'face-restore';
    case 'clarity-upscaler':
      return 'hd-upscale';
    case 'flux-2-pro':
      return 'face-pro';
    case 'nano-banana-pro':
      return 'ultra';
    default:
      return 'quick';
  }
}

// ============================================
// Legacy Functions (for backward compatibility during migration)
// ============================================

/**
 * Get credit cost for a specific mode (legacy)
 */
export function getCreditCostForMode(mode: ProcessingMode): number {
  const { creditCosts } = getSubscriptionConfig();
  return creditCosts.modes[mode] ?? creditCosts.minimumCost;
}

/**
 * Calculate credit cost with model-based multiplier (legacy)
 */
export function calculateModelCreditCost(params: {
  mode: ProcessingMode;
  modelId: string;
  scale: 2 | 4 | 8;
}): number {
  const { creditCosts } = getSubscriptionConfig();

  // Base cost from mode
  const baseCost = creditCosts.modes[params.mode] ?? creditCosts.modes.enhance;

  // Get model multiplier (default to 1 if model not found)
  const modelMultiplier = creditCosts.modelMultipliers[params.modelId] ?? 1;

  // Get scale multiplier
  const scaleKey = `${params.scale}x` as '2x' | '4x' | '8x';
  const scaleMultiplier = creditCosts.scaleMultipliers[scaleKey] ?? 1.0;

  // Apply formula: baseCreditCost × modelMultiplier × scaleMultiplier
  let totalCost = Math.ceil(baseCost * modelMultiplier * scaleMultiplier);

  // Apply bounds
  totalCost = Math.max(totalCost, creditCosts.minimumCost);
  totalCost = Math.min(totalCost, creditCosts.maximumCost);

  return totalCost;
}

/**
 * Calculate credit cost for a processing mode and scale
 * This is a simplified version that doesn't require model ID
 */
export function calculateCreditCost(params: { mode: ProcessingMode; scale?: number }): number {
  const { creditCosts } = getSubscriptionConfig();

  // Base cost from mode (default to enhance cost if mode not found)
  let baseCost = creditCosts.modes[params.mode] ?? creditCosts.modes.enhance;

  // Apply bounds (minimum and maximum cost limits)
  baseCost = Math.max(baseCost, creditCosts.minimumCost);
  baseCost = Math.min(baseCost, creditCosts.maximumCost);

  return baseCost;
}
