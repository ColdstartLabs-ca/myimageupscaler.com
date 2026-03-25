/**
 * Engagement-Based First-Purchase Discount Configuration
 *
 * This module defines the configuration for offering a 20% discount to
 * highly-engaged free users who have never made a purchase.
 *
 * Trigger: When user meets 2 out of 3 engagement thresholds in a session:
 * - 3+ upscales
 * - 2+ downloads
 * - 1+ model switches
 *
 * @see docs/PRDs/engagement-based-first-purchase-discount.md
 */

import type {
  IEngagementSignals,
  IEngagementThresholds,
  IDiscountOffer,
} from '@shared/types/engagement-discount';

/**
 * Engagement signal thresholds that must be met to trigger the discount.
 * User must meet at least 2 out of 3 thresholds.
 */
export const ENGAGEMENT_THRESHOLDS: IEngagementThresholds = {
  /** Minimum upscales in session */
  upscales: 3,
  /** Minimum downloads in session */
  downloads: 2,
  /** Minimum model switches in session */
  modelSwitches: 1,
} as const;

/**
 * Number of thresholds that must be met to trigger eligibility.
 * With 3 thresholds and a requirement of 2, user needs 66% threshold achievement.
 */
export const REQUIRED_THRESHOLDS_MET = 2;

/**
 * Discount configuration for the engagement-based offer.
 */
export const ENGAGEMENT_DISCOUNT_CONFIG = {
  /** Discount percentage (20% off) */
  discountPercent: 20,

  /** How long the offer is valid once shown (30 minutes) */
  offerValidityMinutes: 30,

  /** Target credit pack for this discount (Medium Pack) */
  targetPackKey: 'medium',

  /** Original price in cents ($14.99) */
  originalPriceCents: 1499,

  /** Discounted price in cents ($11.99) - calculated as 1499 * 0.8 */
  discountedPriceCents: 1199,

  /** Session storage key for tracking engagement signals */
  sessionKey: 'miu_engagement_signals',

  /** Session storage key for discount offer state */
  offerKey: 'miu_engagement_offer',

  /** Toast display cooldown in minutes (don't re-show toast if dismissed within this window) */
  dismissCooldownMinutes: 5,
} as const;

/**
 * Create an empty engagement signals object for a new session.
 */
export function createEmptyEngagementSignals(): IEngagementSignals {
  return {
    upscales: 0,
    downloads: 0,
    modelSwitches: 0,
    sessionStartedAt: Date.now(),
  };
}

/**
 * Check if the engagement signals meet the eligibility threshold.
 * Returns true if at least 2 out of 3 thresholds are met.
 */
export function checkEngagementEligibility(signals: IEngagementSignals): {
  isEligible: boolean;
  thresholdsMet: number;
  thresholdsStatus: {
    upscales: boolean;
    downloads: boolean;
    modelSwitches: boolean;
  };
} {
  const thresholdsStatus = {
    upscales: signals.upscales >= ENGAGEMENT_THRESHOLDS.upscales,
    downloads: signals.downloads >= ENGAGEMENT_THRESHOLDS.downloads,
    modelSwitches: signals.modelSwitches >= ENGAGEMENT_THRESHOLDS.modelSwitches,
  };

  const thresholdsMet = Object.values(thresholdsStatus).filter(Boolean).length;

  return {
    isEligible: thresholdsMet >= REQUIRED_THRESHOLDS_MET,
    thresholdsMet,
    thresholdsStatus,
  };
}

/**
 * Calculate the offer expiry timestamp.
 */
export function calculateOfferExpiry(): number {
  return Date.now() + ENGAGEMENT_DISCOUNT_CONFIG.offerValidityMinutes * 60 * 1000;
}

/**
 * Check if an offer has expired.
 */
export function isOfferExpired(expiresAt: number | string): boolean {
  const expiryTime = typeof expiresAt === 'string' ? new Date(expiresAt).getTime() : expiresAt;
  return Date.now() > expiryTime;
}

/**
 * Calculate remaining time in seconds for a countdown.
 */
export function getRemainingSeconds(expiresAt: number | string): number {
  const expiryTime = typeof expiresAt === 'string' ? new Date(expiresAt).getTime() : expiresAt;
  const remaining = Math.max(0, Math.floor((expiryTime - Date.now()) / 1000));
  return remaining;
}

/**
 * Format remaining time for display (MM:SS).
 */
export function formatCountdown(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Create a discount offer object.
 */
export function createDiscountOffer(userId: string): IDiscountOffer {
  const now = Date.now();
  return {
    userId,
    offeredAt: new Date().toISOString(),
    expiresAt: new Date(
      now + ENGAGEMENT_DISCOUNT_CONFIG.offerValidityMinutes * 60 * 1000
    ).toISOString(),
    discountPercent: ENGAGEMENT_DISCOUNT_CONFIG.discountPercent,
    targetPackKey: ENGAGEMENT_DISCOUNT_CONFIG.targetPackKey,
    originalPriceCents: ENGAGEMENT_DISCOUNT_CONFIG.originalPriceCents,
    discountedPriceCents: ENGAGEMENT_DISCOUNT_CONFIG.discountedPriceCents,
    redeemed: false,
  };
}

/**
 * Credit pack configuration for the discount target.
 */
export const DISCOUNT_TARGET_PACK = {
  key: 'medium',
  credits: 50,
  label: 'Medium Pack',
  description: '50 credits for image upscaling',
} as const;
