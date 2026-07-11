import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { assertKnownPriceId, getPlanByKey } from '@shared/config/subscription.utils';
import { resolveCancellationRetentionOffer } from '@shared/config/cancellation-retention';

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
