/**
 * Engagement-Based First-Purchase Discount Service
 *
 * Server-side business logic for:
 * - Checking eligibility (free user, never offered before)
 * - Recording when discount is offered
 * - Redeeming discount after successful purchase
 * - Validating discount is still within 30-min window
 *
 * @see docs/PRDs/engagement-based-first-purchase-discount.md
 */

import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { serverEnv } from '@shared/config/env';
import { ENGAGEMENT_DISCOUNT_CONFIG } from '@shared/config/engagement-discount';
import type { IEligibilityCheckResponse, IDiscountOffer } from '@shared/types/engagement-discount';

/**
 * Check if a user is eligible for the engagement discount.
 *
 * Eligibility criteria:
 * 1. User is authenticated
 * 2. User is on free tier (no active subscription, never purchased)
 * 3. User has never been offered the discount before
 */
export async function checkEligibility(userId: string): Promise<IEligibilityCheckResponse> {
  if (!userId) {
    return {
      eligible: false,
      reason: 'not_authenticated',
    };
  }

  // Fetch user profile to check eligibility
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select(
      `
      subscription_status,
      engagement_discount_offered_at,
      engagement_discount_expires_at
    `
    )
    .eq('id', userId)
    .single();

  if (error || !profile) {
    console.error('[EngagementDiscount] Error fetching profile:', error);
    return {
      eligible: false,
      reason: 'not_authenticated',
    };
  }

  // Check if user already has a subscription (not a free user)
  const hasSubscription = ['active', 'trialing'].includes(profile.subscription_status);
  if (hasSubscription) {
    return {
      eligible: false,
      reason: 'not_free_user',
    };
  }

  // Check if discount was already offered
  if (profile.engagement_discount_offered_at) {
    return {
      eligible: false,
      reason: 'already_offered',
    };
  }

  // User is eligible!
  return {
    eligible: true,
    couponId: serverEnv.STRIPE_ENGAGEMENT_DISCOUNT_COUPON_ID || undefined,
    discountPercent: ENGAGEMENT_DISCOUNT_CONFIG.discountPercent,
    targetPackKey: ENGAGEMENT_DISCOUNT_CONFIG.targetPackKey,
  };
}

/**
 * Record that a discount has been offered to a user.
 * Sets the offered_at and expires_at timestamps on the profile.
 *
 * @returns The discount offer details, or null if failed
 */
export async function offerDiscount(userId: string): Promise<IDiscountOffer | null> {
  if (!userId) {
    console.error('[EngagementDiscount] Cannot offer discount without userId');
    return null;
  }

  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + ENGAGEMENT_DISCOUNT_CONFIG.offerValidityMinutes * 60 * 1000
  );

  const { data: updatedRows, error } = await supabaseAdmin
    .from('profiles')
    .update({
      engagement_discount_offered_at: now.toISOString(),
      engagement_discount_expires_at: expiresAt.toISOString(),
    })
    .eq('id', userId)
    .is('engagement_discount_offered_at', null) // Only update if not already set (compare-and-swap)
    .select('id');

  if (error) {
    console.error('[EngagementDiscount] Error offering discount:', error);
    return null;
  }

  // No rows updated = race condition (another request already set offered_at)
  if (!updatedRows || updatedRows.length === 0) {
    console.log('[EngagementDiscount] Discount already offered to user (race condition):', userId);
    return null;
  }

  return {
    userId,
    offeredAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    discountPercent: ENGAGEMENT_DISCOUNT_CONFIG.discountPercent,
    targetPackKey: ENGAGEMENT_DISCOUNT_CONFIG.targetPackKey,
    originalPriceCents: ENGAGEMENT_DISCOUNT_CONFIG.originalPriceCents,
    discountedPriceCents: ENGAGEMENT_DISCOUNT_CONFIG.discountedPriceCents,
    redeemed: false,
    couponId: serverEnv.STRIPE_ENGAGEMENT_DISCOUNT_COUPON_ID || undefined,
  };
}

/**
 * Check if a user's discount is still valid (within the 30-min window).
 */
export async function isDiscountValid(userId: string): Promise<{
  valid: boolean;
  expiresAt?: string;
  reason?: 'not_offered' | 'expired' | 'redeemed';
}> {
  if (!userId) {
    return { valid: false, reason: 'not_offered' };
  }

  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('engagement_discount_offered_at, engagement_discount_expires_at')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    return { valid: false, reason: 'not_offered' };
  }

  // Never offered
  if (!profile.engagement_discount_offered_at) {
    return { valid: false, reason: 'not_offered' };
  }

  // Check if expired
  const expiresAt = new Date(profile.engagement_discount_expires_at);
  if (expiresAt < new Date()) {
    return { valid: false, reason: 'expired' };
  }

  return {
    valid: true,
    expiresAt: profile.engagement_discount_expires_at || undefined,
  };
}

/**
 * Redeem a discount after successful purchase.
 * Clears the expires_at timestamp to mark it as redeemed.
 */
export async function redeemDiscount(userId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  if (!userId) {
    return { success: false, error: 'No user ID provided' };
  }

  // Verify discount is still valid before redeeming
  const validityCheck = await isDiscountValid(userId);
  if (!validityCheck.valid) {
    return {
      success: false,
      error: validityCheck.reason || 'Discount not valid',
    };
  }

  // Mark as redeemed by clearing expires_at (keeps offered_at for audit)
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({
      engagement_discount_expires_at: null,
    })
    .eq('id', userId);

  if (error) {
    console.error('[EngagementDiscount] Error redeeming discount:', error);
    return { success: false, error: 'Failed to redeem discount' };
  }

  console.log('[EngagementDiscount] Discount redeemed for user:', userId);
  return { success: true };
}

/**
 * Get the Stripe coupon ID for the engagement discount.
 * Returns null if not configured.
 */
export function getEngagementCouponId(): string | null {
  const couponId = serverEnv.STRIPE_ENGAGEMENT_DISCOUNT_COUPON_ID;
  if (!couponId || couponId.trim() === '') {
    console.warn('[EngagementDiscount] STRIPE_ENGAGEMENT_DISCOUNT_COUPON_ID not configured');
    return null;
  }
  return couponId;
}

/**
 * Calculate the discounted price based on regional pricing + engagement discount.
 * The engagement discount stacks on top of regional discounts.
 *
 * @param basePriceCents - Original base price in cents
 * @param regionalDiscountPercent - Regional discount percentage (e.g., 65 for 65% off)
 * @param engagementDiscountPercent - Engagement discount percentage (e.g., 20 for 20% off)
 * @returns Final price in cents after both discounts
 */
export function calculateStackedDiscount(
  basePriceCents: number,
  regionalDiscountPercent: number,
  engagementDiscountPercent: number
): number {
  // First apply regional discount
  const afterRegional = basePriceCents * (1 - regionalDiscountPercent / 100);
  // Then apply engagement discount on top
  const finalPrice = afterRegional * (1 - engagementDiscountPercent / 100);
  return Math.round(finalPrice);
}

/**
 * Get the engagement discount configuration for client-side use.
 */
export function getEngagementDiscountConfig(): typeof ENGAGEMENT_DISCOUNT_CONFIG {
  return ENGAGEMENT_DISCOUNT_CONFIG;
}
