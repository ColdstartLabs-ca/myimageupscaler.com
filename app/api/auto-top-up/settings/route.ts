import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { stripe } from '@server/stripe';

async function authenticate(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  return error ? null : data.user;
}

export async function GET(request: NextRequest) {
  const user = await authenticate(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data, error } = await supabaseAdmin
    .from('auto_top_up_settings')
    .select('enabled, pending_enabled, threshold_credits, pack_key, last_refill_at, failure_reason')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to load settings' }, { status: 500 });
  return NextResponse.json({ data });
}

const disableSchema = z.object({ enabled: z.literal(false) }).strict();

export async function PUT(request: NextRequest) {
  const user = await authenticate(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = disableSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'Invalid settings update' }, { status: 400 });
  const { data, error } = await supabaseAdmin
    .from('auto_top_up_settings')
    .update({
      enabled: false,
      pending_enabled: false,
      failure_reason: 'disabled_by_user',
      charge_claim_id: null,
      charge_claimed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)
    .select('enabled, pending_enabled')
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to disable auto top-up' }, { status: 500 });

  const { data: attempt } = await supabaseAdmin
    .from('auto_top_up_attempts')
    .select('id, stripe_payment_intent_id')
    .eq('user_id', user.id)
    .in('status', ['claimed', 'payment_pending'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (attempt?.stripe_payment_intent_id) {
    try {
      await stripe.paymentIntents.cancel(attempt.stripe_payment_intent_id);
    } catch (cancelError) {
      console.error('[AUTO_TOP_UP_DISABLE] PaymentIntent cancellation failed', cancelError);
      return NextResponse.json(
        { error: 'Auto top-up disabled; payment cancellation needs reconciliation' },
        { status: 503 }
      );
    }
  }
  if (attempt?.id) {
    await supabaseAdmin
      .from('auto_top_up_attempts')
      .update({ status: 'cancelled', error_class: 'disabled_by_user' })
      .eq('id', attempt.id);
  }
  return NextResponse.json({ data: data ?? { enabled: false, pending_enabled: false } });
}
