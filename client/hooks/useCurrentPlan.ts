'use client';

import { useMemo, useEffect, useRef } from 'react';
import { useProfile, useSubscription, useUserStore } from '@client/store/userStore';
import { getPlanForPriceId } from '@shared/config/stripe';

export type TPlanKey = 'free' | 'starter' | 'hobby' | 'pro' | 'business';

const TIER_TO_PLAN: Record<string, TPlanKey> = {
  starter: 'starter',
  hobby: 'hobby',
  pro: 'pro',
  professional: 'pro',
  business: 'business',
};

function resolveCurrentPlan(tier?: string | null): TPlanKey {
  if (!tier) return 'free';
  return TIER_TO_PLAN[tier.toLowerCase()] ?? 'free';
}

/**
 * Returns the user's current subscription state for pricing UIs.
 * Replaces duplicated resolveCurrentPlan / currentSubscriptionPrice logic
 * in PurchaseModal, UpgradePlanModal, and PricingPageClient.
 */
export function useCurrentPlan(): {
  planKey: TPlanKey;
  priceId: string | null;
  subscriptionPrice: number | null;
  isFreeUser: boolean;
  isPaidUser: boolean;
} {
  const profile = useProfile();
  const subscription = useSubscription();
  const isAuthenticated = useUserStore(state => state.isAuthenticated);
  const invalidate = useUserStore(state => state.invalidate);
  const hasRefreshedRef = useRef(false);

  // If the profile shows a paid tier but subscription details are missing from the
  // store (stale cache from before subscription was created), refresh once from DB.
  useEffect(() => {
    const hasPaidProfile =
      !!profile?.subscription_tier && profile.subscription_tier.toLowerCase() !== 'free';
    if (isAuthenticated && hasPaidProfile && subscription === null && !hasRefreshedRef.current) {
      hasRefreshedRef.current = true;
      invalidate();
    }
  }, [isAuthenticated, profile?.subscription_tier, subscription, invalidate]);

  return useMemo(() => {
    const planKey = resolveCurrentPlan(profile?.subscription_tier);
    const priceId = subscription?.price_id ?? null;
    const subscriptionPrice = priceId ? (getPlanForPriceId(priceId)?.price ?? null) : null;

    return {
      planKey,
      priceId,
      subscriptionPrice,
      isFreeUser: planKey === 'free',
      isPaidUser: planKey !== 'free',
    };
  }, [profile?.subscription_tier, subscription?.price_id]);
}
