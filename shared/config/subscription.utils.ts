/**
 * Subscription Configuration Utilities
 * Helper functions to access configuration values
 */

import {
  QUALITY_TIER_CONFIG,
  type IBatchItem,
  type IUpscaleConfig,
  type QualityTier,
} from '../types/coreflow.types';
import {
  MODEL_RESOLUTION_PROVIDER_COSTS,
  MODEL_CONFIG,
  MODEL_SCALE_CREDIT_MULTIPLIERS,
  MODEL_SCALE_TO_RESOLUTION,
} from './model-costs.config';
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
  for (const plan of config.plans.filter(p => p.enabled && p.stripePriceId)) {
    index[plan.stripePriceId!] = {
      type: 'plan',
      key: plan.key,
      name: plan.name,
      stripePriceId: plan.stripePriceId!,
      priceInCents: plan.priceInCents,
      currency: plan.currency,
      credits: plan.creditsPerCycle,
      maxRollover: plan.maxRollover ?? plan.creditsPerCycle * plan.rolloverMultiplier,
    };
  }

  // Add credit packs to index
  for (const pack of config.creditPacks.filter(p => p.enabled && p.stripePriceId)) {
    index[pack.stripePriceId!] = {
      type: 'pack',
      key: pack.key,
      name: pack.name,
      stripePriceId: pack.stripePriceId!,
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
 * Provider-aware credit pricing constants.
 *
 * Use the cheapest effective subscription credit value (Business: $149 / 5000
 * credits ~= $0.03) as the safety baseline, then apply margin to provider cost.
 */
export const PROVIDER_COST_MARGIN_MULTIPLIER = 2.5;
export const PROVIDER_COST_CREDIT_VALUE_USD = 0.03;
export const CLARITY_PRO_MAX_OUTPUT_MEGAPIXELS = 64;
export const CLARITY_PRO_MINIMUM_PROVIDER_COST_USD = 0.03;
export const CLARITY_PRO_OUTPUT_MEGAPIXEL_PRICE_USD = 0.03;
export const CLARITY_PRO_MINIMUM_CREDITS = Math.ceil(
  (CLARITY_PRO_MINIMUM_PROVIDER_COST_USD * PROVIDER_COST_MARGIN_MULTIPLIER) /
    PROVIDER_COST_CREDIT_VALUE_USD
);
export const CLARITY_PRO_MAXIMUM_CREDITS = Math.ceil(
  (CLARITY_PRO_MAX_OUTPUT_MEGAPIXELS *
    CLARITY_PRO_OUTPUT_MEGAPIXEL_PRICE_USD *
    PROVIDER_COST_MARGIN_MULTIPLIER) /
    PROVIDER_COST_CREDIT_VALUE_USD
);
export const RECRAFT_CRISP_CREDITS = 2;
export const RECRAFT_CRISP_PROVIDER_COST_USD = 0.006;
export const FLUX_2_PRO_MEGAPIXEL_PRICE_USD = 0.015;
export const FLUX_2_PRO_PER_RUN_PRICE_USD = 0.015;
export const RESOLUTION_CREDIT_MULTIPLIERS: Record<'2k' | '4k' | '8k', number> = {
  '2k': 1.0,
  '4k': 1.5,
  '8k': 2.0,
};

export class ProviderPricingConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderPricingConfigurationError';
  }
}

export function resolveEffectiveResolution(
  modelId: string,
  scale: number,
  requestedResolution?: string
): string | undefined {
  const resolutionCosts = MODEL_RESOLUTION_PROVIDER_COSTS[modelId];
  if (!resolutionCosts) return undefined;

  if (requestedResolution) {
    if (!(requestedResolution in resolutionCosts)) {
      throw new ProviderPricingConfigurationError(
        `Unsupported resolution "${requestedResolution}" for per-resolution model "${modelId}"`
      );
    }
    return requestedResolution;
  }

  const mappedResolution = MODEL_SCALE_TO_RESOLUTION[modelId]?.[scale];
  if (!mappedResolution || !(mappedResolution in resolutionCosts)) {
    throw new ProviderPricingConfigurationError(
      `No provider price configured for model "${modelId}" at scale ${scale}`
    );
  }

  return mappedResolution;
}

/**
 * Calculate provider-aware credits for any model.
 * Supports flat pricing, per-image fixed pricing, and output-megapixel dynamic pricing.
 *
 * For Clarity Pro: credits = ceil(providerCost * margin / cheapestCreditValue)
 * For Recraft Crisp: fixed 2 credits
 * For all others: falls back to existing tier-based scale multiplier logic
 */
export function calculateProviderAwareCredits(params: {
  modelId: string;
  qualityTier: QualityTier;
  scale: number;
  inputWidth?: number;
  inputHeight?: number;
  smartAnalysis?: boolean;
  effectiveResolution?: string;
}): {
  credits: number;
  providerCostUsd: number;
  pricingModel: 'flat' | 'per-image' | 'per-resolution' | 'output-megapixel';
  outputMegapixels?: number;
  effectiveResolution?: string;
} {
  const {
    modelId,
    qualityTier,
    scale,
    inputWidth,
    inputHeight,
    smartAnalysis,
    effectiveResolution: requestedEffectiveResolution,
  } = params;

  // Smart analysis adds +1 credit on explicit tiers (not auto)
  const smartAnalysisCost = qualityTier !== 'auto' && smartAnalysis ? 1 : 0;

  const resolutionCosts = MODEL_RESOLUTION_PROVIDER_COSTS[modelId];
  if (resolutionCosts) {
    const effectiveResolution = resolveEffectiveResolution(
      modelId,
      scale,
      requestedEffectiveResolution
    );
    const providerCostUsd = effectiveResolution ? resolutionCosts[effectiveResolution] : undefined;

    if (providerCostUsd === undefined) {
      throw new ProviderPricingConfigurationError(
        `Unsupported resolution "${effectiveResolution ?? 'unknown'}" for per-resolution model "${modelId}"`
      );
    }

    return {
      credits:
        Math.ceil(
          (providerCostUsd * PROVIDER_COST_MARGIN_MULTIPLIER) / PROVIDER_COST_CREDIT_VALUE_USD
        ) + smartAnalysisCost,
      providerCostUsd,
      pricingModel: 'per-resolution',
      effectiveResolution,
    };
  }

  // --- Recraft Crisp Upscale: fixed per-image pricing ---
  if (modelId === 'recraft-crisp-upscale') {
    return {
      credits: RECRAFT_CRISP_CREDITS + smartAnalysisCost,
      providerCostUsd: RECRAFT_CRISP_PROVIDER_COST_USD,
      pricingModel: 'per-image',
    };
  }

  // --- Clarity Pro / Flux 2 Pro: output-megapixel dynamic pricing ---
  if (modelId === 'clarity-pro-upscaler' || modelId === 'flux-2-pro') {
    if (!inputWidth || !inputHeight) {
      throw new ProviderPricingConfigurationError(
        `Input dimensions are required to price output-megapixel model "${modelId}"`
      );
    }

    if (modelId === 'flux-2-pro') {
      const inputMegapixels = (inputWidth * inputHeight) / 1_000_000;
      const outputMegapixels = inputMegapixels;
      const providerCostUsd =
        FLUX_2_PRO_MEGAPIXEL_PRICE_USD * (inputMegapixels + outputMegapixels) +
        FLUX_2_PRO_PER_RUN_PRICE_USD;
      const credits = Math.ceil(
        (providerCostUsd * PROVIDER_COST_MARGIN_MULTIPLIER) / PROVIDER_COST_CREDIT_VALUE_USD
      );

      return {
        credits: credits + smartAnalysisCost,
        providerCostUsd,
        pricingModel: 'output-megapixel',
        outputMegapixels,
      };
    }

    let outputMegapixels = 0;

    const outputWidth = inputWidth * scale;
    const outputHeight = inputHeight * scale;
    outputMegapixels = (outputWidth * outputHeight) / 1_000_000;
    // Cap at 64MP per Replicate model limit
    outputMegapixels = Math.min(outputMegapixels, CLARITY_PRO_MAX_OUTPUT_MEGAPIXELS);

    const providerCostUsd = Math.max(
      CLARITY_PRO_MINIMUM_PROVIDER_COST_USD,
      outputMegapixels * CLARITY_PRO_OUTPUT_MEGAPIXEL_PRICE_USD
    );

    const credits = Math.ceil(
      (providerCostUsd * PROVIDER_COST_MARGIN_MULTIPLIER) / PROVIDER_COST_CREDIT_VALUE_USD
    );

    return {
      credits: credits + smartAnalysisCost,
      providerCostUsd,
      pricingModel: 'output-megapixel',
      outputMegapixels,
    };
  }

  // --- Default: flat tier-based pricing with scale multiplier ---
  const baseCost = getCreditsForTier(qualityTier);
  const scaleMultiplier = getScaleCreditMultiplier(modelId, scale);
  const credits = Math.ceil(baseCost * scaleMultiplier);

  return {
    credits: credits + smartAnalysisCost,
    providerCostUsd: MODEL_CONFIG[modelId as keyof typeof MODEL_CONFIG]?.cost ?? 0,
    pricingModel: 'flat',
  };
}

/**
 * Finalize provider-aware credits for user-facing estimates and billing paths.
 * This keeps flat-model resolution multipliers and subscription min/max bounds
 * consistent across API routes, services, and client-side estimates.
 */
export function calculateFinalProviderAwareCredits(params: {
  modelId: string;
  qualityTier: QualityTier;
  scale: number;
  inputWidth?: number;
  inputHeight?: number;
  smartAnalysis?: boolean;
  targetResolution?: '2k' | '4k' | '8k';
  effectiveResolution?: string;
}): ReturnType<typeof calculateProviderAwareCredits> & {
  finalCredits: number;
  scaleMultiplier: number;
  resolutionMultiplier: number;
} {
  const providerAware = calculateProviderAwareCredits(params);
  const scaleMultiplier = getScaleCreditMultiplier(params.modelId, params.scale);
  const resolutionMultiplier =
    providerAware.pricingModel === 'flat' && params.targetResolution
      ? RESOLUTION_CREDIT_MULTIPLIERS[params.targetResolution]
      : 1.0;

  const smartAnalysisCost = params.qualityTier !== 'auto' && params.smartAnalysis ? 1 : 0;

  let finalCredits = providerAware.credits;
  if (providerAware.pricingModel === 'flat') {
    finalCredits =
      Math.ceil(getCreditsForTier(params.qualityTier) * scaleMultiplier * resolutionMultiplier) +
      smartAnalysisCost;
  }

  const { creditCosts } = getSubscriptionConfig();
  finalCredits = Math.max(finalCredits, creditCosts.minimumCost);
  finalCredits = Math.min(finalCredits, creditCosts.maximumCost);

  return {
    ...providerAware,
    finalCredits,
    scaleMultiplier,
    resolutionMultiplier,
  };
}

/**
 * Get the scale-aware credit multiplier for a specific model + scale combination.
 * Returns 1.0 for models without scale-dependent costs.
 */
export function getScaleCreditMultiplier(modelId: string, scale: number): number {
  return MODEL_SCALE_CREDIT_MULTIPLIERS[modelId]?.[scale] ?? 1.0;
}

/**
 * Get credits cost for a quality tier at a specific scale factor.
 * Applies model-specific scale multipliers for GPU-time-billed models.
 */
export function getCreditsForTierAtScale(tier: QualityTier, scale: number): number {
  if (tier === 'clarity-pro') return CLARITY_PRO_MINIMUM_CREDITS;

  const baseCost = getCreditsForTier(tier);
  const modelId = QUALITY_TIER_CONFIG[tier].modelId;
  if (!modelId) return baseCost; // Auto/bg-removal — no model-specific multiplier
  if (modelId === 'flux-2-pro') {
    const maximumProviderCost = FLUX_2_PRO_MEGAPIXEL_PRICE_USD * 8 + FLUX_2_PRO_PER_RUN_PRICE_USD;
    return Math.ceil(
      (maximumProviderCost * PROVIDER_COST_MARGIN_MULTIPLIER) / PROVIDER_COST_CREDIT_VALUE_USD
    );
  }
  if (MODEL_RESOLUTION_PROVIDER_COSTS[modelId]) {
    return calculateFinalProviderAwareCredits({
      modelId,
      qualityTier: tier,
      scale,
    }).finalCredits;
  }
  const multiplier = getScaleCreditMultiplier(modelId, scale);
  return Math.ceil(baseCost * multiplier);
}

/**
 * Get the min/max credit range for a tier across all supported scales.
 * Returns { min, max } when costs vary by scale, or a flat number when uniform.
 */
export function getCreditRangeForTier(tier: QualityTier): number | { min: number; max: number } {
  if (tier === 'clarity-pro') {
    return { min: CLARITY_PRO_MINIMUM_CREDITS, max: CLARITY_PRO_MAXIMUM_CREDITS };
  }

  const baseCost = getCreditsForTier(tier);
  const modelId = QUALITY_TIER_CONFIG[tier].modelId;
  if (!modelId) return baseCost;

  if (modelId === 'flux-2-pro') {
    const minimumCredits = Math.ceil(
      (FLUX_2_PRO_PER_RUN_PRICE_USD * PROVIDER_COST_MARGIN_MULTIPLIER) /
        PROVIDER_COST_CREDIT_VALUE_USD
    );
    return { min: minimumCredits, max: getCreditsForTierAtScale(tier, 2) };
  }

  const resolutionCosts = MODEL_RESOLUTION_PROVIDER_COSTS[modelId];
  if (resolutionCosts) {
    const credits = Object.values(resolutionCosts).map(providerCost =>
      Math.ceil((providerCost * PROVIDER_COST_MARGIN_MULTIPLIER) / PROVIDER_COST_CREDIT_VALUE_USD)
    );
    const min = Math.min(...credits);
    const max = Math.max(...credits);
    return min === max ? min : { min, max };
  }

  const scaleMultipliers = MODEL_SCALE_CREDIT_MULTIPLIERS[modelId];
  if (!scaleMultipliers) return baseCost;

  const multiplierValues = Object.values(scaleMultipliers).filter(
    (v): v is number => v !== undefined
  );
  if (multiplierValues.length === 0) return baseCost;

  const min = Math.ceil(baseCost * Math.min(...multiplierValues));
  const max = Math.ceil(baseCost * Math.max(...multiplierValues));

  return min === max ? min : { min, max };
}

type CreditLabelUnit = 'credits' | 'CR';

function formatCreditLabel(credits: number, unit: CreditLabelUnit): string {
  if (unit === 'CR') return `${credits} CR`;
  return `${credits} credit${credits === 1 ? '' : 's'}`;
}

function formatCreditRangeLabel(
  range: number | { min: number; max: number },
  unit: CreditLabelUnit
): string {
  if (typeof range === 'number') return formatCreditLabel(range, unit);
  if (unit === 'CR') return `${range.min}-${range.max} CR`;
  return `${range.min}-${range.max} credits`;
}

/**
 * Get the static credit label for model cards and gallery entries.
 * Dynamic tiers expose a range; flat tiers expose a single cost.
 */
export function getCreditDisplayForTier(
  tier: QualityTier,
  unit: CreditLabelUnit = 'credits'
): string {
  if (QUALITY_TIER_CONFIG[tier].credits === 'variable') {
    if (!QUALITY_TIER_CONFIG[tier].modelId) return unit === 'CR' ? '1-25 CR' : '1-25 credits';
    return formatCreditRangeLabel(getCreditRangeForTier(tier), unit);
  }

  return formatCreditRangeLabel(getCreditRangeForTier(tier), unit);
}

/**
 * Get the selected-tier credit label when scale/smart-analysis are known.
 * Provider-priced tiers still use their static range because exact cost requires
 * image dimensions and is shown by the batch cost preview.
 */
export function getCreditDisplayForTierAtScale(params: {
  tier: QualityTier;
  scale: number;
  smartAnalysis?: boolean;
  unit?: CreditLabelUnit;
}): string {
  const { tier, scale, smartAnalysis, unit = 'credits' } = params;
  const config = QUALITY_TIER_CONFIG[tier];

  if (config.credits === 'variable') {
    return getCreditDisplayForTier(tier, unit);
  }

  const smartAnalysisCost = tier !== 'auto' && smartAnalysis ? 1 : 0;
  return formatCreditLabel(getCreditsForTierAtScale(tier, scale) + smartAnalysisCost, unit);
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
 * Calculate the exact displayed batch cost using the same provider-aware resolver
 * as the billing path. Dynamic models such as Clarity Pro require per-image
 * dimensions; without them, the resolver falls back to the model minimum.
 */
export function calculateBatchProviderAwareCreditCost(params: {
  config: Pick<
    IUpscaleConfig,
    'qualityTier' | 'scale' | 'additionalOptions' | 'nanoBananaProConfig'
  >;
  items: Pick<IBatchItem, 'inputDimensions'>[];
}): { perItemCredits: number[]; totalCredits: number } {
  const { qualityTier, scale, additionalOptions } = params.config;

  const perItemCredits = params.items.map(item => {
    if (qualityTier === 'auto') {
      // Auto mode uses variable cost — use the upper bound to avoid understating.
      return 25;
    }

    const modelId = QUALITY_TIER_CONFIG[qualityTier].modelId;
    if (modelId) {
      return calculateFinalProviderAwareCredits({
        modelId,
        qualityTier,
        scale,
        inputWidth: item.inputDimensions?.width,
        inputHeight: item.inputDimensions?.height,
        smartAnalysis: additionalOptions?.smartAnalysis,
        effectiveResolution: resolveEffectiveResolution(
          modelId,
          scale,
          params.config.nanoBananaProConfig?.resolution
        ),
      }).finalCredits;
    }

    const smartAnalysisCost = additionalOptions?.smartAnalysis ? 1 : 0;
    return getCreditsForTierAtScale(qualityTier, scale) + smartAnalysisCost;
  });

  return {
    perItemCredits,
    totalCredits: perItemCredits.reduce((sum, credits) => sum + credits, 0),
  };
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

/**
 * Get hourly processing rate limit for a user based on their subscription tier
 * This is separate from batchLimit (queue size) - it controls how many images
 * can be processed per hour to prevent abuse.
 * @param subscriptionTier - The user's subscription tier key (null = free user)
 * @returns Maximum images allowed per hour
 */
export function getHourlyProcessingLimit(subscriptionTier: string | null): number {
  const config = getSubscriptionConfig();

  if (!subscriptionTier) {
    return config.freeUser.hourlyProcessingLimit;
  }

  const plan = config.plans.find(p => p.key === subscriptionTier);
  if (!plan) {
    return config.freeUser.hourlyProcessingLimit;
  }

  return plan.hourlyProcessingLimit ?? Infinity;
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

  for (const plan of config.plans.filter(p => p.stripePriceId)) {
    map[plan.stripePriceId!] = {
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
  for (const plan of config.plans.filter(p => p.stripePriceId)) {
    const key = `${plan.key.toUpperCase()}_${plan.interval.toUpperCase()}LY`;
    prices[key] = plan.stripePriceId!;
  }

  // Add credit packs with new naming convention
  for (const pack of config.creditPacks.filter(p => p.stripePriceId)) {
    const key = `${pack.key.toUpperCase()}_CREDITS`;
    prices[key] = pack.stripePriceId!;
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
  variant: 'outline' | 'primary' | 'secondary' | 'gradient';
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
    variant: 'outline' | 'primary' | 'secondary' | 'gradient';
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
      variant: plan.recommended ? ('gradient' as const) : ('secondary' as const),
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
    case 'qwen-image-edit':
      return 'budget-edit'; // 3 CR (also used by photo-repair at 4 CR — budget-edit is the base)
    case 'seedream':
      return 'seedream-edit'; // 4 CR (all seedream tiers: seedream-edit/lighting-fix/resume-photo)
    case 'p-image-edit':
      return 'fast-edit'; // 2 CR (also used by budget-old-photo at same 2 CR)
    case 'realesrgan-anime':
      return 'anime-upscale'; // 1 CR
    case 'clarity-pro-upscaler':
      return 'clarity-pro';
    case 'recraft-crisp-upscale':
      return 'crisp-upscale';
    case 'nano-banana-2':
      return 'nano-banana-2';
    // nano-banana (free Gemini tier) and flux-kontext-fast have no dedicated quality tier
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

  // Get model-specific scale multiplier (e.g., clarity-upscaler 4x = 2.0x)
  const scaleMultiplier = getScaleCreditMultiplier(params.modelId, params.scale);

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
