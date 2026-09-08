import type { QualityTier, SubscriptionTier } from '@shared/types/coreflow.types';
import { QUALITY_TIER_CONFIG } from '@shared/types/coreflow.types';

export const FACE_ENHANCEMENT_MODEL_ID = 'clarity-pro-upscaler' as const;
export const FACE_ENHANCEMENT_TIER = 'clarity-pro' as const;
export const CLARITY_PRO_MAX_OUTPUT_MEGAPIXELS = 64;

export type FaceEnhancementAccessClass = 'free' | 'subscription' | 'credit-pack' | 'paid-history';

export interface IFaceEnhancementEntitlementFacts {
  subscriptionStatus?: string | null;
  subscriptionTier?: string | null;
  subscriptionCreditsBalance?: number | null;
  purchasedCreditsBalance?: number | null;
}

export interface IFaceEnhancementEntitlement {
  accessClass: FaceEnhancementAccessClass;
  isPaidUser: boolean;
  effectiveTier: SubscriptionTier;
  spendableCredits: number;
}

export interface IFaceEnhancementRequest {
  qualityTier?: string | null;
  selectedModel?: string | null;
  enhanceFaces?: boolean | null;
}

export type FaceEnhancementPolicyReason =
  | 'none'
  | 'free-user'
  | 'reselect-required'
  | 'invalid-model-selection';

export interface IFaceEnhancementPolicyDecision extends IFaceEnhancementEntitlement {
  faceEnhancementRequested: boolean;
  explicitFaceSelection: boolean;
  requiresReselection: boolean;
  invalidModelSelection: boolean;
  reason: FaceEnhancementPolicyReason;
}

const FACE_QUALITY_TIERS = new Set<QualityTier>(['face-restore', 'face-pro', 'clarity-pro']);
const FACE_MODEL_IDS = new Set(['gfpgan', 'flux-2-pro', FACE_ENHANCEMENT_MODEL_ID]);

function normalizeTier(tier: string | null | undefined): SubscriptionTier | null {
  const normalized = tier?.toLowerCase();
  if (normalized === 'starter') return 'hobby';
  if (
    normalized === 'free' ||
    normalized === 'hobby' ||
    normalized === 'pro' ||
    normalized === 'business'
  ) {
    return normalized;
  }
  return null;
}

function nonNegativeBalance(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * Classify access using only the profile facts already loaded by the API route.
 * Promotional subscription-pool credits do not make a free profile paid.
 */
export function getFaceEnhancementEntitlement(
  facts: IFaceEnhancementEntitlementFacts
): IFaceEnhancementEntitlement {
  const hasActiveSubscription =
    facts.subscriptionStatus === 'active' || facts.subscriptionStatus === 'trialing';
  const subscriptionTier = normalizeTier(facts.subscriptionTier);
  const hasPaidPlanHistory = subscriptionTier !== null && subscriptionTier !== 'free';
  const purchasedCredits = nonNegativeBalance(facts.purchasedCreditsBalance);
  const subscriptionCredits = nonNegativeBalance(facts.subscriptionCreditsBalance);

  let accessClass: FaceEnhancementAccessClass = 'free';
  let effectiveTier: SubscriptionTier = 'free';

  if (hasActiveSubscription) {
    accessClass = 'subscription';
    // An active subscription without a tier is treated as the lowest paid tier,
    // matching the existing upscale access behavior.
    effectiveTier = subscriptionTier && subscriptionTier !== 'free' ? subscriptionTier : 'hobby';
  } else if (purchasedCredits > 0) {
    accessClass = 'credit-pack';
    effectiveTier = 'hobby';
  } else if (hasPaidPlanHistory) {
    accessClass = 'paid-history';
    // Retain the historical paid tier for access checks while the ledger decides
    // whether any credits remain spendable.
    effectiveTier = subscriptionTier;
  }

  return {
    accessClass,
    isPaidUser: accessClass !== 'free',
    effectiveTier,
    spendableCredits: subscriptionCredits + purchasedCredits,
  };
}

function getTierModelId(qualityTier: string | null | undefined): string | null {
  if (!qualityTier || !(qualityTier in QUALITY_TIER_CONFIG)) return null;
  return QUALITY_TIER_CONFIG[qualityTier as QualityTier].modelId;
}

/**
 * Apply the face-enhancement access and stale-configuration policy.
 * This function is deliberately synchronous and has no database or provider I/O.
 */
export function evaluateFaceEnhancementPolicy(params: {
  request: IFaceEnhancementRequest;
  entitlement: IFaceEnhancementEntitlement;
}): IFaceEnhancementPolicyDecision {
  const { request, entitlement } = params;
  const qualityTier = request.qualityTier ?? null;
  const selectedModel = request.selectedModel ?? null;
  const selectedFaceTier = FACE_QUALITY_TIERS.has(qualityTier as QualityTier);
  const selectedFaceModel = selectedModel !== null && FACE_MODEL_IDS.has(selectedModel);
  const faceEnhancementRequested =
    request.enhanceFaces === true || selectedFaceTier || selectedFaceModel;
  const explicitFaceSelection = selectedFaceTier || selectedFaceModel;

  const tierModelId = getTierModelId(qualityTier);
  const hasExplicitModel = Boolean(selectedModel && selectedModel !== 'auto');
  const invalidModelSelection = Boolean(
    hasExplicitModel &&
    qualityTier &&
    qualityTier !== 'auto' &&
    tierModelId &&
    selectedModel !== tierModelId
  );

  // A face flag on Quick, Auto, or another non-face tier is the old checkbox
  // contract. It must be explicitly reselected as a paid face tier so pricing
  // cannot be silently changed or omitted.
  const requiresReselection = request.enhanceFaces === true && !explicitFaceSelection;
  const reason: FaceEnhancementPolicyReason = !faceEnhancementRequested
    ? 'none'
    : !entitlement.isPaidUser
      ? 'free-user'
      : invalidModelSelection
        ? 'invalid-model-selection'
        : requiresReselection
          ? 'reselect-required'
          : 'none';

  return {
    ...entitlement,
    faceEnhancementRequested,
    explicitFaceSelection,
    requiresReselection,
    invalidModelSelection,
    reason,
  };
}

export function hasSufficientSpendableBalance(
  entitlement: IFaceEnhancementEntitlement,
  requiredCredits: number
): boolean {
  return Number.isFinite(requiredCredits) && requiredCredits >= 0
    ? entitlement.spendableCredits >= requiredCredits
    : false;
}

export interface IClarityProDimensionValidation {
  valid: boolean;
  reason?: 'missing-dimensions' | 'output-cap';
  outputMegapixels?: number;
}

/**
 * Validate the dimensions required by Clarity Pro's output-megapixel price.
 * The pricing helper historically clamps over-cap output; this guard rejects it
 * before that helper is called so the quote and provider request cannot diverge.
 */
export function validateClarityProDimensions(params: {
  inputWidth?: number;
  inputHeight?: number;
  scale: number;
}): IClarityProDimensionValidation {
  const { inputWidth, inputHeight, scale } = params;
  if (
    !Number.isFinite(inputWidth) ||
    !Number.isFinite(inputHeight) ||
    !Number.isFinite(scale) ||
    (inputWidth ?? 0) <= 0 ||
    (inputHeight ?? 0) <= 0
  ) {
    return { valid: false, reason: 'missing-dimensions' };
  }

  const outputMegapixels =
    ((inputWidth as number) * (inputHeight as number) * scale * scale) / 1_000_000;
  if (outputMegapixels > CLARITY_PRO_MAX_OUTPUT_MEGAPIXELS) {
    return { valid: false, reason: 'output-cap', outputMegapixels };
  }

  return { valid: true, outputMegapixels };
}
