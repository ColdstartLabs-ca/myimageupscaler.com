'use client';

import { JsonLd } from '@client/components/seo/JsonLd';
import { CheckoutModal } from '@client/components/stripe/CheckoutModal';
import { Button } from '@client/components/ui/Button';
import { useCheckoutStore } from '@client/store/checkoutStore';
import { useModalStore } from '@client/store/modalStore';
import { useToastStore } from '@client/store/toastStore';
import { useUserStore } from '@client/store/userStore';
import { prepareAuthRedirect } from '@client/utils/authRedirectManager';
import { clientEnv } from '@shared/config/env';
import { HOMEPAGE_TIERS, isStripePricesConfigured } from '@shared/config/stripe';
import { Check } from 'lucide-react';
import React from 'react';
import { AmbientBackground } from '../../landing/AmbientBackground';

// Generate Product structured data for SEO
const generateProductJsonLd = (tier: (typeof HOMEPAGE_TIERS)[number]) => ({
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: `${clientEnv.APP_NAME} ${tier.name}`,
  description: tier.description,
  brand: {
    '@type': 'Brand',
    name: clientEnv.APP_NAME,
  },
  offers: {
    '@type': 'Offer',
    price: tier.priceValue,
    priceCurrency: 'USD',
    availability: 'https://schema.org/InStock',
    priceValidUntil: new Date(new Date().setFullYear(new Date().getFullYear() + 1))
      .toISOString()
      .split('T')[0],
  },
});

export const Pricing: React.FC = () => {
  const { openAuthModal } = useModalStore();
  const { showToast } = useToastStore();
  const { user } = useUserStore();
  const { isCheckoutModalOpen, activePriceId, openCheckoutModal, closeCheckoutModal } =
    useCheckoutStore();

  const handlePricingClick = (tier: (typeof HOMEPAGE_TIERS)[number]) => {
    // Free tier - just open registration
    if (tier.priceId === null) {
      prepareAuthRedirect('register');
      openAuthModal('register');
      return;
    }

    // Check if Stripe is configured
    if (!isStripePricesConfigured()) {
      showToast({
        message: 'Payment system is not configured. Please try again later.',
        type: 'error',
      });
      return;
    }

    // Check if user is authenticated
    if (!user) {
      // Store checkout intent with price context
      prepareAuthRedirect('checkout', {
        returnTo: window.location.pathname,
        context: { priceId: tier.priceId, planName: tier.name },
      });
      openAuthModal('login');
      showToast({
        message: 'Please sign in to complete your purchase',
        type: 'info',
      });
      return;
    }

    // User is authenticated, open checkout modal
    openCheckoutModal(tier.priceId);
  };

  const handleCheckoutClose = () => {
    closeCheckoutModal();
  };

  const handleCheckoutSuccess = () => {
    showToast({
      message: 'Subscription activated successfully!',
      type: 'success',
    });
  };

  return (
    <section id="pricing" className="py-32 bg-main relative overflow-hidden">
      <AmbientBackground variant="section" />
      {/* Product structured data for SEO */}
      {HOMEPAGE_TIERS.filter(tier => tier.priceValue > 0).map(tier => (
        <JsonLd key={`jsonld-${tier.name}`} data={generateProductJsonLd(tier)} />
      ))}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-24">
          <h2 className="text-sm font-bold uppercase tracking-widest text-secondary mb-3">
            Pricing
          </h2>
          <h2 className="text-4xl font-black text-white sm:text-6xl">
            Simple, <span className="gradient-text-primary">transparent</span> pricing
          </h2>
          <p className="mt-6 text-xl text-text-secondary font-light max-w-2xl mx-auto">
            Professional quality enhancement at prosumer prices.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-12 lg:grid-cols-3 items-center">
          {HOMEPAGE_TIERS.map(tier => (
            <div
              key={tier.name}
              className={`
                relative flex flex-col p-8 glass-card-2025 transition-all duration-500
                ${tier.recommended ? 'border-secondary/50 ring-4 ring-secondary/20 lg:scale-110 z-10 bg-white/5' : 'bg-white/[0.02]'}
              `}
            >
              {tier.recommended && (
                <>
                  <div className="absolute inset-0 -z-10 bg-gradient-to-b from-secondary/10 to-transparent blur-2xl opacity-50" />
                  <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-accent to-secondary text-white px-6 py-1.5 rounded-full text-xs font-black uppercase tracking-widest shadow-lg shadow-accent/20 border border-border">
                    Most Popular
                  </div>
                </>
              )}

              <div className="mb-8">
                <h3 className="text-2xl font-black text-white tracking-tight">{tier.name}</h3>
                <p className="text-text-secondary text-sm mt-3 font-light leading-relaxed">
                  {tier.description}
                </p>
              </div>

              <div className="mb-8 flex items-baseline gap-1">
                <span className="text-5xl font-black text-white tracking-tight">{tier.price}</span>
                <span className="text-text-muted font-medium">{tier.period}</span>
              </div>

              <ul className="space-y-4 mb-10 flex-1">
                {tier.features.map(feature => (
                  <li key={feature} className="flex items-start text-text-secondary group/item">
                    <div className="h-5 w-5 rounded-full bg-emerald-500/10 flex items-center justify-center mr-3 mt-0.5 group-hover/item:bg-emerald-500/20 transition-colors">
                      <Check className="h-3 w-3 text-emerald-400" strokeWidth={3} />
                    </div>
                    <span className="text-sm font-light group-hover/item:text-white transition-colors">
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <Button
                variant={tier.variant}
                className={`w-full py-6 rounded-xl font-bold text-lg shadow-xl transition-all duration-300 ${tier.recommended ? 'shadow-accent/20' : ''}`}
                onClick={() => handlePricingClick(tier)}
              >
                {tier.cta}
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Embedded Checkout Modal */}
      {isCheckoutModalOpen && activePriceId && (
        <CheckoutModal
          priceId={activePriceId}
          onClose={handleCheckoutClose}
          onSuccess={handleCheckoutSuccess}
        />
      )}
    </section>
  );
};
