'use client';

import { JsonLd } from '@client/components/seo/JsonLd';
import { LandingSection } from '@client/components/landing/LandingSection';
import { CreditPackSelector, SubscriptionPlanGrid, TrustBadges } from '@client/components/stripe';
import { useRegionTier } from '@client/hooks/useRegionTier';
import { useModalStore } from '@client/store/modalStore';
import { getFreeCreditsForTier } from '@/lib/anti-freeloader/region-classifier';
import { clientEnv } from '@shared/config/env';
import { getEnabledPlans } from '@shared/config/subscription.utils';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

type TPricingTab = 'credits' | 'subscribe';

/** Calculate discounted price for a tier, rounding to 2 decimal places. */
export function calculateDiscountedPrice(priceValue: number, discountPercent: number): number {
  if (discountPercent <= 0 || priceValue === 0) return priceValue;
  return Math.round(priceValue * (1 - discountPercent / 100) * 100) / 100;
}

function generatePlanJsonLd(plan: ReturnType<typeof getEnabledPlans>[number], priceUsd: number) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${clientEnv.APP_NAME} ${plan.name}`,
    description: plan.description,
    brand: {
      '@type': 'Brand',
      name: clientEnv.APP_NAME,
    },
    offers: {
      '@type': 'Offer',
      price: priceUsd,
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      priceValidUntil: new Date(new Date().setFullYear(new Date().getFullYear() + 1))
        .toISOString()
        .split('T')[0],
    },
  };
}

function FreeTierCard({
  freeCredits,
  onStartFree,
}: {
  freeCredits: number;
  onStartFree: () => void;
}): JSX.Element {
  const features = [
    `${freeCredits} free credits to start`,
    '2x & 4x upscaling',
    'Basic enhancement',
    'No watermark',
  ];

  return (
    <div className="relative flex h-full flex-col rounded-xl border border-surface-light bg-surface">
      <div className="flex h-full flex-col p-4">
        <div className="mb-3 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-text-secondary">
            Free
          </p>
          <p className="mt-0.5 text-[11px] text-text-secondary/60">For testing and personal use</p>
        </div>

        <div className="mb-3 text-center">
          <div className="flex items-baseline justify-center gap-0.5">
            <span className="text-sm font-medium text-text-primary">$</span>
            <span className="text-3xl font-bold tabular-nums text-text-primary">0</span>
          </div>
          <p className="mt-0.5 text-[11px] text-text-secondary">/ month</p>
        </div>

        <div className="mb-3 border-t border-surface-light" />

        <ul className="mb-4 flex-grow space-y-1.5">
          {features.map(feature => (
            <li key={feature} className="flex items-start gap-2">
              <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-success" strokeWidth={2.5} />
              <span className="text-xs leading-tight text-text-primary/80">{feature}</span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onStartFree}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-surface-light bg-surface-light/50 px-4 py-2.5 text-sm font-bold text-text-primary transition-all duration-150 hover:-translate-y-0.5 hover:bg-surface-light"
        >
          Start for Free
        </button>
      </div>
    </div>
  );
}

export function Pricing(): JSX.Element {
  const t = useTranslations('homepage');
  const tPricing = useTranslations('pricing');
  const { openAuthModal } = useModalStore();
  const { discountPercent, tier } = useRegionTier();
  const freeCredits = getFreeCreditsForTier(tier ?? 'standard');
  const [activeTab, setActiveTab] = useState<TPricingTab>('credits');

  const subscriptionPlans = useMemo(
    () =>
      getEnabledPlans()
        .filter(plan => plan.interval === 'month')
        .sort((a, b) => a.displayOrder - b.displayOrder),
    []
  );

  const productSchemas = useMemo(
    () =>
      subscriptionPlans.map(plan => {
        const priceUsd = calculateDiscountedPrice(plan.priceInCents / 100, discountPercent);
        return generatePlanJsonLd(plan, priceUsd);
      }),
    [discountPercent, subscriptionPlans]
  );

  return (
    <LandingSection
      id="pricing"
      ambient
      fadeTop
      fadeBottom
      className="pricing-section py-24"
      innerClassName="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"
    >
      {productSchemas.map((schema, index) => (
        <JsonLd key={`pricing-jsonld-${index}`} data={schema} />
      ))}

      <div className="mb-12 text-center">
        <p className="mb-3 text-sm font-bold uppercase tracking-widest text-secondary">Pricing</p>
        <h2 className="text-3xl font-black text-white sm:text-5xl">
          Simple, <span className="gradient-text-primary">transparent</span> pricing
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg font-light text-text-secondary">
          {t('pricingCtaDescription')}
        </p>
      </div>

      <div className="mb-10 flex justify-center">
        <div className="flex gap-1 rounded-xl border border-surface-light bg-surface-light/50 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('credits')}
            className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-all duration-200 ${
              activeTab === 'credits'
                ? 'scale-[1.02] gradient-cta text-white shadow-md'
                : 'text-text-secondary hover:bg-surface-light hover:text-white'
            }`}
          >
            Buy Credits
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('subscribe')}
            className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-all duration-200 ${
              activeTab === 'subscribe'
                ? 'scale-[1.02] gradient-cta text-white shadow-md'
                : 'text-text-secondary hover:bg-surface-light hover:text-white'
            }`}
          >
            Subscribe
            <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
              Best Value
            </span>
          </button>
        </div>
      </div>

      {activeTab === 'credits' ? (
        <div className="mx-auto max-w-5xl" data-testid="landing-credit-packs">
          <p className="mb-8 text-center text-lg font-light text-text-secondary">
            {tPricing('creditPacks.subtitle')}
          </p>
          <CreditPackSelector discountPercent={discountPercent} />
          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={() => setActiveTab('subscribe')}
              className="text-sm text-accent underline transition-colors hover:text-accent-hover"
            >
              {tPricing('creditPacks.comparePlans')}
            </button>
          </div>
        </div>
      ) : (
        <div
          className="mx-auto grid max-w-6xl grid-cols-1 gap-4 lg:grid-cols-4"
          data-testid="landing-subscriptions"
        >
          <FreeTierCard freeCredits={freeCredits} onStartFree={() => openAuthModal('register')} />
          <div className="lg:col-span-3">
            <SubscriptionPlanGrid
              discountPercent={discountPercent}
              className="grid h-full gap-4 md:grid-cols-3"
            />
          </div>
        </div>
      )}

      <div className="mx-auto mt-10 max-w-3xl">
        <TrustBadges className="border border-surface-light/60 bg-surface/40" />
      </div>
    </LandingSection>
  );
}
