import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { issueCheckoutRescueOffer } from '@server/services/checkout-rescue-offer.service';
import { isCheckoutRescueOfferEligiblePrice } from '@shared/config/checkout-rescue-offer';
import { resolvePriceId } from '@shared/config/stripe';
import type {
  ICheckoutRescueOfferRequest,
  ICheckoutRescueOfferResponse,
} from '@shared/types/checkout-offer';

async function getAuthenticatedUserId(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '');

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user.id;
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<ICheckoutRescueOfferResponse | { success: false; error: string }>> {
  try {
    const userId = await getAuthenticatedUserId(request);

    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as ICheckoutRescueOfferRequest;
    const priceId = body?.priceId;

    if (!priceId || !isCheckoutRescueOfferEligiblePrice(priceId)) {
      return NextResponse.json(
        { success: false, error: 'Price is not eligible for a rescue offer' },
        { status: 400 }
      );
    }

    // For subscription plan purchases only: block users who already have an active subscription.
    // Pack purchases are one-time payments — any user can buy them regardless of subscription status.
    const resolvedPrice = resolvePriceId(priceId);
    if (resolvedPrice?.type === 'plan') {
      const { data: existingSubscription } = await supabaseAdmin
        .from('subscriptions')
        .select('id')
        .eq('user_id', userId)
        .in('status', ['active', 'trialing'])
        .limit(1)
        .maybeSingle();

      if (existingSubscription) {
        return NextResponse.json(
          { success: false, error: 'Existing subscriptions are not eligible for this offer' },
          { status: 409 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      data: issueCheckoutRescueOffer({ userId, priceId }),
    });
  } catch (error) {
    console.error('[CHECKOUT_RESCUE_OFFER] Failed to issue rescue offer:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create rescue offer' },
      { status: 500 }
    );
  }
}
