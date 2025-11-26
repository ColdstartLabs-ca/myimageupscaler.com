// Stripe-related TypeScript types

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid';

export interface IUserProfile {
  id: string;
  stripe_customer_id: string | null;
  credits_balance: number;
  subscription_status: SubscriptionStatus | null;
  subscription_tier: string | null;
  created_at: string;
  updated_at: string;
}

export interface ISubscription {
  id: string; // Stripe subscription ID
  user_id: string;
  status: string;
  price_id: string;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface IProduct {
  id: string; // Stripe product ID
  name: string;
  description: string | null;
  active: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface IPrice {
  id: string; // Stripe price ID
  product_id: string;
  active: boolean;
  currency: string;
  unit_amount: number | null; // Amount in cents
  type: 'one_time' | 'recurring';
  interval: 'day' | 'week' | 'month' | 'year' | null;
  interval_count: number | null;
  trial_period_days: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ICheckoutSessionRequest {
  priceId: string;
  successUrl?: string;
  cancelUrl?: string;
  metadata?: Record<string, string>;
}

export interface ICheckoutSessionResponse {
  url: string;
  sessionId: string;
}

export interface ICreditsPackage {
  priceId: string;
  amount: number; // Number of credits
  price: number; // Price in dollars
  name: string;
  description?: string;
}
