import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@server/stripe';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { serverEnv } from '@shared/config/env';
import { getPlanForPriceId, assertKnownPriceId, resolvePriceId } from '@shared/config/stripe';
import type { ISubscriptionPlanMetadata } from '@shared/config/stripe';
import { getPlanByPriceId } from '@shared/config/subscription.utils';
import dayjs from 'dayjs';

export const runtime = 'edge';

interface IPreviewChangeRequest {
  targetPriceId: string;
}

interface IPreviewChangeResponse {
  proration: {
    amount_due: number; // in cents, can be negative (credit) or positive (charge)
    currency: string;
    period_start: string;
    period_end: string;
  };
  current_plan: {
    name: string;
    price_id: string;
    credits_per_month: number;
  } | null;
  new_plan: {
    name: string;
    price_id: string;
    credits_per_month: number;
  };
  effective_immediately: boolean;
  effective_date?: string; // For scheduled downgrades
  is_downgrade: boolean;
}

/**
 * Check if this is a downgrade (fewer credits in new plan)
 * Uses unified resolver for consistent credit calculations
 */
function isDowngrade(currentPriceId: string | null, targetPriceId: string): boolean {
  if (!currentPriceId) return false;

  try {
    // Use unified resolver for consistent credit calculations
    const currentResolved = assertKnownPriceId(currentPriceId);
    const targetResolved = assertKnownPriceId(targetPriceId);

    // Both should be plans for subscription changes
    if (currentResolved.type !== 'plan' || targetResolved.type !== 'plan') {
      console.warn('[PREVIEW_CHANGE] Non-plan price IDs in subscription preview:', {
        currentPriceId,
        currentType: currentResolved.type,
        targetPriceId,
        targetType: targetResolved.type,
      });
      return false;
    }

    // Compare credits directly from unified resolver
    return targetResolved.credits < currentResolved.credits;
  } catch (error) {
    console.error('[PREVIEW_CHANGE] Error resolving price IDs for downgrade check:', {
      error: error instanceof Error ? error.message : error,
      currentPriceId,
      targetPriceId,
    });
    // Fallback to legacy method if unified resolver fails
    const currentPlan = getPlanForPriceId(currentPriceId);
    const targetPlan = getPlanForPriceId(targetPriceId);
    if (!currentPlan || !targetPlan) return false;
    return targetPlan.creditsPerMonth < currentPlan.creditsPerMonth;
  }
}

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Missing authorization header'
          }
        },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid authentication token'
          }
        },
        { status: 401 }
      );
    }

    // 2. Parse and validate request body
    let body: IPreviewChangeRequest;
    try {
      const text = await request.text();
      body = JSON.parse(text) as IPreviewChangeRequest;
    } catch (parseError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_JSON',
            message: 'Invalid JSON in request body'
          }
        },
        { status: 400 }
      );
    }

    if (!body.targetPriceId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'MISSING_PRICE_ID',
            message: 'targetPriceId is required'
          }
        },
        { status: 400 }
      );
    }

    // 3. Validate target price ID using unified resolver
    let targetPlan = null;
    let resolvedTarget = null;

    try {
      resolvedTarget = assertKnownPriceId(body.targetPriceId);
      if (resolvedTarget.type !== 'plan') {
        throw new Error(`Price ID ${body.targetPriceId} is not a subscription plan`);
      }
      // Still get legacy plan format for compatibility with existing code
      targetPlan = getPlanForPriceId(body.targetPriceId);
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_PRICE_ID',
            message: error instanceof Error ? error.message : 'Invalid or unsupported price ID'
          }
        },
        { status: 400 }
      );
    }

    // 4. Get user's current subscription
    const { data: currentSubscription, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Return 400 if no active subscription (same as change endpoint)
    if (subError || !currentSubscription) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NO_ACTIVE_SUBSCRIPTION',
            message: 'No active subscription found. Use checkout endpoint instead.',
          },
        },
        { status: 400 }
      );
    }

    const currentPriceId = currentSubscription.price_id;

    // Get current plan metadata using unified resolver
    let currentPlan = null;
    let resolvedCurrent = null;

    if (currentPriceId) {
      try {
        resolvedCurrent = assertKnownPriceId(currentPriceId);
        if (resolvedCurrent.type !== 'plan') {
          console.warn('[PREVIEW_CHANGE] Current subscription price ID is not a plan:', currentPriceId);
        } else {
          // Still get legacy plan format for compatibility
          currentPlan = getPlanForPriceId(currentPriceId);
        }
      } catch (error) {
        console.error('[PREVIEW_CHANGE] Error resolving current plan:', {
          error: error instanceof Error ? error.message : error,
          priceId: currentPriceId,
        });
      }
    }

    // 5. Check if this is actually a change
    if (currentPriceId === body.targetPriceId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SAME_PLAN',
            message: 'Target plan is the same as current plan'
          }
        },
        { status: 400 }
      );
    }

    // 6. Get user's Stripe customer ID
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.stripe_customer_id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'STRIPE_CUSTOMER_NOT_FOUND',
            message: 'User has no Stripe customer ID'
          }
        },
        { status: 400 }
      );
    }

    // 7. Check if this is a downgrade
    const isDowngradeChange = isDowngrade(currentPriceId, body.targetPriceId);
    let effectiveDate: string | undefined;

    // 8. Calculate proration (only for upgrades)
    let prorationResult: IPreviewChangeResponse['proration'] = {
      amount_due: 0,
      currency: 'usd',
      period_start: dayjs().toISOString(),
      period_end: dayjs().toISOString(),
    };

    // Check if we're in test mode
    if (serverEnv.STRIPE_SECRET_KEY?.includes('dummy_key') || serverEnv.ENV === 'test') {
      // Mock proration calculation for testing
      // Use actual plan prices from config instead of hardcoding
      const currentPlanConfig = currentPriceId ? getPlanByPriceId(currentPriceId) : null;
      const targetPlanConfig = getPlanByPriceId(body.targetPriceId);

      const currentPlanPrice = currentPlanConfig?.priceInCents || 0;
      const targetPlanPrice = targetPlanConfig?.priceInCents || 0;

      // For downgrades: no proration, just show when it takes effect
      if (isDowngradeChange) {
        // Mock effective date as end of current month
        effectiveDate = dayjs().add(1, 'month').startOf('month').toISOString();
        prorationResult.amount_due = 0;
      } else {
        // Simple mock calculation for upgrades: difference in monthly price * remaining days in month / 30
        const daysInMonth = 30;
        const remainingDays = Math.max(1, daysInMonth - dayjs().date());
        const priceDifference = targetPlanPrice - currentPlanPrice;
        prorationResult.amount_due = Math.round((priceDifference * remainingDays) / daysInMonth);
      }
    } else {
      // Real Stripe calculation
      try {
        const subscription = await stripe.subscriptions.retrieve(currentSubscription.id);
        const subscriptionItemId = subscription.items.data[0]?.id;

        if (!subscriptionItemId) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'INVALID_SUBSCRIPTION_STATE',
                message: 'Subscription has no items',
              },
            },
            { status: 500 }
          );
        }

        // For downgrades: no proration, just get the period end date
        if (isDowngradeChange) {
          const periodStart = (subscription as any).current_period_start as number | undefined;
          const periodEnd = (subscription as any).current_period_end as number | undefined;

          const periodStartISO = periodStart ? dayjs.unix(periodStart).toISOString() : dayjs().toISOString();
          effectiveDate = periodEnd ? dayjs.unix(periodEnd).toISOString() : undefined;

          prorationResult = {
            amount_due: 0, // No charge/refund for downgrades
            currency: 'usd',
            period_start: periodStartISO,
            period_end: effectiveDate || dayjs().toISOString(),
          };

          console.log('Downgrade preview details:', {
            currentPlan: currentPlan?.name,
            targetPlan: targetPlan.name,
            effectiveDate,
            periodStart,
            periodEnd,
            isDowngrade: true,
          });
        } else {
          // Use createPreview for proration calculation (Stripe SDK v20+ method)
          const invoice = await stripe.invoices.createPreview({
            customer: profile.stripe_customer_id,
            subscription: currentSubscription.id,
            subscription_details: {
              items: [
                {
                  id: subscriptionItemId,
                  price: body.targetPriceId,
                },
              ],
              proration_behavior: 'create_prorations',
            },
          });

          // Find proration line items for THIS specific change only
          // Filter by description containing current or target plan name
          const currentPlanName = currentPlan?.name || '';
          const targetPlanName = targetPlan.name;

          // Only include items related to the current change (current plan -> target plan)
          const relevantItems = invoice.lines.data.filter((line: any) => {
            const desc = line.description || '';
            // Include: unused current plan (credit) OR remaining target plan (charge)
            return (
              (desc.includes('Unused time on') && desc.includes(currentPlanName)) ||
              (desc.includes('Remaining time on') && desc.includes(targetPlanName))
            );
          });

          // Take only the first occurrence of each type to avoid duplicates
          const seenTypes = new Set<string>();
          const uniqueItems = relevantItems.filter((line: any) => {
            const desc = line.description || '';
            const type = desc.includes('Unused') ? `unused_${currentPlanName}` : `remaining_${targetPlanName}`;
            if (seenTypes.has(type)) return false;
            seenTypes.add(type);
            return true;
          });

          const prorationTotal = uniqueItems.reduce(
            (sum: number, line: any) => sum + (line.amount || 0),
            0
          );

          // Log for debugging
          console.log('Upgrade preview details:', {
            total: invoice.total,
            currentPlan: currentPlanName,
            targetPlan: targetPlanName,
            prorationTotal,
            relevantItems: uniqueItems.map((line: any) => ({
              description: line.description,
              amount: line.amount,
            })),
            allItemsCount: invoice.lines.data.length,
          });

          const effectiveAmount = prorationTotal;

          prorationResult = {
            amount_due: effectiveAmount, // Positive = user pays, negative = credit
            currency: invoice.currency,
            period_start: dayjs.unix(invoice.period_start).toISOString(),
            period_end: dayjs.unix(invoice.period_end).toISOString(),
          };
        }
      } catch (stripeError: unknown) {
        console.error('Stripe proration calculation error:', stripeError);
        const errorMessage = stripeError instanceof Error ? stripeError.message : 'Unknown error';

        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'STRIPE_ERROR',
              message: `Failed to calculate proration: ${errorMessage}`,
            },
          },
          { status: 500 }
        );
      }
    }

    // 9. Build response
    const response: IPreviewChangeResponse = {
      proration: prorationResult,
      current_plan: currentPlan ? {
        name: currentPlan.name,
        price_id: currentPriceId!,
        credits_per_month: currentPlan.creditsPerMonth,
      } : null,
      new_plan: {
        name: targetPlan.name,
        price_id: body.targetPriceId,
        credits_per_month: targetPlan.creditsPerMonth,
      },
      effective_immediately: !isDowngradeChange, // Downgrades are scheduled, upgrades are immediate
      effective_date: effectiveDate, // Only set for downgrades
      is_downgrade: isDowngradeChange,
    };

    return NextResponse.json({
      success: true,
      data: response,
    });

  } catch (error: unknown) {
    console.error('Subscription preview error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An error occurred';

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage
        }
      },
      { status: 500 }
    );
  }
}