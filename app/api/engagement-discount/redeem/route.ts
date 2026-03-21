/**
 * Engagement Discount Redeem API
 *
 * POST /api/engagement-discount/redeem
 *
 * Called by the Stripe webhook when a checkout session using the engagement
 * discount coupon is completed. Marks the discount as redeemed to prevent
 * future use.
 *
 * This endpoint is internal-only and should only be called by the webhook handler.
 *
 * @see docs/PRDs/engagement-based-first-purchase-discount.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { redeemDiscount, isDiscountValid } from '@server/services/engagement-discount.service';
import { trackServerEvent } from '@server/analytics';
import { serverEnv } from '@shared/config/env';
import { ENGAGEMENT_DISCOUNT_CONFIG } from '@shared/config/engagement-discount';
import type {
  IRedeemDiscountRequest,
  IRedeemDiscountResponse,
} from '@shared/types/engagement-discount';

/**
 * Internal endpoint to redeem an engagement discount.
 * Called by the Stripe webhook handler after successful purchase.
 */
export async function POST(request: NextRequest): Promise<NextResponse<IRedeemDiscountResponse>> {
  try {
    // Parse request body
    const body: IRedeemDiscountRequest = await request.json();
    const { userId, sessionId } = body;

    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing userId',
        },
        { status: 400 }
      );
    }

    // Verify discount is still valid before redeeming
    const validityCheck = await isDiscountValid(userId);
    if (!validityCheck.valid) {
      console.warn('[EngagementDiscount] Attempted to redeem invalid discount:', {
        userId,
        reason: validityCheck.reason,
      });
      return NextResponse.json(
        {
          success: false,
          error: `Discount not valid: ${validityCheck.reason}`,
        },
        { status: 400 }
      );
    }

    // Redeem the discount
    const result = await redeemDiscount(userId);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Failed to redeem discount',
        },
        { status: 500 }
      );
    }

    // Track analytics event
    const amountSaved =
      ENGAGEMENT_DISCOUNT_CONFIG.originalPriceCents -
      ENGAGEMENT_DISCOUNT_CONFIG.discountedPriceCents;
    await trackServerEvent(
      'engagement_discount_redeemed',
      {
        couponId: serverEnv.STRIPE_ENGAGEMENT_DISCOUNT_COUPON_ID || '',
        amountSavedCents: amountSaved,
        targetPackKey: ENGAGEMENT_DISCOUNT_CONFIG.targetPackKey,
        sessionId,
      },
      { apiKey: serverEnv.AMPLITUDE_API_KEY, userId }
    ).catch(err => {
      console.error('[EngagementDiscount] Failed to track redemption event:', err);
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('[EngagementDiscount] Error redeeming discount:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}
