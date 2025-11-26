'use client';

import { PricingCard } from '@client/components/stripe';
import {
  STRIPE_PRICES,
  CREDIT_PACKS,
  SUBSCRIPTION_PLANS,
  isStripePricesConfigured,
} from '@shared/config/stripe';

export default function PricingPage() {
  const pricesConfigured = isStripePricesConfigured();

  return (
    <main className="flex-1">
      <div className="container mx-auto py-16 px-6">
        {/* Configuration Warning (dev only) */}
        {!pricesConfigured && (
          <div className="alert alert-warning mb-8 max-w-3xl mx-auto">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="stroke-current shrink-0 h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span>
              Stripe Price IDs are not configured. Add them to your .env file to enable
              purchases.
            </span>
          </div>
        )}

        {/* Page Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Simple, Transparent Pricing
          </h1>
          <p className="text-lg text-base-content/70 max-w-2xl mx-auto">
            Choose the plan that fits your needs. Purchase credits for one-time use
            or subscribe for ongoing access.
          </p>
        </div>

        {/* Credits Section */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-center mb-8">Credit Packs</h2>
          <p className="text-center text-base-content/70 mb-8">
            Buy credits once, use them anytime. Perfect for occasional users.
          </p>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <PricingCard
              name={CREDIT_PACKS.STARTER_CREDITS.name}
              description={CREDIT_PACKS.STARTER_CREDITS.description}
              price={CREDIT_PACKS.STARTER_CREDITS.price}
              features={CREDIT_PACKS.STARTER_CREDITS.features}
              priceId={STRIPE_PRICES.STARTER_CREDITS}
              creditsAmount={CREDIT_PACKS.STARTER_CREDITS.credits}
            />

            <PricingCard
              name={CREDIT_PACKS.PRO_CREDITS.name}
              description={CREDIT_PACKS.PRO_CREDITS.description}
              price={CREDIT_PACKS.PRO_CREDITS.price}
              features={CREDIT_PACKS.PRO_CREDITS.features}
              priceId={STRIPE_PRICES.PRO_CREDITS}
              creditsAmount={CREDIT_PACKS.PRO_CREDITS.credits}
              recommended={CREDIT_PACKS.PRO_CREDITS.recommended}
            />

            <PricingCard
              name={CREDIT_PACKS.ENTERPRISE_CREDITS.name}
              description={CREDIT_PACKS.ENTERPRISE_CREDITS.description}
              price={CREDIT_PACKS.ENTERPRISE_CREDITS.price}
              features={CREDIT_PACKS.ENTERPRISE_CREDITS.features}
              priceId={STRIPE_PRICES.ENTERPRISE_CREDITS}
              creditsAmount={CREDIT_PACKS.ENTERPRISE_CREDITS.credits}
            />
          </div>
        </div>

        {/* Subscriptions Section */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-center mb-8">
            Monthly Subscriptions
          </h2>
          <p className="text-center text-base-content/70 mb-8">
            Get credits every month with our subscription plans. Cancel anytime.
          </p>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <PricingCard
              name={SUBSCRIPTION_PLANS.HOBBY_MONTHLY.name}
              description={SUBSCRIPTION_PLANS.HOBBY_MONTHLY.description}
              price={SUBSCRIPTION_PLANS.HOBBY_MONTHLY.price}
              interval={SUBSCRIPTION_PLANS.HOBBY_MONTHLY.interval}
              features={SUBSCRIPTION_PLANS.HOBBY_MONTHLY.features}
              priceId={STRIPE_PRICES.HOBBY_MONTHLY}
            />

            <PricingCard
              name={SUBSCRIPTION_PLANS.PRO_MONTHLY.name}
              description={SUBSCRIPTION_PLANS.PRO_MONTHLY.description}
              price={SUBSCRIPTION_PLANS.PRO_MONTHLY.price}
              interval={SUBSCRIPTION_PLANS.PRO_MONTHLY.interval}
              features={SUBSCRIPTION_PLANS.PRO_MONTHLY.features}
              priceId={STRIPE_PRICES.PRO_MONTHLY}
              recommended={SUBSCRIPTION_PLANS.PRO_MONTHLY.recommended}
            />

            <PricingCard
              name={SUBSCRIPTION_PLANS.BUSINESS_MONTHLY.name}
              description={SUBSCRIPTION_PLANS.BUSINESS_MONTHLY.description}
              price={SUBSCRIPTION_PLANS.BUSINESS_MONTHLY.price}
              interval={SUBSCRIPTION_PLANS.BUSINESS_MONTHLY.interval}
              features={SUBSCRIPTION_PLANS.BUSINESS_MONTHLY.features}
              priceId={STRIPE_PRICES.BUSINESS_MONTHLY}
            />
          </div>
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto mt-16">
          <h2 className="text-3xl font-bold text-center mb-8">
            Frequently Asked Questions
          </h2>

          <div className="space-y-4">
            <div className="collapse collapse-arrow bg-base-200">
              <input type="radio" name="faq-accordion" defaultChecked />
              <div className="collapse-title text-lg font-medium">
                What are credits used for?
              </div>
              <div className="collapse-content">
                <p className="text-base-content/70">
                  Credits are used for processing actions in the application. Each
                  action (like image processing, data analysis, etc.) consumes a
                  certain number of credits based on complexity.
                </p>
              </div>
            </div>

            <div className="collapse collapse-arrow bg-base-200">
              <input type="radio" name="faq-accordion" />
              <div className="collapse-title text-lg font-medium">
                Do credits expire?
              </div>
              <div className="collapse-content">
                <p className="text-base-content/70">
                  One-time credit packs are valid for 12 months from purchase.
                  Subscription credits roll over month-to-month as long as your
                  subscription is active.
                </p>
              </div>
            </div>

            <div className="collapse collapse-arrow bg-base-200">
              <input type="radio" name="faq-accordion" />
              <div className="collapse-title text-lg font-medium">
                Can I cancel my subscription anytime?
              </div>
              <div className="collapse-content">
                <p className="text-base-content/70">
                  Yes! You can cancel your subscription at any time. You'll
                  continue to have access until the end of your billing period,
                  and any remaining credits will stay in your account.
                </p>
              </div>
            </div>

            <div className="collapse collapse-arrow bg-base-200">
              <input type="radio" name="faq-accordion" />
              <div className="collapse-title text-lg font-medium">
                What payment methods do you accept?
              </div>
              <div className="collapse-content">
                <p className="text-base-content/70">
                  We accept all major credit cards (Visa, Mastercard, American
                  Express) and various other payment methods through Stripe.
                </p>
              </div>
            </div>

            <div className="collapse collapse-arrow bg-base-200">
              <input type="radio" name="faq-accordion" />
              <div className="collapse-title text-lg font-medium">
                Can I upgrade or downgrade my plan?
              </div>
              <div className="collapse-content">
                <p className="text-base-content/70">
                  Yes! You can change your subscription plan at any time. Changes
                  take effect at the start of the next billing cycle, and we'll
                  prorate any differences.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center mt-16">
          <div className="card bg-gradient-to-br from-primary/20 to-secondary/20 backdrop-blur-sm border border-primary/30 max-w-2xl mx-auto">
            <div className="card-body">
              <h3 className="text-2xl font-bold mb-4">
                Need a custom plan?
              </h3>
              <p className="text-base-content/70 mb-6">
                Contact us for enterprise pricing, bulk discounts, or custom
                integration requirements.
              </p>
              <div className="card-actions justify-center">
                <a href="mailto:sales@pixelperfect.com" className="btn btn-primary">
                  Contact Sales
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
