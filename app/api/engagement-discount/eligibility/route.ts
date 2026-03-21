/**
 * Engagement Discount Eligibility API
 *
 * GET /api/engagement-discount/eligibility
 *
 * Checks if the authenticated user is eligible for the engagement-based
 * first-purchase discount. If eligible, records the offer in the database
 * and returns the discount details including Stripe coupon ID.
 *
 * Eligibility criteria:
 * - User is authenticated
 * - User is on free tier (no active subscription)
 * - User has never been offered this discount before
 *
 * @see docs/PRDs/engagement-based-first-purchase-discount.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { checkEligibility, offerDiscount } from '@server/services/engagement-discount.service';
import { trackServerEvent } from '@server/analytics';
import { serverEnv } from '@shared/config/env';
import type { IEligibilityCheckResponse } from '@shared/types/engagement-discount';

/**
 * Extract and validate the user from the Authorization header.
 */
async function getAuthenticatedUser(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '');

  // Handle test mode
  if (serverEnv.ENV === 'test' && token.startsWith('test_token_')) {
    const mockUserId = token.replace('test_token_', '').replace('mock_user_', '');
    return mockUserId;
  }

  try {
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      return null;
    }
    return user.id;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest): Promise<NextResponse<IEligibilityCheckResponse>> {
  try {
    // 1. Authenticate user
    const userId = await getAuthenticatedUser(request);
    if (!userId) {
      return NextResponse.json(
        {
          eligible: false,
          reason: 'not_authenticated',
        },
        { status: 401 }
      );
    }

    // 2. Check eligibility
    const eligibility = await checkEligibility(userId);

    if (!eligibility.eligible) {
      return NextResponse.json(eligibility);
    }

    // 3. Offer the discount (record in database)
    const offer = await offerDiscount(userId);

    if (!offer) {
      // Race condition - another request already offered the discount
      return NextResponse.json({
        eligible: false,
        reason: 'already_offered',
      });
    }

    // 4. Track analytics event
    await trackServerEvent(
      'engagement_discount_eligible',
      {
        discountPercent: offer.discountPercent,
        targetPackKey: offer.targetPackKey,
      },
      { apiKey: serverEnv.AMPLITUDE_API_KEY, userId }
    ).catch(err => {
      // Non-blocking - don't fail the request if analytics fails
      console.error('[EngagementDiscount] Failed to track eligibility event:', err);
    });

    // 5. Return success with offer details
    return NextResponse.json({
      eligible: true,
      discountExpiresAt: offer.expiresAt,
      couponId: offer.couponId,
      discountPercent: offer.discountPercent,
      targetPackKey: offer.targetPackKey,
      originalPriceCents: offer.originalPriceCents,
      discountedPriceCents: offer.discountedPriceCents,
    });
  } catch (error) {
    console.error('[EngagementDiscount] Error checking eligibility:', error);
    return NextResponse.json(
      {
        eligible: false,
        reason: 'not_authenticated',
      },
      { status: 500 }
    );
  }
}
