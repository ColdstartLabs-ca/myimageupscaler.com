/**
 * API Endpoint: Create Abandoned Checkout Record
 *
 * POST /api/checkout/abandoned
 *
 * Creates an abandoned checkout record when an anonymous user shows
 * purchase intent (e.g., clicks "Upgrade", enters email).
 *
 * Request body: ICreateAbandonedCheckoutRequest
 * Response: { success: true, data: { checkoutId: string } }
 *
 * @see docs/PRDs/checkout-recovery-system.md Phase 1B
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { trackServerEvent } from '@server/analytics';
import { serverEnv } from '@shared/config/env';
import type {
  ICreateAbandonedCheckoutRequest,
  PurchaseType,
} from '@shared/types/abandoned-checkout.types';

const VALID_PURCHASE_TYPES: PurchaseType[] = ['subscription', 'credit_pack'];

export async function POST(request: NextRequest) {
  try {
    const body: ICreateAbandonedCheckoutRequest = await request.json();

    // Validate required fields
    if (!body.priceId) {
      return NextResponse.json({ success: false, error: 'priceId is required' }, { status: 400 });
    }

    if (!body.purchaseType || !VALID_PURCHASE_TYPES.includes(body.purchaseType)) {
      return NextResponse.json(
        { success: false, error: 'purchaseType must be "subscription" or "credit_pack"' },
        { status: 400 }
      );
    }

    // Create abandoned checkout record
    const { data, error } = await supabaseAdmin
      .from('abandoned_checkouts')
      .insert({
        user_id: body.userId ?? null,
        email: body.email ?? null,
        price_id: body.priceId,
        purchase_type: body.purchaseType,
        plan_key: body.planKey ?? null,
        pack_key: body.packKey ?? null,
        pricing_region: body.pricingRegion ?? 'standard',
        discount_percent: body.discountPercent ?? 0,
        cart_data: {
          priceId: body.priceId,
          purchaseType: body.purchaseType,
          planKey: body.planKey,
          packKey: body.packKey,
          pricingRegion: body.pricingRegion ?? 'standard',
          discountPercent: body.discountPercent ?? 0,
          originalAmountCents: body.originalAmountCents ?? 0,
          currency: body.currency ?? 'USD',
          createdAt: new Date().toISOString(),
        },
        status: 'pending',
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to create abandoned checkout:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to create abandoned checkout' },
        { status: 500 }
      );
    }

    // Track analytics
    await trackServerEvent(
      'checkout_abandoned',
      {
        checkoutId: data.id,
        hasEmail: Boolean(body.email),
        purchaseType: body.purchaseType,
        planKey: body.planKey,
        packKey: body.packKey,
      },
      { apiKey: serverEnv.AMPLITUDE_API_KEY, userId: body.userId }
    );

    return NextResponse.json({
      success: true,
      data: {
        checkoutId: data.id,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error creating abandoned checkout:', error);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
