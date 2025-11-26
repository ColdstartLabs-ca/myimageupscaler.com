/**
 * Stripe Price IDs Configuration
 *
 * Configure your Stripe Price IDs here. These should match the products
 * you've created in your Stripe Dashboard.
 *
 * To set up:
 * 1. Go to Stripe Dashboard > Products
 * 2. Create your products and prices
 * 3. Copy the Price IDs (starting with price_)
 * 4. Add them to your .env file as NEXT_PUBLIC_STRIPE_PRICE_*
 *
 * Environment Variables (.env):
 * NEXT_PUBLIC_STRIPE_PRICE_STARTER_CREDITS=price_xxx
 * NEXT_PUBLIC_STRIPE_PRICE_PRO_CREDITS=price_xxx
 * NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE_CREDITS=price_xxx
 * NEXT_PUBLIC_STRIPE_PRICE_HOBBY_MONTHLY=price_xxx
 * NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY=price_xxx
 * NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_MONTHLY=price_xxx
 */

/* eslint-disable no-restricted-syntax -- Environment variables must be accessed here */

// Credit Pack Price IDs (one-time payments)
export const STRIPE_PRICES = {
  // Credit Packs (One-time)
  STARTER_CREDITS: process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER_CREDITS || '',
  PRO_CREDITS: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_CREDITS || '',
  ENTERPRISE_CREDITS: process.env.NEXT_PUBLIC_STRIPE_PRICE_ENTERPRISE_CREDITS || '',

  // Subscriptions (Recurring)
  HOBBY_MONTHLY: process.env.NEXT_PUBLIC_STRIPE_PRICE_HOBBY_MONTHLY || '',
  PRO_MONTHLY: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY || '',
  BUSINESS_MONTHLY: process.env.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS_MONTHLY || '',
} as const;

/* eslint-enable no-restricted-syntax */

export type StripePriceKey = keyof typeof STRIPE_PRICES;

/**
 * Credit pack configuration with associated credits
 */
export const CREDIT_PACKS = {
  STARTER_CREDITS: {
    name: 'Starter Pack',
    description: 'Perfect for trying out',
    price: 9.99,
    credits: 100,
    features: [
      '100 processing credits',
      'Valid for 12 months',
      'Email support',
      'Basic features',
    ],
  },
  PRO_CREDITS: {
    name: 'Pro Pack',
    description: 'Best value for regular users',
    price: 29.99,
    credits: 500,
    features: [
      '500 processing credits',
      'Valid for 12 months',
      'Priority email support',
      'All features included',
      '40% more credits',
    ],
    recommended: true,
  },
  ENTERPRISE_CREDITS: {
    name: 'Enterprise Pack',
    description: 'For power users',
    price: 99.99,
    credits: 2000,
    features: [
      '2000 processing credits',
      'Valid for 12 months',
      '24/7 priority support',
      'All features included',
      'Best value per credit',
    ],
  },
} as const;

/**
 * Subscription plan configuration
 */
export const SUBSCRIPTION_PLANS = {
  HOBBY_MONTHLY: {
    name: 'Hobby',
    description: 'For personal projects',
    price: 19,
    interval: 'month' as const,
    creditsPerMonth: 200,
    features: [
      '200 credits per month',
      'Rollover unused credits',
      'Email support',
      'All features included',
    ],
  },
  PRO_MONTHLY: {
    name: 'Professional',
    description: 'For professionals',
    price: 49,
    interval: 'month' as const,
    creditsPerMonth: 1000,
    features: [
      '1000 credits per month',
      'Rollover unused credits',
      'Priority support',
      'All features included',
      'Early access to new features',
    ],
    recommended: true,
  },
  BUSINESS_MONTHLY: {
    name: 'Business',
    description: 'For teams and agencies',
    price: 149,
    interval: 'month' as const,
    creditsPerMonth: 5000,
    features: [
      '5000 credits per month',
      'Rollover unused credits',
      '24/7 priority support',
      'All features included',
      'Dedicated account manager',
      'Custom integrations',
    ],
  },
} as const;

/**
 * Check if Stripe prices are configured
 */
export function isStripePricesConfigured(): boolean {
  return Object.values(STRIPE_PRICES).some((price) => price !== '');
}

/**
 * Get the price ID for a given key, with validation
 */
export function getPriceId(key: StripePriceKey): string {
  const priceId = STRIPE_PRICES[key];
  if (!priceId) {
    console.warn(`Stripe Price ID for ${key} is not configured`);
  }
  return priceId;
}
