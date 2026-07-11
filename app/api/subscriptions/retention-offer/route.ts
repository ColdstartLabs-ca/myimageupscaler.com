import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { assertKnownPriceId, getPlanByKey } from '@shared/config/subscription.utils';
import { resolveCancellationRetentionOffer } from '@shared/config/cancellation-retention';
import { POST as changeSubscription } from '@/app/api/subscription/change/route';

const schema = z.object({
  reason: z.enum([
    'too_expensive',
    'not_using_enough',
    'missing_features',
    'switching_competitor',
    'technical_issues',
    'other',
  ]),
});

export async function POST(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid reason' }, { status: 400 });
  const { data: subscription } = await supabaseAdmin
    .from('subscriptions')
    .select('price_id')
    .eq('user_id', user.id)
    .in('status', ['active', 'trialing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (!subscription?.price_id) return NextResponse.json({ data: { offer: null } });
  const current = assertKnownPriceId(subscription.price_id);
  const offer =
    current.type === 'plan'
      ? resolveCancellationRetentionOffer(parsed.data.reason, current.key)
      : null;
  if (!offer) return NextResponse.json({ data: { offer: null } });
  const target = getPlanByKey(offer.targetPlanKey);
  return NextResponse.json({
    data: {
      offer: {
        targetPlanKey: offer.targetPlanKey,
        targetPlanName: target?.name ?? offer.targetPlanKey,
      },
    },
  });
}

export async function PUT(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  const token = authorization?.replace('Bearer ', '');
  if (!token || !authorization) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = schema.strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'Invalid offer request' }, { status: 400 });

  const { data: subscription } = await supabaseAdmin
    .from('subscriptions')
    .select('id, price_id, scheduled_price_id, scheduled_change_date')
    .eq('user_id', user.id)
    .in('status', ['active', 'trialing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!subscription?.price_id) {
    return NextResponse.json({ error: 'No active subscription' }, { status: 400 });
  }

  const current = assertKnownPriceId(subscription.price_id);
  const offer =
    current.type === 'plan'
      ? resolveCancellationRetentionOffer(parsed.data.reason, current.key)
      : null;
  const target = offer ? getPlanByKey(offer.targetPlanKey) : null;
  if (!offer || !target?.stripePriceId) {
    return NextResponse.json({ error: 'Offer is no longer eligible' }, { status: 409 });
  }

  if (subscription.scheduled_price_id === target.stripePriceId) {
    return NextResponse.json({
      success: true,
      data: {
        subscription_id: subscription.id,
        status: 'scheduled',
        scheduled_price_id: target.stripePriceId,
        effective_immediately: false,
        effective_date: subscription.scheduled_change_date,
        idempotent_replay: true,
      },
    });
  }

  return changeSubscription(
    new NextRequest(new URL('/api/subscription/change', request.url), {
      method: 'POST',
      headers: {
        authorization,
        'content-type': 'application/json',
        'x-retention-idempotency-key': `retention:${user.id}:${subscription.id}:${target.stripePriceId}`,
      },
      body: JSON.stringify({ targetPriceId: target.stripePriceId }),
    })
  );
}
