/**
 * Engagement-Based First-Purchase Discount Types
 *
 * Type definitions for tracking user engagement and offering
 * first-purchase discounts to highly-engaged free users.
 *
 * @see docs/PRDs/engagement-based-first-purchase-discount.md
 */

/**
 * Engagement signals tracked per session.
 */
export interface IEngagementSignals {
  /** Number of upscales completed in this session */
  upscales: number;
  /** Number of downloads completed in this session */
  downloads: number;
  /** Number of times the user switched AI models */
  modelSwitches: number;
  /** Timestamp when the session started (for TTL purposes) */
  sessionStartedAt: number;
}

/**
 * Thresholds for each engagement signal.
 */
export interface IEngagementThresholds {
  upscales: number;
  downloads: number;
  modelSwitches: number;
}

/**
 * Status of each engagement threshold.
 */
export interface IThresholdsStatus {
  upscales: boolean;
  downloads: boolean;
  modelSwitches: boolean;
}

/**
 * Result of checking engagement eligibility.
 */
export interface IEngagementEligibilityResult {
  /** Whether the user is eligible for the discount offer */
  isEligible: boolean;
  /** Number of thresholds met */
  thresholdsMet: number;
  /** Status of each individual threshold */
  thresholdsStatus: IThresholdsStatus;
  /** Whether the user has already been offered the discount */
  alreadyOffered?: boolean;
  /** Whether the user has previously purchased (not a first-time buyer) */
  hasPurchased?: boolean;
}

/**
 * Discount offer details.
 */
export interface IDiscountOffer {
  /** User ID this offer belongs to */
  userId: string;
  /** When the offer was made (ISO 8601) */
  offeredAt: string;
  /** When the offer expires (ISO 8601) */
  expiresAt: string;
  /** Discount percentage (e.g., 20 for 20% off) */
  discountPercent: number;
  /** Target credit pack key */
  targetPackKey: string;
  /** Original price in cents */
  originalPriceCents: number;
  /** Discounted price in cents */
  discountedPriceCents: number;
  /** Whether this offer has been redeemed */
  redeemed: boolean;
  /** Stripe coupon ID applied */
  couponId?: string;
}

/**
 * Client-side state for the engagement discount feature.
 */
export interface IEngagementDiscountState {
  /** Current session engagement signals */
  signals: IEngagementSignals;
  /** Whether eligibility has been checked this session */
  hasCheckedEligibility: boolean;
  /** Whether the user is eligible for the discount */
  isEligible: boolean;
  /** Whether the toast is currently visible */
  showToast: boolean;
  /** Current discount offer, if any */
  offer: IDiscountOffer | null;
  /** Whether the toast was dismissed this session */
  wasDismissed: boolean;
  /** Countdown end time (timestamp) */
  countdownEndTime: number | null;
}

/**
 * Server-side eligibility check response.
 */
export interface IEligibilityCheckResponse {
  /** Whether the user is eligible */
  eligible: boolean;
  /** Reason for ineligibility, if applicable */
  reason?: 'already_offered' | 'already_purchased' | 'not_free_user' | 'not_authenticated';
  /** When the discount expires (if eligible) */
  discountExpiresAt?: string;
  /** Stripe coupon ID to apply at checkout */
  couponId?: string;
  /** Discount percentage */
  discountPercent?: number;
  /** Target pack key */
  targetPackKey?: string;
}

/**
 * Request body for redeeming a discount.
 */
export interface IRedeemDiscountRequest {
  /** User ID redeeming the discount */
  userId: string;
  /** Stripe checkout session ID */
  sessionId: string;
}

/**
 * Response for discount redemption.
 */
export interface IRedeemDiscountResponse {
  /** Whether the redemption was successful */
  success: boolean;
  /** Error message if redemption failed */
  error?: string;
}

/**
 * Profile row fields related to engagement discount.
 */
export interface IEngagementDiscountProfileFields {
  /** When the engagement discount was offered (ISO 8601 or null) */
  engagement_discount_offered_at: string | null;
  /** When the engagement discount expires (ISO 8601 or null) */
  engagement_discount_expires_at: string | null;
}

/**
 * Analytics event properties for engagement discount events.
 */
export interface IEngagementDiscountEligibleProperties {
  /** Number of thresholds met */
  thresholdsMet: number;
  /** Which thresholds were met */
  thresholdsStatus: IThresholdsStatus;
}

export interface IEngagementDiscountToastShownProperties {
  /** Discount amount (e.g., 20 for 20% off) */
  discountPercent: number;
  /** Original price in cents */
  originalPriceCents: number;
  /** Discounted price in cents */
  discountedPriceCents: number;
}

export interface IEngagementDiscountToastDismissedProperties {
  /** Time remaining in seconds when dismissed */
  timeRemainingSeconds: number;
}

export interface IEngagementDiscountCtaClickedProperties {
  /** Time remaining in seconds when clicked */
  timeRemainingSeconds: number;
}

export interface IEngagementDiscountCheckoutStartedProperties {
  /** Stripe coupon ID */
  couponId: string;
  /** Target pack key */
  targetPackKey: string;
}

export interface IEngagementDiscountRedeemedProperties {
  /** Stripe coupon ID */
  couponId: string;
  /** Amount saved in cents */
  amountSavedCents: number;
  /** Target pack key */
  targetPackKey: string;
}
