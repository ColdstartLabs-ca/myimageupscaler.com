import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@server/stripe';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

export async function POST(req: NextRequest) {
  const userId = req.headers.get('X-User-Id');
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Fetch profile to get stripe_customer_id
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single();

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

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Account delete error:', err);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
