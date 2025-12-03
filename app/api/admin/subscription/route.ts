import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/server/middleware/requireAdmin';
import { supabaseAdmin } from '@/server/supabase/supabaseAdmin';
import { stripe } from '@/server/stripe';
import { z } from 'zod';
import { getPlanForPriceId } from '@/shared/config/stripe';
import dayjs from 'dayjs';

const updateSubscriptionSchema = z.object({
  userId: z.string().uuid(),
  action: z.enum(['cancel', 'change']),
  targetPriceId: z.string().optional(), // Required when action is 'change'
});

export async function POST(req: NextRequest) {
  const { isAdmin, error } = await requireAdmin(req);
  if (!isAdmin) return error;

  try {
    const body = await req.json();
    const validation = updateSubscriptionSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.errors },
        { status: 400 }
      );
    }

    const { userId, action, targetPriceId } = validation.data;

    // Get user's subscription from DB (if exists)
    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('id, status, price_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (action === 'cancel') {
      if (!subscription) {
        // No subscription - just clear profile
        await supabaseAdmin
          .from('profiles')
          .update({
            subscription_status: null,
            subscription_tier: null,
            updated_at: dayjs().toISOString(),
          })
          .eq('id', userId);

        return NextResponse.json({
          success: true,
          data: { action: 'canceled', message: 'Profile updated to free tier' },
        });
      }

      // Cancel in Stripe
      try {
        await stripe.subscriptions.cancel(subscription.id);
      } catch (stripeErr) {
        console.error('Stripe cancel error (may already be canceled):', stripeErr);
      }

      // Update our database
      await supabaseAdmin
        .from('subscriptions')
        .update({
          status: 'canceled',
          canceled_at: dayjs().toISOString(),
          updated_at: dayjs().toISOString(),
        })
        .eq('id', subscription.id);

      // Update profile
      await supabaseAdmin
        .from('profiles')
        .update({
          subscription_status: null,
          subscription_tier: null,
          updated_at: dayjs().toISOString(),
        })
        .eq('id', userId);

      return NextResponse.json({
        success: true,
        data: { action: 'canceled', subscriptionId: subscription.id },
      });
    }

    if (action === 'change') {
      if (!targetPriceId) {
        return NextResponse.json(
          { error: 'targetPriceId is required for plan changes' },
          { status: 400 }
        );
      }

      const targetPlan = getPlanForPriceId(targetPriceId);
      if (!targetPlan) {
        return NextResponse.json(
          { error: 'Invalid price ID' },
          { status: 400 }
        );
      }

      // Check if user has an active subscription in Stripe we can modify
      const activeSubscription = subscription &&
        subscription.status !== 'canceled' &&
        subscription.status !== 'incomplete';

      if (activeSubscription) {
        // Update existing subscription in Stripe
        try {
          const stripeSub = await stripe.subscriptions.retrieve(subscription.id);
          const updatedSub = await stripe.subscriptions.update(subscription.id, {
            items: [{ id: stripeSub.items.data[0]?.id, price: targetPriceId }],
            proration_behavior: 'create_prorations',
          });

          const updatedSubData = updatedSub as unknown as { current_period_end?: number };
          const periodEnd = updatedSubData.current_period_end
            ? dayjs.unix(updatedSubData.current_period_end).toISOString()
            : null;

          // Update database
          await supabaseAdmin
            .from('subscriptions')
            .update({
              price_id: targetPriceId,
              status: updatedSub.status,
              updated_at: dayjs().toISOString(),
            })
            .eq('id', subscription.id);

          await supabaseAdmin
            .from('profiles')
            .update({
              subscription_status: updatedSub.status,
              subscription_tier: targetPlan.name,
              updated_at: dayjs().toISOString(),
            })
            .eq('id', userId);

          return NextResponse.json({
            success: true,
            data: {
              action: 'changed',
              subscriptionId: subscription.id,
              status: updatedSub.status,
              plan: targetPlan.name,
              periodEnd,
            },
          });
        } catch (stripeErr) {
          console.error('Stripe update failed, falling back to profile-only update:', stripeErr);
          // Fall through to profile-only update
        }
      }

      // No active Stripe subscription or Stripe update failed
      // Just update the profile directly (admin override)
      await supabaseAdmin
        .from('profiles')
        .update({
          subscription_status: 'active',
          subscription_tier: targetPlan.name,
          updated_at: dayjs().toISOString(),
        })
        .eq('id', userId);

      return NextResponse.json({
        success: true,
        data: {
          action: 'profile_updated',
          plan: targetPlan.name,
          note: 'Profile updated directly. No Stripe subscription was modified.',
        },
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('Admin subscription update error:', err);
    const message = err instanceof Error ? err.message : 'Failed to update subscription';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET: Fetch subscription details from Stripe
export async function GET(req: NextRequest) {
  const { isAdmin, error } = await requireAdmin(req);
  if (!isAdmin) return error;

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  try {
    // Get subscription from DB
    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!subscription) {
      return NextResponse.json({
        success: true,
        data: { subscription: null, stripeSubscription: null },
      });
    }

    // Fetch from Stripe for live data
    let stripeSubscription = null;
    try {
      stripeSubscription = await stripe.subscriptions.retrieve(subscription.id);
    } catch {
      // Subscription may not exist in Stripe anymore
    }

    const stripeSubData = stripeSubscription as unknown as { current_period_end?: number } | null;

    return NextResponse.json({
      success: true,
      data: {
        subscription,
        stripeSubscription: stripeSubscription
          ? {
              id: stripeSubscription.id,
              status: stripeSubscription.status,
              cancel_at_period_end: stripeSubscription.cancel_at_period_end,
              current_period_end: stripeSubData?.current_period_end || null,
              canceled_at: stripeSubscription.canceled_at,
            }
          : null,
      },
    });
  } catch (err) {
    console.error('Admin subscription fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch subscription' }, { status: 500 });
  }
}
