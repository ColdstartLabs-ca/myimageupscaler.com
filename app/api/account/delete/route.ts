import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@server/stripe';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { trackServerEvent } from '@server/analytics';
import { serverEnv } from '@shared/config/env';

export async function POST(req: NextRequest) {
  const userId = req.headers.get('X-User-Id');
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Fetch profile to get stripe_customer_id and other account details
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id, created_at')
      .eq('id', userId)
      .single();

    // Fetch subscription status
    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('status')
      .eq('user_id', userId)
      .maybeSingle();

    // Fetch remaining credits
    const { data: creditTransactions } = await supabaseAdmin
      .from('credit_transactions')
      .select('amount')
      .eq('user_id', userId);

    const totalCredits = creditTransactions?.reduce((sum, tx) => sum + tx.amount, 0) ?? 0;
    const hadCreditsRemaining = totalCredits > 0;
    const hadStripeCustomer = !!profile?.stripe_customer_id;
    const hadSubscription = !!subscription && subscription.status === 'active';

    // Calculate account age in days
    let accountAgeDays;
    if (profile?.created_at) {
      const createdAt = new Date(profile.created_at);
      const now = new Date();
      accountAgeDays = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
    }

    // Cancel Stripe subscriptions and delete customer if exists
    if (profile?.stripe_customer_id) {
      const customerId = profile.stripe_customer_id;
      try {
        const subscriptions = await stripe.subscriptions.list({
          customer: customerId,
          status: 'active',
        });
        await Promise.allSettled(
          subscriptions.data.map(sub => stripe.subscriptions.cancel(sub.id))
        );
        await stripe.customers.del(customerId);
      } catch (stripeErr) {
        console.error('Stripe cleanup error (continuing with deletion):', stripeErr);
      }
    }

    // Cascade delete: credit_transactions, subscriptions, email_preferences, profiles
    const [transactionsResult, subscriptionsResult, emailPrefsResult] = await Promise.allSettled([
      supabaseAdmin.from('credit_transactions').delete().eq('user_id', userId),
      supabaseAdmin.from('subscriptions').delete().eq('user_id', userId),
      supabaseAdmin.from('email_preferences').delete().eq('user_id', userId),
    ]);

    if (transactionsResult.status === 'rejected') {
      console.warn('Error deleting credit_transactions:', transactionsResult.reason);
    }
    if (subscriptionsResult.status === 'rejected') {
      console.warn('Error deleting subscriptions:', subscriptionsResult.reason);
    }
    if (emailPrefsResult.status === 'rejected') {
      console.warn('Error deleting email_preferences:', emailPrefsResult.reason);
    }

    const { error: profileError } = await supabaseAdmin.from('profiles').delete().eq('id', userId);

    if (profileError) {
      console.error('Error deleting profile:', profileError);
      return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
    }

    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authError) {
      console.error('Error deleting auth user:', authError);
      return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
    }

    // Track account deletion event server-side
    await trackServerEvent(
      'account_delete_completed',
      {
        method: 'self_serve',
        hadStripeCustomer,
        hadSubscription,
        hadCreditsRemaining,
        accountAgeDays,
      },
      { apiKey: serverEnv.AMPLITUDE_API_KEY, userId }
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Account delete error:', err);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
