'use client';

import { PricingCard } from './PricingCard';
import { STRIPE_PRICES, SUBSCRIPTION_PLANS } from '@shared/config/stripe';

interface IPlanState {
  disabled?: boolean;
  scheduled?: boolean;
  onCancelScheduled?: () => void;
  cancelingScheduled?: boolean;
  loading?: boolean;
}

interface ISubscriptionPlanGridProps {
  /** Required — no default, prevents the "forgot discountPercent" bug */
  discountPercent: number;
  currentSubscriptionPrice?: number | null;
  /** Auto-disables the matching plan card */
  currentPriceId?: string;
  onSelect?: (priceId: string) => void;
  /** Per-plan overrides for scheduled/loading states, keyed by plan key */
  planOverrides?: Partial<Record<'hobby' | 'pro' | 'business', IPlanState>>;
  className?: string;
}

const PLANS = [
  {
    key: 'hobby' as const,
    config: SUBSCRIPTION_PLANS.HOBBY_MONTHLY,
    priceId: STRIPE_PRICES.HOBBY_MONTHLY,
  },
  {
    key: 'pro' as const,
    config: SUBSCRIPTION_PLANS.PRO_MONTHLY,
    priceId: STRIPE_PRICES.PRO_MONTHLY,
  },
  {
    key: 'business' as const,
    config: SUBSCRIPTION_PLANS.BUSINESS_MONTHLY,
    priceId: STRIPE_PRICES.BUSINESS_MONTHLY,
  },
] as const;

export function SubscriptionPlanGrid({
  discountPercent,
  currentSubscriptionPrice,
  currentPriceId,
  onSelect,
  planOverrides = {},
  className = 'grid md:grid-cols-3 gap-4',
}: ISubscriptionPlanGridProps): JSX.Element {
  return (
    <div className={className}>
      {PLANS.map(({ key, config, priceId }) => {
        const overrides = planOverrides[key] ?? {};
        const isCurrentPlan = currentPriceId === priceId;
        return (
          <PricingCard
            key={priceId}
            name={config.name}
            description={config.description}
            price={config.price}
            interval={config.interval as 'month' | 'year'}
            features={config.features}
            priceId={priceId}
            recommended={
              'recommended' in config
                ? (config as { recommended?: boolean }).recommended
                : undefined
            }
            discountPercent={discountPercent}
            currentSubscriptionPrice={currentSubscriptionPrice}
            disabled={overrides.disabled ?? isCurrentPlan}
            scheduled={overrides.scheduled}
            onCancelScheduled={overrides.onCancelScheduled}
            cancelingScheduled={overrides.cancelingScheduled}
            loading={overrides.loading}
            onSelect={onSelect ? () => onSelect(priceId) : undefined}
          />
        );
      })}
    </div>
  );
}
