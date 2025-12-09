'use client';

import React from 'react';
import { Check } from 'lucide-react';
import Button from '@client/components/pixelperfect/Button';
import { JsonLd } from '@client/components/seo/JsonLd';
import { useModalStore } from '@client/store/modalStore';
import { useToastStore } from '@client/store/toastStore';
import { useCheckoutStore } from '@client/store/checkoutStore';
import { CheckoutModal } from '@client/components/stripe/CheckoutModal';
import { HOMEPAGE_TIERS, isStripePricesConfigured } from '@shared/config/stripe';
import { useUserStore } from '@client/store/userStore';

// Generate Product structured data for SEO
const generateProductJsonLd = (tier: (typeof HOMEPAGE_TIERS)[number]) => ({
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: `PixelPerfect AI ${tier.name}`,
  description: tier.description,
  brand: {
    '@type': 'Brand',
    name: 'PixelPerfect AI',
  },
  offers: {
    '@type': 'Offer',
    price: tier.priceValue.toFixed(2),
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
  const {
    isCheckoutModalOpen,
    activePriceId,
    setPendingCheckout,
    openCheckoutModal,
    closeCheckoutModal,
  } = useCheckoutStore();

  const handlePricingClick = (tier: (typeof HOMEPAGE_TIERS)[number]) => {
    // Free tier - just open registration
    if (tier.priceId === null) {
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
      // Save the price ID and prompt user to sign in
      setPendingCheckout(tier.priceId);
      openAuthModal('login');
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
    <section id="pricing" className="py-20 bg-slate-50">
      {/* Product structured data for SEO */}
      {HOMEPAGE_TIERS.filter(tier => tier.priceValue > 0).map(tier => (
        <JsonLd key={`jsonld-${tier.name}`} data={generateProductJsonLd(tier)} />
      ))}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">
            Simple, transparent pricing
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Professional quality enhancement at prosumer prices.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {HOMEPAGE_TIERS.map(tier => (
            <div
              key={tier.name}
              className={`
                relative flex flex-col p-8 bg-white rounded-2xl shadow-sm border
                ${tier.recommended ? 'border-indigo-600 ring-2 ring-indigo-600 ring-opacity-50 scale-105 z-10' : 'border-slate-200'}
              `}
            >
              {tier.recommended && (
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-indigo-600 text-white px-4 py-1 rounded-full text-sm font-medium uppercase tracking-wide">
                  Target Tier
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-semibold text-slate-900">{tier.name}</h3>
                <p className="text-slate-500 text-sm mt-2">{tier.description}</p>
              </div>

              <div className="mb-6">
                <span className="text-4xl font-bold text-slate-900">{tier.price}</span>
                <span className="text-slate-500">{tier.period}</span>
              </div>

              <ul className="space-y-4 mb-8 flex-1">
                {tier.features.map(feature => (
                  <li key={feature} className="flex items-start text-slate-600">
                    <Check className="h-5 w-5 text-green-500 mr-3 flex-shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                variant={tier.variant}
                className="w-full"
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
