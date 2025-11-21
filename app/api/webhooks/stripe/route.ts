import { NextRequest, NextResponse } from 'next/server';
import { stripe, STRIPE_WEBHOOK_SECRET } from '@/lib/stripe/config';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import Stripe from 'stripe';

export const runtime = 'edge'; // Cloudflare Worker compatible

export async function POST(request: NextRequest) {
  try {
    // 1. Get the raw body and signature
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: 400 }
      );
    }

    // 2. Verify the webhook signature
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        STRIPE_WEBHOOK_SECRET
      );
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return NextResponse.json(
        { error: `Webhook signature verification failed: ${err.message}` },
        { status: 400 }
      );
    }

    // 3. Handle the event
    console.log(`Processing webhook event: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: error.message || 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

// Handle successful checkout session
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id;
  if (!userId) {
    console.error('No user_id in session metadata');
    return;
  }

  // Check if it's a one-time payment for credits or a subscription
  if (session.mode === 'payment') {
    // One-time purchase (credits)
    const creditsAmount = parseInt(session.metadata?.credits_amount || '0', 10);

    if (creditsAmount > 0) {
      // Use the RPC function to increment credits
      const { error } = await supabaseAdmin.rpc('increment_credits', {
        target_user_id: userId,
        amount: creditsAmount,
      });

      if (error) {
        console.error('Error incrementing credits:', error);
      } else {
        console.log(`Added ${creditsAmount} credits to user ${userId}`);
      }
    }
  } else if (session.mode === 'subscription') {
    // Subscription - will be handled by subscription.created event
    console.log(`Subscription created for user ${userId}`);
  }
}

// Handle subscription creation/update
async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;

  // Get the user ID from the customer
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!profile) {
    console.error(`No profile found for customer ${customerId}`);
    return;
  }

  const userId = profile.id;

  // Upsert subscription data
  const { error: subError } = await supabaseAdmin
    .from('subscriptions')
    .upsert({
      id: subscription.id,
      user_id: userId,
      status: subscription.status,
      price_id: subscription.items.data[0]?.price.id || '',
      current_period_start: new Date((subscription as any).current_period_start * 1000).toISOString(),
      current_period_end: new Date((subscription as any).current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
      canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
    });

  if (subError) {
    console.error('Error upserting subscription:', subError);
    return;
  }

  // Update profile subscription status
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .update({
      subscription_status: subscription.status,
      subscription_tier: subscription.items.data[0]?.price.id || null,
    })
    .eq('id', userId);

  if (profileError) {
    console.error('Error updating profile subscription status:', profileError);
  } else {
    console.log(`Updated subscription for user ${userId}: ${subscription.status}`);
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
    .single();

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
      canceled_at: new Date().toISOString(),
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
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const subscriptionId = (invoice as any).subscription as string;

  if (!subscriptionId) {
    return; // Not a subscription invoice
  }

  // Fetch the full subscription to get updated data
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await handleSubscriptionUpdate(subscription);
}

// Handle failed invoice payment
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  // Get the user ID from the customer
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();

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
