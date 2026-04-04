/**
 * Recovery Discount Configuration
 *
 * Configuration for the abandoned checkout recovery discount system.
 * Uses Stripe coupons and promotion codes to provide one-time 10% discounts
 * for users who abandoned their checkout.
 */

export interface IRecoveryDiscountConfig {
  /** Discount percentage off the original price */
  percentOff: number;
  /** How long the discount applies ('once' = single use per customer) */
  duration: 'once' | 'repeating' | 'forever';
  /** Number of days until the promotion code expires */
  expiresAfterDays: number;
  /** Human-readable name for the coupon in Stripe dashboard */
  couponName: string;
  /** Metadata attached to the Stripe coupon for identification */
  couponMetadata: {
    type: string;
    reusable: string;
  };
  /** Prefix for generated promotion codes */
  codePrefix: string;
  /** Length of random suffix in promotion codes */
  codeRandomLength: number;
}

/**
 * Default configuration for recovery discounts.
 *
 * - 10% off, one-time use
 * - Expires 7 days after creation
 * - Unique code per abandoned checkout for tracking
 */
export const RECOVERY_DISCOUNT_CONFIG: IRecoveryDiscountConfig = {
  percentOff: 10,
  duration: 'once',
  expiresAfterDays: 7,
  couponName: 'Complete Your Purchase - 10% Off',
  couponMetadata: {
    type: 'abandoned_checkout_recovery',
    reusable: 'false',
  },
  codePrefix: 'RECOVER',
  codeRandomLength: 8,
} as const;

/**
 * Result of generating a recovery discount code
 */
export interface IRecoveryDiscountCode {
  /** The promotion code string (e.g., "RECOVER-abc12345") */
  code: string;
  /** Stripe promotion code ID (promo_xxx) */
  promotionCodeId: string;
  /** Base Stripe coupon ID (coupon_xxx) */
  couponId: string;
  /** The abandoned checkout ID this code is linked to */
  checkoutId: string;
  /** When this code expires */
  expiresAt: Date;
}

/**
 * Validation result for a recovery code
 */
export interface IRecoveryCodeValidation {
  /** Whether the code is valid and usable */
  isValid: boolean;
  /** Stripe promotion code ID if valid */
  promotionCodeId?: string;
  /** Base coupon ID if valid */
  couponId?: string;
  /** Reason for invalidity if not valid */
  error?: 'not_found' | 'expired' | 'already_used' | 'inactive';
}
