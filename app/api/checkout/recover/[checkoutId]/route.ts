/**
 * API Endpoint: Recover Abandoned Checkout
 *
 * GET /api/checkout/recover/[checkoutId]
 *
 * Retrieves abandoned checkout data for cart restoration.
 * Used when a user clicks a recovery link in an email.
 *
 * Response: IRecoveryResponse
 *
 * @see docs/PRDs/checkout-recovery-system.md Phase 7
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { trackServerEvent } from '@server/analytics';
import { serverEnv } from '@shared/config/env';
import type { IRecoveryResponse } from '@shared/types/abandoned-checkout.types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ checkoutId: string }> }
) {
  const { checkoutId } = await params;

  if (!checkoutId) {
    return NextResponse.json<IRecoveryResponse>(
      {
        success: false,
        error: {
          code: 'MISSING_CHECKOUT_ID',
          message: 'checkoutId is required',
        },
      },
      { status: 400 }
    );
  }

  try {
    // Fetch abandoned checkout
    const { data: checkout, error } = await supabaseAdmin
      .from('abandoned_checkouts')
      .select('*')
      .eq('id', checkoutId)
      .single();

    if (error || !checkout) {
      return NextResponse.json<IRecoveryResponse>(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Abandoned checkout not found',
          },
        },
        { status: 404 }
      );
    }

    // Check if checkout is already recovered
    if (checkout.status === 'recovered') {
      return NextResponse.json<IRecoveryResponse>({
        success: false,
        error: {
          code: 'ALREADY_RECOVERED',
          message: 'This checkout has already been recovered',
        },
        data: {
          cartData: checkout.cart_data,
          discountCode: checkout.recovery_discount_code,
          isValid: false,
        },
      });
    }

    // Check if checkout has an invalid status (bounced, etc.)
    if (checkout.status !== 'pending' && checkout.status !== 'expired') {
      return NextResponse.json<IRecoveryResponse>({
        success: false,
        error: {
          code: 'INVALID_STATUS',
          message: `Checkout has invalid status: ${checkout.status}`,
        },
        data: {
          cartData: checkout.cart_data,
          discountCode: checkout.recovery_discount_code,
          isValid: false,
        },
      });
    }

    // Check if checkout is expired (7 days)
    const createdAt = new Date(checkout.created_at);
    const expiresAt = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    const isExpired = new Date() > expiresAt;

    if (isExpired) {
      // Update status to expired
      await supabaseAdmin
        .from('abandoned_checkouts')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('id', checkoutId);

      return NextResponse.json<IRecoveryResponse>({
        success: false,
        error: {
          code: 'EXPIRED',
          message: 'This checkout has expired (older than 7 days)',
        },
        data: {
          cartData: checkout.cart_data,
          discountCode: checkout.recovery_discount_code,
          isValid: false,
        },
      });
    }

    // Track recovery link clicked
    await trackServerEvent(
      'recovery_link_clicked',
      {
        checkoutId,
        hasDiscount: Boolean(checkout.recovery_discount_code),
      },
      { apiKey: serverEnv.AMPLITUDE_API_KEY, userId: checkout.user_id }
    );

    return NextResponse.json<IRecoveryResponse>({
      success: true,
      data: {
        cartData: checkout.cart_data,
        discountCode: checkout.recovery_discount_code,
        isValid: true,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error recovering checkout:', error);
    return NextResponse.json<IRecoveryResponse>(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      },
      { status: 500 }
    );
  }
}
