import { NextRequest, NextResponse } from 'next/server';
import { stripe, STRIPE_WEBHOOK_SECRET } from '@server/stripe';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { serverEnv } from '@shared/config/env';
import { getPlanForPriceId } from '@shared/config/stripe';
import {
  getPlanByPriceId,
  calculateBalanceWithExpiration,
} from '@shared/config/subscription.utils';
import { getTrialConfig, getPlanConfig } from '@shared/config/subscription.config';
import type { IIdempotencyResult, WebhookEventStatus } from '@shared/types/stripe';
import Stripe from 'stripe';
import dayjs from 'dayjs';

export const runtime = 'edge'; // Cloudflare Worker compatible

type PreviousAttributes = Record<string, unknown> | null | undefined;

function extractPreviousPriceId(previousAttributes: PreviousAttributes | null | undefined): string | null {
  if (!previousAttributes || typeof previousAttributes !== 'object') {
    return null;
  }

  const items = (previousAttributes as any).items;
  const candidates: any[] = [];

  if (Array.isArray(items)) {
    candidates.push(items);
  } else if (items && Array.isArray((items as any).data)) {
    candidates.push((items as any).data);
  }

  for (const list of candidates) {
    const firstItem = list?.[0];
    const priceId =
      firstItem?.price?.id ??
      firstItem?.plan?.id ??
      firstItem?.price ??
      firstItem?.plan;

    if (typeof priceId === 'string') {
      return priceId;
    }
  }

  const directPrice =
    (previousAttributes as any).price?.id ??
    (previousAttributes as any).plan?.id ??
    (previousAttributes as any).price ??
    (previousAttributes as any).plan;

  return typeof directPrice === 'string' ? directPrice : null;
}

function isSchemaMissingError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;

  return (
    error.code === 'PGRST204' ||
    (typeof error.message === 'string' &&
      (error.message.includes('schema cache') || error.message.toLowerCase().includes('column')))
  );
}

// ============================================================================
// Idempotency Helpers
// ============================================================================

/**
 * Check if webhook event has already been processed.
 * If new, atomically insert with 'processing' status.
 */
async function checkAndClaimEvent(
  eventId: string,
  eventType: string,
  payload: unknown
): Promise<IIdempotencyResult> {
  // First, check if event exists
  const { data: existing } = await supabaseAdmin
    .from('webhook_events')
    .select('status')
    .eq('event_id', eventId)
    .maybeSingle();

  if (existing) {
    console.log(`Webhook event ${eventId} already exists with status: ${existing.status}`);
    return { isNew: false, existingStatus: existing.status as WebhookEventStatus };
  }

  // Try to insert - may fail if concurrent request beat us
  const { error: insertError } = await supabaseAdmin.from('webhook_events').insert({
    event_id: eventId,
    event_type: eventType,
    status: 'processing',
    payload: payload as Record<string, unknown>,
  });

  if (insertError) {
    // Unique constraint violation = another request got there first
    if (insertError.code === '23505') {
      console.log(`Webhook event ${eventId} claimed by concurrent request`);
      return { isNew: false, existingStatus: 'processing' };
    }
    // Other error - let it bubble up
    throw insertError;
  }

  console.log(`Webhook event ${eventId} claimed for processing`);
  return { isNew: true };
}

/**
 * Mark webhook event as completed
 * CRITICAL-3 FIX: Throws on error to trigger Stripe retry if DB update fails
 */
async function markEventCompleted(eventId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('webhook_events')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('event_id', eventId);

  if (error) {
    console.error(`Failed to mark event ${eventId} as completed:`, error);
    // Throw to trigger 500 response - Stripe will retry the webhook
    // This prevents orphaned events stuck in 'processing' status
    throw new Error(`Database error marking event completed: ${error.message}`);
  }
}

/**
 * Mark webhook event as failed
 */
async function markEventFailed(eventId: string, errorMessage: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('webhook_events')
    .update({
      status: 'failed',
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq('event_id', eventId);

  if (error) {
    console.error(`Failed to mark event ${eventId} as failed:`, error);
  }
}

// ============================================================================
// Main Webhook Handler
// ============================================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  console.log('[WEBHOOK_POST_HANDLER_CALLED]', { timestamp: new Date().toISOString() });

  try {
    // 1. Get the raw body and signature
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    console.log('[WEBHOOK_SIGNATURE_CHECK]', {
      hasSignature: !!signature,
      bodyLength: body.length,
    });

    if (!signature) {
      return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
    }

    // 2. Verify the webhook signature
    let event: Stripe.Event;

    // CRITICAL-4 FIX: Use AND conditions to prevent accidental test mode in production
    // Both conditions must be true for test mode
    const isTestMode =
      serverEnv.ENV === 'test' && serverEnv.STRIPE_SECRET_KEY?.includes('dummy_key');

    console.log('Webhook test mode detection:', {
      ENV: serverEnv.ENV,
      STRIPE_SECRET_KEY: serverEnv.STRIPE_SECRET_KEY,
      isTestMode,
      includesDummy: serverEnv.STRIPE_SECRET_KEY?.includes('dummy_key'),
    });

    // Production safety check: detect misconfigured test webhook secret
    if (STRIPE_WEBHOOK_SECRET === 'whsec_test_secret' && serverEnv.ENV !== 'test') {
      console.error('CRITICAL: Test webhook secret detected in non-test environment!');
      return NextResponse.json(
        { error: 'Misconfigured webhook secret - check environment variables' },
        { status: 500 }
      );
    }

    if (isTestMode) {
      // In test mode, parse the body directly as JSON event
      try {
        const parsedEvent = JSON.parse(body);

        // For test middleware security test, accept minimal structure and return success
        if (parsedEvent.type === 'test' && !parsedEvent.id) {
          console.log('Received middleware security test event');
          return NextResponse.json({ received: true, test: true });
        }

        event = parsedEvent as Stripe.Event;
      } catch (parseError: unknown) {
        const message = parseError instanceof Error ? parseError.message : 'Unknown error';
        console.error('Failed to parse webhook body in test mode:', message);
        return NextResponse.json({ error: 'Invalid webhook body' }, { status: 400 });
      }
    } else {
      try {
        event = await stripe.webhooks.constructEventAsync(body, signature, STRIPE_WEBHOOK_SECRET);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Webhook signature verification failed:', message);
        return NextResponse.json(
          { error: `Webhook signature verification failed: ${message}` },
          { status: 400 }
        );
      }
    }

    // 3. Idempotency check - prevent duplicate processing
    let idempotencyResult: IIdempotencyResult | null = null;
    let idempotencyEnabled = true;

    try {
      idempotencyResult = await checkAndClaimEvent(event.id, event.type, event);
    } catch (idempotencyError) {
      idempotencyEnabled = false;
      console.error(
        'Webhook idempotency table unavailable - processing without DB tracking:',
        idempotencyError
      );
    }

    if (idempotencyEnabled && idempotencyResult && !idempotencyResult.isNew) {
      console.log('[WEBHOOK_DUPLICATE_SKIPPED]', {
        eventId: event.id,
        eventType: event.type,
        existingStatus: idempotencyResult.existingStatus,
      });
      return NextResponse.json({
        received: true,
        skipped: true,
        reason: `Event already ${idempotencyResult.existingStatus}`,
      });
    }

    // 4. Handle the event
    console.log('[WEBHOOK_EVENT_RECEIVED]', {
      eventId: event.id,
      eventType: event.type,
      timestamp: new Date().toISOString(),
      previousAttributes: event.data.previous_attributes,
      extractedPreviousPriceId: extractPreviousPriceId(event.data.previous_attributes),
    });

    try {
      switch (event.type as any) {
        case 'checkout.session.completed':
          await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
          break;

        case 'customer.created':
          await handleCustomerCreated(event.data.object as Stripe.Customer);
          break;

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await handleSubscriptionUpdate(event.data.object as Stripe.Subscription, {
            previousPriceId: extractPreviousPriceId(event.data.previous_attributes),
          });
          break;

        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.trial_will_end':
          await handleTrialWillEnd(event.data.object as Stripe.Subscription);
          break;

        case 'invoice.payment_succeeded':
        case 'invoice.paid': // Stripe sometimes sends this alias
        case 'invoice_payment.paid': // Observed in logs; treat same as payment_succeeded
          await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
          break;

        case 'invoice.payment_failed':
        case 'invoice_payment.failed': // Alias guard
          await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
          break;

        case 'charge.refunded':
          await handleChargeRefunded(event.data.object as any);
          break;

        case 'charge.dispute.created':
          await handleChargeDisputeCreated(event.data.object as any);
          break;

        case 'invoice.payment_refunded':
          await handleInvoicePaymentRefunded(event.data.object as any);
          break;

        case 'subscription_schedule.completed':
          await handleSubscriptionScheduleCompleted(event.data.object as any);
          break;

        default:
          // MEDIUM-2 FIX: Mark unhandled events as unrecoverable instead of completed
          console.warn(`UNHANDLED WEBHOOK TYPE: ${event.type} - this may require code update`);
          if (idempotencyEnabled) {
            await supabaseAdmin
              .from('webhook_events')
              .update({
                status: 'unrecoverable',
                error_message: `Unhandled event type: ${event.type}`,
                completed_at: new Date().toISOString(),
              })
              .eq('event_id', event.id);
          } else {
            console.warn('Skipping webhook_events logging because idempotency is disabled for this event.');
          }

          // Return success to prevent Stripe retries, but event is marked for investigation
          return NextResponse.json({
            received: true,
            warning: `Unhandled event type: ${event.type}`,
          });
      }

      // Mark event as completed after successful processing
      if (idempotencyEnabled) {
        await markEventCompleted(event.id);
      }

      return NextResponse.json({ received: true });
    } catch (processingError) {
      // Mark event as failed and re-throw
      const errorMessage =
        processingError instanceof Error ? processingError.message : 'Unknown error';
      if (idempotencyEnabled) {
        await markEventFailed(event.id, errorMessage);
      }
      throw processingError;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Webhook handler failed';
    console.error('Webhook error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Handle successful checkout session
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id;
  if (!userId) {
    console.error('No user_id in session metadata');
    return;
  }

  console.log(`Checkout completed for user ${userId}, mode: ${session.mode}`);

  if (session.mode === 'subscription') {
    // For subscriptions, add initial credits immediately since user lands on success page
    // The subscription will be fully set up by the subscription.created event
    const subscriptionId = session.subscription as string;

    if (subscriptionId) {
      try {
        // Check if this is a test subscription ID
        if (subscriptionId.startsWith('sub_test_')) {
          console.log('Test subscription detected, using mock data');

          // For test subscriptions, add credits based on session metadata or a default
          const testPriceId = 'price_1SZmVzALMLhQocpfPyRX2W8D'; // Default to PRO_MONTHLY for testing
          const plan = getPlanForPriceId(testPriceId);

          if (plan) {
            const { error } = await supabaseAdmin.rpc('increment_credits_with_log', {
              target_user_id: userId,
              amount: plan.creditsPerMonth,
              transaction_type: 'subscription',
              ref_id: session.id,
              description: `Test subscription credits - ${plan.name} plan - ${plan.creditsPerMonth} credits`,
            });

            if (error) {
              console.error('Error adding test subscription credits:', error);
            } else {
              console.log(
                `Added ${plan.creditsPerMonth} test subscription credits to user ${userId} for ${plan.name} plan`
              );
            }
          }
        } else {
          // MEDIUM-5 FIX: Real subscription - get details from Stripe
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const priceId = subscription.items.data[0]?.price.id;

          // Get the invoice ID from the session for proper reference tracking
          const invoiceId = session.invoice as string | null;

          if (priceId) {
            const plan = getPlanForPriceId(priceId);
            if (plan) {
              // Add initial credits for the first month
              // Use invoice ID as ref_id for refund correlation
              const { error } = await supabaseAdmin.rpc('increment_credits_with_log', {
                target_user_id: userId,
                amount: plan.creditsPerMonth,
                transaction_type: 'subscription',
                ref_id: invoiceId ? `invoice_${invoiceId}` : `session_${session.id}`,
                description: `Initial subscription credits - ${plan.name} plan - ${plan.creditsPerMonth} credits`,
              });

              if (error) {
                console.error('Error adding initial subscription credits:', error);
              } else {
                console.log(
                  `Added ${plan.creditsPerMonth} initial subscription credits to user ${userId} for ${plan.name} plan`
                );
              }
            }
          }
        }
      } catch (error) {
        console.error('Error processing subscription checkout:', error);
      }
    }
  } else if (session.mode === 'payment') {
    // Handle credit pack purchase
    await handleCreditPackPurchase(session, userId);
  } else {
    console.warn(
      `Unexpected checkout mode: ${session.mode} for session ${session.id}. Expected 'subscription' or 'payment'.`
    );
  }
}

/**
 * Handle one-time credit pack purchase
 */
async function handleCreditPackPurchase(
  session: Stripe.Checkout.Session,
  userId: string
): Promise<void> {
  const credits = parseInt(session.metadata?.credits || '0', 10);
  const packKey = session.metadata?.pack_key;

  if (!credits || credits <= 0) {
    console.error(`Invalid credits in session metadata: ${session.metadata?.credits}`);
    return;
  }

  // Get payment intent for refund correlation
  const paymentIntentId = session.payment_intent as string;

  try {
    const { error } = await supabaseAdmin.rpc('increment_credits_with_log', {
      target_user_id: userId,
      amount: credits,
      transaction_type: 'purchase',
      ref_id: paymentIntentId ? `pi_${paymentIntentId}` : `session_${session.id}`,
      description: `Credit pack purchase - ${packKey || 'unknown'} - ${credits} credits`,
    });

    if (error) {
      console.error('Error adding purchased credits:', error);
      throw error; // Trigger webhook retry
    }

    console.log(`Added ${credits} purchased credits to user ${userId} (pack: ${packKey})`);
  } catch (error) {
    console.error('Failed to process credit purchase:', error);
    throw error; // Re-throw for webhook retry
  }
}

// Handle customer creation
async function handleCustomerCreated(customer: Stripe.Customer): Promise<void> {
  console.log(`Customer created: ${customer.id}`);

  // If customer has metadata with user_id, update the profile with stripe_customer_id
  const userId = customer.metadata?.user_id;

  if (userId) {
    try {
      const { error } = await supabaseAdmin
        .from('profiles')
        .update({
          stripe_customer_id: customer.id,
        })
        .eq('id', userId);

      if (error) {
        console.error(`Error updating profile ${userId} with customer ID ${customer.id}:`, error);
      } else {
        console.log(`Updated profile ${userId} with Stripe customer ID ${customer.id}`);
      }
    } catch (error) {
      console.error(`Exception updating profile for customer ${customer.id}:`, error);
    }
  } else {
    console.log(`Customer ${customer.id} created without user_id metadata - this is expected for Stripe Checkout customers`);
  }
}

// Handle subscription creation/update
async function handleSubscriptionUpdate(
  subscription: Stripe.Subscription,
  options?: {
    previousPriceId?: string | null;
  }
) {
  const customerId = subscription.customer as string;

  console.log('[WEBHOOK_SUBSCRIPTION_UPDATE_START]', {
    subscriptionId: subscription.id,
    customerId,
    status: subscription.status,
    optionsPreviousPriceId: options?.previousPriceId,
    timestamp: new Date().toISOString(),
  });

  // Get the user ID from the customer and current subscription details
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, subscription_status, credits_balance')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  if (!profile) {
    console.error(`No profile found for customer ${customerId}`);
    return;
  }

  const userId = profile.id;
  const previousStatus = profile.subscription_status;

  // Get the user's previous subscription to detect plan changes
  // IMPORTANT: Prefer options.previousPriceId from Stripe's previous_attributes over DB value
  // because the /api/subscription/change route updates the DB BEFORE the webhook fires,
  // making the DB value stale (it already has the NEW price_id)
  const { data: existingSubscription } = await supabaseAdmin
    .from('subscriptions')
    .select('price_id')
    .eq('id', subscription.id)
    .maybeSingle();

  // Prefer Stripe's previous_attributes (accurate) over DB (may be stale after plan change)
  const previousPriceId = options?.previousPriceId || existingSubscription?.price_id || null;

  // Get price ID and plan metadata
  const priceId = subscription.items.data[0]?.price.id || '';
  const planConfig = getPlanConfig(priceId);

  if (!planConfig) {
    console.error(`Unknown price ID in subscription update: ${priceId}`);
    return;
  }

  // Get trial configuration
  const trialConfig = getTrialConfig(priceId);

  // Access period timestamps - these are standard Stripe subscription fields (Unix timestamps in seconds)
  let currentPeriodStart = (subscription as any).current_period_start as number | undefined;
  let currentPeriodEnd = (subscription as any).current_period_end as number | undefined;
  const trialEnd = (subscription as any).trial_end as number | null | undefined;
  const canceledAt = (subscription as any).canceled_at as number | null | undefined;

  // If period timestamps are missing, fetch fresh subscription data from Stripe
  if (!currentPeriodStart || !currentPeriodEnd) {
    console.warn('Period timestamps missing from webhook, fetching fresh subscription data...');
    try {
      const freshSubscription = await stripe.subscriptions.retrieve(subscription.id);
      // Access the subscription data
      currentPeriodStart = (freshSubscription as any).current_period_start;
      currentPeriodEnd = (freshSubscription as any).current_period_end;
      console.log('Fetched fresh subscription data:', {
        id: subscription.id,
        current_period_start: currentPeriodStart,
        current_period_end: currentPeriodEnd,
      });
    } catch (fetchError) {
      console.error('Failed to fetch subscription from Stripe:', fetchError);
    }
  }

  // If still missing, use fallback values (common in test mode)
  // Use dayjs to calculate reasonable defaults
  if (!currentPeriodStart || !currentPeriodEnd) {
    console.warn('Using fallback period timestamps for subscription:', subscription.id);
    const now = dayjs();
    currentPeriodStart = now.unix();
    currentPeriodEnd = now.add(30, 'day').unix();
  }

  // Validate that timestamps are valid numbers
  if (isNaN(currentPeriodStart) || isNaN(currentPeriodEnd)) {
    console.error('Invalid timestamp values in subscription:', {
      id: subscription.id,
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
    });
    return;
  }

  // Convert Unix timestamps to ISO strings using dayjs
  const currentPeriodStartISO = dayjs.unix(currentPeriodStart).toISOString();
  const currentPeriodEndISO = dayjs.unix(currentPeriodEnd).toISOString();
  const trialEndISO = trialEnd ? dayjs.unix(trialEnd).toISOString() : null;
  const canceledAtISO = canceledAt ? dayjs.unix(canceledAt).toISOString() : null;

  // Store trial end date in subscriptions table
  const subscriptionUpsertPayload = {
    id: subscription.id,
    user_id: userId,
    status: subscription.status,
    price_id: priceId,
    current_period_start: currentPeriodStartISO,
    current_period_end: currentPeriodEndISO,
    trial_end: trialEndISO,
    cancel_at_period_end: subscription.cancel_at_period_end,
    canceled_at: canceledAtISO,
  };

  const { error: subError } = await supabaseAdmin
    .from('subscriptions')
    .upsert(subscriptionUpsertPayload);

  if (subError) {
    console.error('Error upserting subscription:', subError);

    if (isSchemaMissingError(subError)) {
      const minimalPayload = {
        id: subscription.id,
        user_id: userId,
        status: subscription.status,
        price_id: priceId,
        current_period_start: currentPeriodStartISO,
        current_period_end: currentPeriodEndISO,
        cancel_at_period_end: subscription.cancel_at_period_end,
      };

      const { error: fallbackError } = await supabaseAdmin
        .from('subscriptions')
        .upsert(minimalPayload);

      if (fallbackError) {
        console.error('Fallback subscription upsert failed:', fallbackError);
      } else {
        console.log('Fallback subscription upsert succeeded without optional columns.');
      }
    }
  }

  // Handle trial start - allocate trial-specific credits
  if (subscription.status === 'trialing' && previousStatus !== 'trialing') {
    console.log(`Trial started for user ${userId}`);

    if (trialConfig && trialConfig.enabled) {
      // Determine how many credits to allocate for trial
      const trialCredits = trialConfig.trialCredits ?? planConfig.creditsPerCycle;

      const { error } = await supabaseAdmin.rpc('increment_credits_with_log', {
        target_user_id: userId,
        amount: trialCredits,
        transaction_type: 'trial',
        ref_id: subscription.id,
        description: `Trial credits - ${planConfig.name} plan - ${trialCredits} credits`,
      });

      if (error) {
        console.error('Error adding trial credits:', error);
      } else {
        console.log(
          `Added ${trialCredits} trial credits to user ${userId} for ${planConfig.name} plan`
        );
      }
    }
  }

  // Handle trial conversion to active subscription
  if (subscription.status === 'active' && previousStatus === 'trialing') {
    console.log(`Trial converted to paid for user ${userId}`);

    if (trialConfig && trialConfig.enabled && trialConfig.trialCredits !== null) {
      // Trial had different credits, adjust balance
      const fullCredits = planConfig.creditsPerCycle;
      const currentBalance = profile.credits_balance ?? 0;

      // Calculate credits to add (full cycle minus what's already available from trial)
      const creditsToAdd = Math.max(0, fullCredits - currentBalance);

      if (creditsToAdd > 0) {
        const { error } = await supabaseAdmin.rpc('increment_credits_with_log', {
          target_user_id: userId,
          amount: creditsToAdd,
          transaction_type: 'subscription',
          ref_id: subscription.id,
          description: `Trial conversion - ${planConfig.name} plan - ${creditsToAdd} additional credits`,
        });

        if (error) {
          console.error('Error adjusting credits after trial:', error);
        } else {
          console.log(`Added ${creditsToAdd} credits to user ${userId} after trial conversion`);
        }
      }
    }
  }

  // Handle plan changes (upgrade/downgrade)
  // Only process if this is an existing subscription being updated (not a new creation)
  const effectivePreviousPriceId = previousPriceId;

  // Debug logging for plan change detection
  console.log('[WEBHOOK_PLAN_CHANGE_DETECTION]', {
    subscriptionId: subscription.id,
    userId,
    currentPriceId: priceId,
    previousPriceId: effectivePreviousPriceId,
    optionsPreviousPriceId: options?.previousPriceId,
    existingSubscriptionPriceId: existingSubscription?.price_id,
    subscriptionStatus: subscription.status,
    isPlanChange: effectivePreviousPriceId && effectivePreviousPriceId !== priceId,
    currentCreditsBalance: profile.credits_balance,
  });

  if (effectivePreviousPriceId && effectivePreviousPriceId !== priceId && subscription.status === 'active') {
    const previousPlanConfig = getPlanConfig(effectivePreviousPriceId);

    if (previousPlanConfig) {
      const previousCredits = previousPlanConfig.creditsPerCycle;
      const newCredits = planConfig.creditsPerCycle;
      const creditDifference = newCredits - previousCredits;

      console.log('[WEBHOOK_PLAN_CHANGE_CONFIRMED]', {
        userId,
        subscriptionId: subscription.id,
        previousPlan: previousPlanConfig.name,
        previousCredits,
        newPlan: planConfig.name,
        newCredits,
        creditDifference,
        changeType: creditDifference > 0 ? 'upgrade' : creditDifference < 0 ? 'downgrade' : 'same',
        currentBalance: profile.credits_balance,
      });

      // Only add credits for upgrades (positive difference)
      // For downgrades, user keeps existing credits until next renewal
      if (creditDifference > 0) {
        const currentBalance = profile.credits_balance ?? 0;

        // ANTI-FARMING PROTECTION: Only add tier difference if user has "reasonable" credits
        // Reasonable = within 50% of the previous tier's amount (allows for some rollover/purchases)
        // This prevents: Hobby→Pro (+800), Pro→Hobby (keep), Hobby→Pro (+800 AGAIN)
        const maxReasonableBalance = Math.floor(previousCredits * 1.5);
        const isLegitimateUpgrade = currentBalance <= maxReasonableBalance;

        // For legitimate upgrades: add the TIER DIFFERENCE (not just top-up to target)
        // This preserves rollover credits from the previous plan
        const creditsToAdd = isLegitimateUpgrade ? creditDifference : 0;

        console.log('[WEBHOOK_CREDITS_UPGRADE_START]', {
          userId,
          currentBalance,
          previousTierCredits: previousCredits,
          newTierCredits: newCredits,
          tierDifference: creditDifference,
          maxReasonableBalance,
          isLegitimateUpgrade,
          creditsToAdd,
          expectedNewBalance: currentBalance + creditsToAdd,
        });

        if (creditsToAdd > 0) {
          const { error } = await supabaseAdmin.rpc('increment_credits_with_log', {
            target_user_id: userId,
            amount: creditsToAdd,
            transaction_type: 'subscription',
            ref_id: subscription.id,
            description: `Plan upgrade - ${previousPlanConfig.name} → ${planConfig.name} - ${creditsToAdd} credits (tier difference)`,
          });

          if (error) {
            console.error('[WEBHOOK_CREDITS_UPGRADE_ERROR]', {
              userId,
              error,
              creditsToAdd,
            });
          } else {
            console.log('[WEBHOOK_CREDITS_UPGRADE_SUCCESS]', {
              userId,
              creditsAdded: creditsToAdd,
              previousBalance: currentBalance,
              newBalance: currentBalance + creditsToAdd,
            });
          }
        } else {
          console.log('[WEBHOOK_CREDITS_UPGRADE_BLOCKED]', {
            userId,
            currentBalance,
            maxReasonableBalance,
            reason: 'User has excessive credits - possible farming attempt detected',
            note: 'Credits will reset to tier amount on next monthly renewal',
          });
        }
      } else if (creditDifference < 0) {
        console.log('[WEBHOOK_CREDITS_DOWNGRADE]', {
          userId,
          message: 'User keeps existing credits. Next renewal will provide new tier credits.',
          currentBalance: profile.credits_balance,
          nextRenewalCredits: newCredits,
        });
      } else {
        console.log('[WEBHOOK_CREDITS_NO_CHANGE]', {
          userId,
          message: 'Same credit amount - no adjustment needed',
          credits: newCredits,
        });
      }
    }
  }

  // Update profile subscription status with human-readable plan name
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({
      subscription_status: subscription.status,
      subscription_tier: planConfig.name, // Use friendly name instead of price ID
    })
    .eq('id', userId);

  if (profileError) {
    console.error('[WEBHOOK_PROFILE_UPDATE_ERROR]', {
      userId,
      error: profileError,
    });
  } else {
    console.log('[WEBHOOK_SUBSCRIPTION_UPDATE_COMPLETE]', {
      userId,
      subscriptionId: subscription.id,
      plan: planConfig.name,
      status: subscription.status,
      timestamp: new Date().toISOString(),
    });
  }
}

// Handle subscription deletion
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;

  // Get the user ID from the customer
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  if (!profile) {
    console.error(`No profile found for customer ${customerId}`);
    return;
  }

  const userId = profile.id;

  // Update subscription status
  const { error: subError } = await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'canceled',
      canceled_at: dayjs().toISOString(),
    })
    .eq('id', subscription.id);

  if (subError) {
    console.error('Error updating canceled subscription:', subError);
  }

  // Update profile
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({
      subscription_status: 'canceled',
    })
    .eq('id', userId);

  if (profileError) {
    console.error('Error updating profile subscription status:', profileError);
  } else {
    console.log(`Canceled subscription for user ${userId}`);
  }
}

// Handle successful invoice payment (subscription renewal)
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
  const invoiceWithSub = invoice as Stripe.Invoice & {
    subscription?: string | Stripe.Subscription | null;
    lines?: {
      data: Array<{
        price?: { id: string };
        plan?: { id: string };
        type?: string;
        proration?: boolean;
        amount?: number;
      }>;
    };
  };
  const subscriptionId =
    typeof invoiceWithSub.subscription === 'string'
      ? invoiceWithSub.subscription
      : invoiceWithSub.subscription?.id;

  if (!subscriptionId) {
    return; // Not a subscription invoice
  }

  const customerId = invoice.customer as string;

  // Get the user ID from the customer
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, credits_balance')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  if (!profile) {
    console.error(`No profile found for customer ${customerId}`);
    return;
  }

  const userId = profile.id;

  // Get the price ID from invoice lines to determine credit amount.
  // Prefer the subscription line item; if missing (proration invoice), choose the positive proration line
  // so upgrades map to the new plan instead of the previous one.
  // Cast to any[] because Stripe's InvoiceLineItem type doesn't expose all runtime properties
  const lines = (invoiceWithSub.lines?.data ?? []) as any[];
  const subscriptionLine = lines.find(line => line.type === 'subscription' && (line.price?.id || line.plan?.id));
  const positiveProrationLine = lines.find(
    line => line.proration && (line.amount ?? 0) > 0 && (line.price?.id || line.plan?.id)
  );
  const anyPricedLine = lines.find(line => line.price?.id || line.plan?.id);

  const priceId =
    subscriptionLine?.price?.id ||
    subscriptionLine?.plan?.id ||
    positiveProrationLine?.price?.id ||
    positiveProrationLine?.plan?.id ||
    anyPricedLine?.price?.id ||
    anyPricedLine?.plan?.id ||
    '';

  const plan = getPlanForPriceId(priceId);

  if (!plan) {
    console.error(`Unknown price ID in invoice payment: ${priceId}`);
    return;
  }

  // In test environment, use simplified logic
  const isTestMode =
    serverEnv.ENV === 'test' ||
    serverEnv.STRIPE_SECRET_KEY?.includes('test') ||
    !STRIPE_WEBHOOK_SECRET ||
    STRIPE_WEBHOOK_SECRET === 'whsec_test_YOUR_STRIPE_WEBHOOK_SECRET_HERE' ||
    STRIPE_WEBHOOK_SECRET === 'whsec_test_secret';

  if (!isTestMode) {
    // In production, fetch the full subscription to ensure we have latest status
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await handleSubscriptionUpdate(subscription);
    } catch (error) {
      console.error('Failed to retrieve subscription from Stripe:', error);
    }
  }

  // Get detailed plan config to check expiration settings
  const planConfig = getPlanByPriceId(priceId);
  const creditsToAdd = plan.creditsPerMonth;
  const currentBalance = profile.credits_balance ?? 0;
  const maxRollover = plan.maxRollover;

  // Calculate new balance considering expiration mode
  const expirationMode = planConfig?.creditsExpiration?.mode ?? 'never';
  const { newBalance, expiredAmount } = calculateBalanceWithExpiration({
    currentBalance,
    newCredits: creditsToAdd,
    expirationMode,
    maxRollover,
  });

  // If credits are expiring, call the expiration RPC first
  if (expiredAmount > 0) {
    console.log(`Expiring ${expiredAmount} credits for user ${userId} (mode: ${expirationMode})`);

    try {
      const { data: expiredCount, error: expireError } = await supabaseAdmin.rpc(
        'expire_credits_at_cycle_end',
        {
          target_user_id: userId,
          expiration_reason: expirationMode === 'rolling_window' ? 'rolling_window' : 'cycle_end',
          subscription_stripe_id: subscriptionId,
          cycle_end_date: invoice.period_end
            ? new Date(invoice.period_end * 1000).toISOString()
            : null,
        }
      );

      if (expireError) {
        console.error('Error expiring credits:', expireError);
        // Continue with credit allocation even if expiration fails
      } else {
        console.log(`Successfully expired ${expiredCount ?? 0} credits for user ${userId}`);
      }
    } catch (error) {
      console.error('Exception expiring credits:', error);
      // Continue with credit allocation
    }
  }

  // Now add the new subscription credits
  const actualCreditsToAdd = newBalance - (expiredAmount > 0 ? 0 : currentBalance);

  if (actualCreditsToAdd > 0) {
    // Build description based on expiration
    let description = `Monthly subscription renewal - ${plan.name} plan`;

    if (expiredAmount > 0) {
      description += ` (${expiredAmount} credits expired, ${actualCreditsToAdd} new credits added)`;
    } else if (actualCreditsToAdd < creditsToAdd) {
      description += ` (capped from ${creditsToAdd} due to rollover limit of ${maxRollover})`;
    }

    // MEDIUM-5: Use consistent invoice reference format for refund correlation
    const { error } = await supabaseAdmin.rpc('increment_credits_with_log', {
      target_user_id: userId,
      amount: actualCreditsToAdd,
      transaction_type: 'subscription',
      ref_id: `invoice_${invoice.id}`,
      description,
    });

    if (error) {
      console.error('Error adding subscription credits:', error);
    } else {
      console.log(
        `Added ${actualCreditsToAdd} subscription credits to user ${userId} from ${plan.name} plan (balance: ${currentBalance} → ${newBalance}, mode: ${expirationMode})`
      );
    }
  } else if (expiredAmount === 0) {
    console.log(
      `Skipped adding credits for user ${userId}: already at max rollover (${currentBalance}/${maxRollover})`
    );
  }
}

// Handle failed invoice payment
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  // Get the user ID from the customer
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  if (!profile) {
    console.error(`No profile found for customer ${customerId}`);
    return;
  }

  const userId = profile.id;

  // Update profile to indicate payment issue
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({
      subscription_status: 'past_due',
    })
    .eq('id', userId);

  if (error) {
    console.error('Error updating profile for failed payment:', error);
  } else {
    console.log(`Marked user ${userId} subscription as past_due`);
  }
}

// CRITICAL-2 FIX: Handle charge refund - clawback credits
async function handleChargeRefunded(charge: any) {
  const customerId = charge.customer;
  const refundAmount = charge.amount_refunded || 0;

  if (refundAmount === 0) {
    console.log(`Charge ${charge.id} has no refund amount, skipping`);
    return;
  }

  // Get the user ID from the customer
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  if (!profile) {
    console.error(`No profile found for customer ${customerId} for charge refund`);
    return;
  }

  const userId = profile.id;

  console.log(
    `Processing refund for charge ${charge.id}: ${refundAmount} cents for user ${userId}`
  );

  // Get the invoice to find the original credit transaction
  const invoiceId = charge.invoice;

  if (!invoiceId) {
    console.warn(`Charge ${charge.id} has no invoice - cannot clawback credits`);
    // For charges without invoices (one-time payments), we can't easily determine which credits to clawback
    // This is acceptable as our system is subscription-only
    return;
  }

  try {
    // Clawback all credits added from this invoice transaction
    const { data: result, error } = await supabaseAdmin.rpc('clawback_credits_from_transaction', {
      p_target_user_id: userId,
      p_original_ref_id: `invoice_${invoiceId}`,
      p_reason: `Refund for charge ${charge.id} (${refundAmount} cents)`,
    });

    if (error) {
      console.error(`Failed to clawback credits for refund:`, error);
      throw error;
    }

    if (result && result.length > 0) {
      const clawbackResult = result[0];
      if (clawbackResult.success) {
        console.log(
          `Successfully clawed back ${clawbackResult.credits_clawed_back} credits. New balance: ${clawbackResult.new_balance}`
        );
      } else {
        console.error(`Clawback failed: ${clawbackResult.error_message}`);
      }
    }
  } catch (error) {
    console.error(`Error during credit clawback:`, error);
    // Re-throw to mark webhook as failed and trigger retry
    throw error;
  }
}

// Handle charge dispute created - immediate credit hold
async function handleChargeDisputeCreated(dispute: any) {
  console.log(`Charge dispute ${dispute.id} created for charge ${dispute.charge}`);

  // TODO: Implement dispute handling logic
}

// Handle invoice payment refunded
async function handleInvoicePaymentRefunded(invoice: any) {
  console.log(`Invoice ${invoice.id} payment refunded`);

  // TODO: Implement invoice refund handling logic
}

// Handle trial will end warning
async function handleTrialWillEnd(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;

  // Get the user ID from the customer
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, email')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  if (!profile) {
    console.error(`No profile found for customer ${customerId}`);
    return;
  }

  const userId = profile.id;
  const trialEnd = (subscription as any).trial_end as number | null;

  if (!trialEnd) {
    console.error(`No trial end date for subscription ${subscription.id}`);
    return;
  }

  const trialEndDate = dayjs.unix(trialEnd);
  const daysUntilEnd = trialEndDate.diff(dayjs(), 'day');

  console.log(`Trial ending in ${daysUntilEnd} days for user ${userId}`);

  // TODO: Send trial ending soon email notification
  // This would integrate with your email service provider
  console.log(
    `TODO: Send trial ending soon email to ${profile.email} (${daysUntilEnd} days remaining)`
  );
}

// Handle subscription schedule completion (scheduled downgrade taking effect)
async function handleSubscriptionScheduleCompleted(schedule: any) {
  const subscriptionId = schedule.subscription;

  if (!subscriptionId) {
    console.log(`Schedule ${schedule.id} has no subscription, skipping`);
    return;
  }

  console.log(`[SCHEDULE_COMPLETED] Schedule ${schedule.id} completed for subscription ${subscriptionId}`);

  // Get the subscription from our database
  const { data: subscription, error: subError } = await supabaseAdmin
    .from('subscriptions')
    .select('id, user_id, scheduled_price_id, price_id')
    .eq('id', subscriptionId)
    .maybeSingle();

  if (subError || !subscription) {
    console.error(`No subscription found for schedule completion: ${subscriptionId}`, subError);
    return;
  }

  const scheduledPriceId = subscription.scheduled_price_id;

  // Clear the scheduled fields since the schedule has completed
  const { error: updateError } = await supabaseAdmin
    .from('subscriptions')
    .update({
      scheduled_price_id: null,
      scheduled_change_date: null,
      price_id: scheduledPriceId || subscription.price_id, // Update to new price
      updated_at: new Date().toISOString(),
    })
    .eq('id', subscriptionId);

  if (updateError) {
    console.error(`Error clearing scheduled downgrade for subscription ${subscriptionId}:`, updateError);
    return;
  }

  // If this was a scheduled downgrade, reset credits to the new tier
  if (scheduledPriceId) {
    const newPlan = getPlanForPriceId(scheduledPriceId);

    if (newPlan) {
      // Update profile tier
      await supabaseAdmin
        .from('profiles')
        .update({
          subscription_tier: newPlan.name,
        })
        .eq('id', subscription.user_id);

      // Reset credits to the new tier amount
      // This is the key difference from immediate downgrades - at renewal, credits reset
      const { error: creditError } = await supabaseAdmin
        .from('profiles')
        .update({
          credits_balance: newPlan.creditsPerMonth,
        })
        .eq('id', subscription.user_id);

      if (creditError) {
        console.error(`Error resetting credits for user ${subscription.user_id}:`, creditError);
      } else {
        console.log(`[SCHEDULE_DOWNGRADE_CREDITS_RESET] User ${subscription.user_id} credits reset to ${newPlan.creditsPerMonth} for ${newPlan.name} plan`);
      }

      // Log the credit transaction
      await supabaseAdmin.rpc('increment_credits_with_log', {
        target_user_id: subscription.user_id,
        amount: 0, // Amount doesn't matter - we're just logging
        transaction_type: 'subscription',
        ref_id: `schedule_${schedule.id}`,
        description: `Scheduled downgrade completed - credits reset to ${newPlan.creditsPerMonth} for ${newPlan.name} plan`,
      });
    }
  }

  console.log(`[SCHEDULE_COMPLETED_DONE] Cleared scheduled downgrade for subscription ${subscriptionId}`);
}
