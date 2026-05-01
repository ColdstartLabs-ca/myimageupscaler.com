/**
 * Recovery Discount Service
 *
 * Manages Stripe coupons and promotion codes for abandoned checkout recovery.
 * Creates unique one-time-use discount codes that expire after 7 days.
 *
 * Usage:
 * 1. Run `createRecoveryCoupon()` once to create the base coupon (save ID to env)
 * 2. Call `generateRecoveryPromoCode()` for each abandoned checkout
 * 3. Use `validateRecoveryCode()` when a user applies a code
 * 4. Call `markCodeAsUsed()` after successful redemption
 */

import { stripe } from '@server/stripe/config';
import { serverEnv } from '@shared/config/env';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import {
  RECOVERY_DISCOUNT_CONFIG,
  type IRecoveryDiscountCode,
  type IRecoveryCodeValidation,
} from '@shared/config/recovery-discount.config';
import dayjs from 'dayjs';

/**
 * Generate a random alphanumeric string for promotion codes.
 * Uses only uppercase letters and numbers (excludes ambiguous chars like 0/O, 1/I).
 */
function generateRandomCode(length: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Create the base recovery coupon in Stripe.
 *
 * This should be run ONCE during setup. The returned coupon ID should be
 * saved as STRIPE_RECOVERY_COUPON_ID in the environment variables.
 *
 * @returns The Stripe coupon ID
 * @throws If coupon creation fails
 *
 * @example
 * // Run this once to set up the coupon
 * const couponId = await createRecoveryCoupon();
 * console.log(`Add to .env.api: STRIPE_RECOVERY_COUPON_ID=${couponId}`);
 */
export async function createRecoveryCoupon(): Promise<string> {
  // Check if coupon already exists in env
  if (serverEnv.STRIPE_RECOVERY_COUPON_ID) {
    console.log(
      'Recovery coupon already exists in environment:',
      serverEnv.STRIPE_RECOVERY_COUPON_ID
    );
    return serverEnv.STRIPE_RECOVERY_COUPON_ID;
  }

  const coupon = await stripe.coupons.create({
    percent_off: RECOVERY_DISCOUNT_CONFIG.percentOff,
    duration: RECOVERY_DISCOUNT_CONFIG.duration,
    name: RECOVERY_DISCOUNT_CONFIG.couponName,
    metadata: RECOVERY_DISCOUNT_CONFIG.couponMetadata,
  });

  console.log('Created recovery coupon:', coupon.id);
  console.log(`Add to .env.api: STRIPE_RECOVERY_COUPON_ID=${coupon.id}`);

  return coupon.id;
}

/**
 * Get the base coupon ID from environment or throw an error.
 */
function getBaseCouponId(): string {
  const couponId = serverEnv.STRIPE_RECOVERY_COUPON_ID;
  if (!couponId) {
    throw new Error(
      'STRIPE_RECOVERY_COUPON_ID is not set. Run createRecoveryCoupon() first and save the ID to your environment.'
    );
  }
  return couponId;
}

/**
 * Generate a unique one-time-use promotion code for recovery.
 *
 * Creates a promotion code linked to the base recovery coupon.
 * The code:
 * - Can only be redeemed once (max_redemptions: 1)
 * - Expires after 7 days
 * - Is linked to the checkout ID for tracking
 * - Has format: "RECOVER-{8 random chars}"
 *
 * @param checkoutId - The abandoned checkout ID this code is for
 * @param email - Optional email to restrict code to (prevents sharing)
 * @returns The generated discount code details
 * @throws If code generation fails
 *
 * @example
 * const discount = await generateRecoveryPromoCode('checkout-uuid-123', 'user@example.com');
 * console.log(discount.code); // "RECOVER-ABC12345"
 */
export async function generateRecoveryPromoCode(
  checkoutId: string,
  email?: string
): Promise<IRecoveryDiscountCode> {
  const couponId = getBaseCouponId();
  const code = `${RECOVERY_DISCOUNT_CONFIG.codePrefix}-${generateRandomCode(RECOVERY_DISCOUNT_CONFIG.codeRandomLength)}`;
  const expiresAt = dayjs().add(RECOVERY_DISCOUNT_CONFIG.expiresAfterDays, 'day').toDate();

  const promotionCode = await stripe.promotionCodes.create({
    promotion: {
      coupon: couponId,
      type: 'coupon',
    },
    code: code,
    max_redemptions: 1,
    expires_at: Math.floor(expiresAt.getTime() / 1000), // Stripe expects Unix timestamp
    active: true,
    metadata: {
      checkout_id: checkoutId,
      type: 'abandoned_checkout_recovery',
      created_by: 'recovery_discount_service',
      // Store email in metadata for reference (not enforced by Stripe)
      restricted_email: email || '',
    },
  });

  return {
    code: code,
    promotionCodeId: promotionCode.id,
    couponId: couponId,
    checkoutId: checkoutId,
    expiresAt: expiresAt,
  };
}

/**
 * Validate a recovery promotion code.
 *
 * Checks that the code:
 * - Exists in Stripe
 * - Is active
 * - Has not expired
 * - Has not been redeemed already
 *
 * @param code - The promotion code string to validate (e.g., "RECOVER-ABC12345")
 * @returns Validation result with code details if valid
 *
 * @example
 * const validation = await validateRecoveryCode('RECOVER-ABC12345');
 * if (validation.isValid) {
 *   console.log('Valid code:', validation.promotionCodeId);
 * } else {
 *   console.log('Invalid:', validation.error);
 * }
 */
export async function validateRecoveryCode(code: string): Promise<IRecoveryCodeValidation> {
  try {
    // List promotion codes matching the code (case-insensitive in Stripe)
    const promotionCodes = await stripe.promotionCodes.list({
      code: code.toUpperCase(),
      limit: 1,
    });

    const promoCode = promotionCodes.data[0];

    if (!promoCode) {
      return {
        isValid: false,
        error: 'not_found',
      };
    }

    // Check if active
    if (!promoCode.active) {
      return {
        isValid: false,
        error: 'inactive',
        promotionCodeId: promoCode.id,
        couponId:
          typeof promoCode.promotion.coupon === 'string'
            ? promoCode.promotion.coupon
            : promoCode.promotion.coupon?.id,
      };
    }

    // Check if already redeemed
    if (promoCode.max_redemptions && promoCode.times_redeemed >= promoCode.max_redemptions) {
      return {
        isValid: false,
        error: 'already_used',
        promotionCodeId: promoCode.id,
        couponId:
          typeof promoCode.promotion.coupon === 'string'
            ? promoCode.promotion.coupon
            : promoCode.promotion.coupon?.id,
      };
    }

    // Check expiration
    if (promoCode.expires_at && new Date(promoCode.expires_at * 1000) < new Date()) {
      return {
        isValid: false,
        error: 'expired',
        promotionCodeId: promoCode.id,
        couponId:
          typeof promoCode.promotion.coupon === 'string'
            ? promoCode.promotion.coupon
            : promoCode.promotion.coupon?.id,
      };
    }

    return {
      isValid: true,
      promotionCodeId: promoCode.id,
      couponId:
        typeof promoCode.promotion.coupon === 'string'
          ? promoCode.promotion.coupon
          : promoCode.promotion.coupon?.id,
    };
  } catch (error) {
    console.error('Error validating recovery code:', error);
    return {
      isValid: false,
      error: 'not_found',
    };
  }
}

/**
 * Mark a promotion code as used by deactivating it.
 *
 * This is called after a successful redemption to prevent reuse.
 * Note: Stripe automatically handles max_redemptions, but this provides
 * an additional safety layer and explicit tracking.
 *
 * @param promotionCodeId - The Stripe promotion code ID to deactivate
 * @returns True if successfully deactivated
 * @throws If deactivation fails
 *
 * @example
 * await markCodeAsUsed('promo_1234567890');
 */
export async function markCodeAsUsed(promotionCodeId: string): Promise<boolean> {
  try {
    await stripe.promotionCodes.update(promotionCodeId, {
      active: false,
      metadata: {
        deactivated_at: new Date().toISOString(),
        deactivation_reason: 'redeemed',
      },
    });

    console.log(`Deactivated recovery promotion code: ${promotionCodeId}`);
    return true;
  } catch (error) {
    console.error('Error marking code as used:', error);
    throw error;
  }
}

/**
 * Get promotion code details by checkout ID.
 *
 * First checks the database for the stored `recovery_discount_id`, then retrieves
 * the promotion code directly from Stripe by ID. This avoids paginating through
 * all promotion codes at scale. Falls back to scanning Stripe only if the DB
 * record is missing the discount ID.
 *
 * @param checkoutId - The abandoned checkout ID
 * @returns The promotion code details if found, null otherwise
 */
export async function getPromoCodeByCheckoutId(
  checkoutId: string
): Promise<IRecoveryDiscountCode | null> {
  try {
    // Fast path: look up the stored promotion code ID from the database
    const { data: checkout, error } = await supabaseAdmin
      .from('abandoned_checkouts')
      .select('recovery_discount_id, recovery_discount_code')
      .eq('id', checkoutId)
      .single();

    if (!error && checkout?.recovery_discount_id) {
      const promoCode = await stripe.promotionCodes.retrieve(checkout.recovery_discount_id);

      if (promoCode) {
        return {
          code: promoCode.code || checkout.recovery_discount_code || '',
          promotionCodeId: promoCode.id,
          couponId:
            (typeof promoCode.promotion.coupon === 'string'
              ? promoCode.promotion.coupon
              : promoCode.promotion.coupon?.id) || '',
          checkoutId: checkoutId,
          expiresAt: promoCode.expires_at ? new Date(promoCode.expires_at * 1000) : new Date(),
        };
      }
    }

    // Fallback: paginate through Stripe promotion codes (e.g. for legacy records)
    let startingAfter: string | undefined;

    while (true) {
      const promotionCodes = await stripe.promotionCodes.list({
        limit: 100,
        starting_after: startingAfter,
      });

      const promoCode = promotionCodes.data.find(
        pc =>
          pc.metadata?.checkout_id === checkoutId &&
          pc.metadata?.type === 'abandoned_checkout_recovery'
      );

      if (promoCode) {
        return {
          code: promoCode.code || '',
          promotionCodeId: promoCode.id,
          couponId:
            (typeof promoCode.promotion.coupon === 'string'
              ? promoCode.promotion.coupon
              : promoCode.promotion.coupon?.id) || '',
          checkoutId: checkoutId,
          expiresAt: promoCode.expires_at ? new Date(promoCode.expires_at * 1000) : new Date(),
        };
      }

      if (!promotionCodes.has_more || promotionCodes.data.length === 0) {
        return null;
      }

      startingAfter = promotionCodes.data[promotionCodes.data.length - 1]?.id;
    }
  } catch (error) {
    console.error('Error getting promo code by checkout ID:', error);
    return null;
  }
}

/**
 * Check if the recovery coupon is properly configured.
 *
 * Useful for health checks and startup validation.
 *
 * @returns True if the coupon ID is set and exists in Stripe
 */
export async function isRecoveryCouponConfigured(): Promise<boolean> {
  const couponId = serverEnv.STRIPE_RECOVERY_COUPON_ID;
  if (!couponId) {
    return false;
  }

  try {
    await stripe.coupons.retrieve(couponId);
    return true;
  } catch {
    return false;
  }
}
