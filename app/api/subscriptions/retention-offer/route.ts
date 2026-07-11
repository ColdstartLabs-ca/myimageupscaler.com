import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { getPlanByKey, resolvePriceId } from '@shared/config/subscription.utils';
import { resolveCancellationRetentionOffer } from '@shared/config/cancellation-retention';
import { postRetentionSubscriptionChange } from '@/app/api/subscription/change/route';

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

const RETENTION_CLAIM_LEASE_MS = 5 * 60 * 1000;

function retentionRolloutBucket(userId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < userId.length; index++) {
    hash ^= userId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

async function recordRetentionEvent(event: Record<string, unknown>): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('subscription_retention_events')
    .upsert(event, { onConflict: 'event_key', ignoreDuplicates: true });
  return !error;
}

async function getRetentionRolloutPercent(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('subscription_retention_rollout')
    .select('enabled, treatment_percent')
    .eq('id', true)
    .maybeSingle();
  if (error) return 0;
  if (!data) return 0;
  return data.enabled ? data.treatment_percent : 0;
}

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
    .select('id, price_id')
    .eq('user_id', user.id)
    .in('status', ['active', 'trialing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (!subscription?.price_id) return NextResponse.json({ data: { offer: null } });
  const current = resolvePriceId(subscription.price_id);
  if (!current) return NextResponse.json({ data: { offer: null } });
  const offer =
    current.type === 'plan'
      ? resolveCancellationRetentionOffer(parsed.data.reason, current.key)
      : null;
  if (!offer) return NextResponse.json({ data: { offer: null } });
  const target = getPlanByKey(offer.targetPlanKey);
  const cohortSince = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: existingCohort, error: cohortError } = await supabaseAdmin
    .from('subscription_retention_events')
    .select('variant')
    .eq('subscription_id', subscription.id)
    .in('event_type', ['offer_shown', 'holdout_assigned'])
    .gte('occurred_at', cohortSince)
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cohortError) {
    return NextResponse.json({ error: 'Unable to record retention eligibility' }, { status: 503 });
  }
  const treatment = existingCohort
    ? existingCohort.variant === 'treatment'
    : retentionRolloutBucket(user.id) < (await getRetentionRolloutPercent());
  const measured = await recordRetentionEvent({
    event_key: `${treatment ? 'shown' : 'holdout'}:${subscription.id}`,
    subscription_id: subscription.id,
    user_id: user.id,
    event_type: treatment ? 'offer_shown' : 'holdout_assigned',
    variant: treatment ? 'treatment' : 'holdout',
    reason: parsed.data.reason,
    current_price_id: subscription.price_id,
    target_price_id: target?.stripePriceId,
    current_monthly_cents: current.type === 'plan' ? current.priceInCents : null,
    target_monthly_cents: target?.priceInCents,
  });
  if (!measured) {
    return NextResponse.json({ error: 'Unable to record retention eligibility' }, { status: 500 });
  }
  if (!treatment) return NextResponse.json({ data: { offer: null } });
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
    .select(
      'id, price_id, scheduled_price_id, scheduled_change_date, cancel_at_period_end, retention_claim_id, retention_claimed_at'
    )
    .eq('user_id', user.id)
    .in('status', ['active', 'trialing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!subscription?.price_id) {
    return NextResponse.json({ error: 'No active subscription' }, { status: 400 });
  }
  if (subscription.cancel_at_period_end) {
    return NextResponse.json(
      { error: 'Subscription cancellation is already scheduled' },
      { status: 409 }
    );
  }

  const current = resolvePriceId(subscription.price_id);
  if (!current) return NextResponse.json({ error: 'Offer is no longer eligible' }, { status: 409 });
  const offer =
    current.type === 'plan'
      ? resolveCancellationRetentionOffer(parsed.data.reason, current.key)
      : null;
  const target = offer ? getPlanByKey(offer.targetPlanKey) : null;
  if (!offer || !target?.stripePriceId) {
    return NextResponse.json({ error: 'Offer is no longer eligible' }, { status: 409 });
  }

  const cohortSince = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: existingCohort, error: cohortError } = await supabaseAdmin
    .from('subscription_retention_events')
    .select('variant')
    .eq('subscription_id', subscription.id)
    .in('event_type', ['offer_shown', 'holdout_assigned'])
    .gte('occurred_at', cohortSince)
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cohortError) {
    return NextResponse.json({ error: 'Unable to verify retention eligibility' }, { status: 503 });
  }
  const treatment = existingCohort
    ? existingCohort.variant === 'treatment'
    : retentionRolloutBucket(user.id) < (await getRetentionRolloutPercent());
  if (!treatment) {
    return NextResponse.json({ error: 'Offer is no longer eligible' }, { status: 409 });
  }

  const recordAccepted = () =>
    recordRetentionEvent({
      event_key: `accepted:${subscription.id}:${target.stripePriceId}`,
      subscription_id: subscription.id,
      user_id: user.id,
      event_type: 'offer_accepted',
      variant: 'treatment',
      reason: parsed.data.reason,
      current_price_id: subscription.price_id,
      target_price_id: target.stripePriceId,
      current_monthly_cents: current.type === 'plan' ? current.priceInCents : null,
      target_monthly_cents: target.priceInCents,
    });

  if (
    subscription.scheduled_price_id === target.stripePriceId &&
    subscription.scheduled_change_date
  ) {
    const { data: acceptedEvent, error: acceptedEventError } = await supabaseAdmin
      .from('subscription_retention_events')
      .select('event_key')
      .eq('subscription_id', subscription.id)
      .eq('event_type', 'offer_accepted')
      .eq('target_price_id', target.stripePriceId)
      .limit(1)
      .maybeSingle();
    if (acceptedEventError) {
      return NextResponse.json(
        { error: 'Unable to verify retention offer state' },
        { status: 503 }
      );
    }
    if (!acceptedEvent && !subscription.retention_claim_id) {
      return NextResponse.json(
        { error: 'A different downgrade is already scheduled for this subscription' },
        { status: 409 }
      );
    }
    if (subscription.retention_claim_id) {
      const { error: claimCleanupError } = await supabaseAdmin
        .from('subscriptions')
        .update({
          retention_claim_id: null,
          retention_claimed_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscription.id)
        .eq('retention_claim_id', subscription.retention_claim_id);
      if (claimCleanupError) {
        return NextResponse.json({ error: 'Unable to finalize retention offer' }, { status: 500 });
      }
    }
    if (!(await recordAccepted())) {
      return NextResponse.json(
        { error: 'Unable to record accepted retention offer' },
        { status: 500 }
      );
    }
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

  const attemptId = subscription.retention_claim_id ?? crypto.randomUUID();
  const claimedAt = new Date();
  let claimQuery = supabaseAdmin
    .from('subscriptions')
    .update({
      retention_claim_id: attemptId,
      retention_claimed_at: claimedAt.toISOString(),
      updated_at: claimedAt.toISOString(),
    })
    .eq('id', subscription.id)
    .eq('cancel_at_period_end', false);

  if (subscription.retention_claim_id) {
    const leaseStartedAt = Date.parse(subscription.retention_claimed_at ?? '');
    if (
      Number.isFinite(leaseStartedAt) &&
      claimedAt.getTime() - leaseStartedAt < RETENTION_CLAIM_LEASE_MS
    ) {
      return NextResponse.json(
        {
          success: true,
          data: { subscription_id: subscription.id, status: 'processing', idempotent_replay: true },
        },
        { status: 202 }
      );
    }
    claimQuery = claimQuery.eq('retention_claim_id', subscription.retention_claim_id);
  } else {
    claimQuery = claimQuery.is('scheduled_price_id', null).is('retention_claim_id', null);
  }

  const { data: claim, error: claimError } = await claimQuery.select('id').maybeSingle();
  if (claimError) {
    return NextResponse.json({ error: 'Unable to claim retention change' }, { status: 500 });
  }
  if (!claim) {
    return NextResponse.json(
      {
        success: true,
        data: { subscription_id: subscription.id, status: 'processing', idempotent_replay: true },
      },
      { status: 202 }
    );
  }

  const response = await postRetentionSubscriptionChange(
    new NextRequest(new URL('/api/subscription/change', request.url), {
      method: 'POST',
      headers: {
        authorization,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ targetPriceId: target.stripePriceId }),
    }),
    `retention:${user.id}:${subscription.id}:${target.stripePriceId}:${attemptId}`
  );
  const cleanup = await supabaseAdmin
    .from('subscriptions')
    .update(
      response.ok
        ? {
            retention_claim_id: null,
            retention_claimed_at: null,
            updated_at: new Date().toISOString(),
          }
        : {
            scheduled_price_id: null,
            scheduled_change_date: null,
            retention_claim_id: null,
            retention_claimed_at: null,
            updated_at: new Date().toISOString(),
          }
    )
    .eq('id', subscription.id)
    .eq('retention_claim_id', attemptId)
    .select('id')
    .maybeSingle();
  if (cleanup.error) {
    return NextResponse.json({ error: 'Unable to finalize retention change' }, { status: 500 });
  }
  if (!response.ok && !cleanup.data) {
    return NextResponse.json({ error: 'Retention change recovery conflicted' }, { status: 409 });
  }
  if (response.ok && !(await recordAccepted())) {
    return NextResponse.json(
      { error: 'Unable to record accepted retention offer' },
      { status: 500 }
    );
  }
  return response;
}
