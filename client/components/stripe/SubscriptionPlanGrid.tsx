'use client';

import { useRef, useEffect, useCallback } from 'react';
import { PricingCard } from './PricingCard';
import { STRIPE_PRICES, SUBSCRIPTION_PLANS } from '@shared/config/stripe';
import { analytics } from '@client/analytics';

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
  /** Pricing region for regional discounts (e.g., 'brazil', 'standard') */
  pricingRegion?: string;
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

type TPlanKey = 'hobby' | 'pro' | 'business';

export function SubscriptionPlanGrid({
  discountPercent,
  pricingRegion = 'standard',
  currentSubscriptionPrice,
  currentPriceId,
  onSelect,
  planOverrides = {},
  className = 'grid md:grid-cols-3 gap-4',
}: ISubscriptionPlanGridProps): JSX.Element {
  // Track plan hover/focus time and switches (using refs to avoid re-renders)
  const hoverStartTimeRef = useRef<number>(0);
  const planSwitchCountRef = useRef<number>(0);
  const lastHoveredPlanRef = useRef<TPlanKey | null>(null);
  const initialSelectedPlanRef = useRef<TPlanKey | null>(null);
  const selectionStartTimeRef = useRef<number>(Date.now());

  // Track plan hover time (indicates comparison behavior)
  const handlePlanHover = useCallback((planKey: TPlanKey | null) => {
    const now = Date.now();

    // If leaving a plan, track the time spent hovering
    if (hoverStartTimeRef.current > 0 && lastHoveredPlanRef.current) {
      const hoverTimeMs = now - hoverStartTimeRef.current;
      if (hoverTimeMs >= 500) {
        // Only track hovers longer than 500ms
        const plan = PLANS.find(p => p.key === lastHoveredPlanRef.current);
        if (plan) {
          analytics.track('pricing_plan_viewed', {
            planName: plan.key,
            priceId: plan.priceId,
          });
        }
      }
    }

    // Track plan switch
    if (planKey && lastHoveredPlanRef.current && planKey !== lastHoveredPlanRef.current) {
      planSwitchCountRef.current += 1;
    }

    // Update refs (no state update to avoid re-renders)
    if (planKey) {
      hoverStartTimeRef.current = now;
      lastHoveredPlanRef.current = planKey;
    } else {
      hoverStartTimeRef.current = 0;
    }
  }, []);

  // Fire pricing_plan_viewed on any click on the plan card wrapper
  const handlePlanClick = useCallback((planKey: TPlanKey, planPriceId: string) => {
    const plan = PLANS.find(p => p.key === planKey);
    if (!plan) return;
    analytics.track('pricing_plan_viewed', {
      planName: plan.key,
      priceId: planPriceId,
    });
  }, []);

  // Wrap onSelect to track plan-to-plan switches (only used when parent provides onSelect)
  const handleSelect = useCallback(
    (priceId: string) => {
      const plan = PLANS.find(p => p.priceId === priceId);
      if (!plan) return;

      // Track initial vs final selection
      if (initialSelectedPlanRef.current === null) {
        initialSelectedPlanRef.current = plan.key;
      } else if (initialSelectedPlanRef.current !== plan.key) {
        // Track plan switch before checkout
        const selectionTimeMs = Date.now() - selectionStartTimeRef.current;
        analytics.track('checkout_step_time', {
          step: 'plan_selection',
          timeSpentMs: selectionTimeMs,
          priceId,
          cumulativeTimeMs: selectionTimeMs,
        });
      }

      if (onSelect) {
        onSelect(priceId);
      }
    },
    [onSelect]
  );

  // Reset tracking on unmount
  useEffect(() => {
    return () => {
      // Track any remaining hover time
      if (hoverStartTimeRef.current > 0 && lastHoveredPlanRef.current) {
        const hoverTimeMs = Date.now() - hoverStartTimeRef.current;
        if (hoverTimeMs >= 500) {
          const plan = PLANS.find(p => p.key === lastHoveredPlanRef.current);
          if (plan) {
            analytics.track('pricing_plan_viewed', {
              planName: plan.key,
              priceId: plan.priceId,
            });
          }
        }
      }
    };
  }, []);

  return (
    <div className={className}>
      {PLANS.map(({ key, config, priceId }) => {
        const overrides = planOverrides[key] ?? {};
        const isCurrentPlan = currentPriceId === priceId;
        return (
          <div
            key={priceId}
            className="h-full"
            onMouseEnter={() => handlePlanHover(key)}
            onMouseLeave={() => handlePlanHover(null)}
            onFocus={() => handlePlanHover(key)}
            onBlur={() => handlePlanHover(null)}
            onClick={() => handlePlanClick(key, priceId)}
          >
            <PricingCard
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
              pricingRegion={pricingRegion}
              currentSubscriptionPrice={currentSubscriptionPrice}
              disabled={overrides.disabled ?? isCurrentPlan}
              scheduled={overrides.scheduled}
              onCancelScheduled={overrides.onCancelScheduled}
              cancelingScheduled={overrides.cancelingScheduled}
              loading={overrides.loading}
              onSelect={onSelect ? () => handleSelect(priceId) : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}
