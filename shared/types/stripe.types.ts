// Stripe-related TypeScript types

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid';

export type WebhookEventStatus = 'processing' | 'completed' | 'failed';

export interface IIdempotencyResult {
  isNew: boolean;
  existingStatus?: WebhookEventStatus;
}

export type UserRole = 'user' | 'admin';

export interface IUserProfile {
  id: string;
  stripe_customer_id: string | null;
  // DEPRECATED: Use subscription_credits_balance + purchased_credits_balance instead
  credits_balance?: number;
  // Separate credit pools (see docs/PRDs/separate-credit-pools.md)
  subscription_credits_balance: number; // Credits from subscription (expire at cycle end)
  purchased_credits_balance: number; // Credits from one-time purchases (never expire)
  subscription_status: SubscriptionStatus | null;
  subscription_tier: string | null;
  role: UserRole;
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
  trial_end: string | null; // Trial end date (ISO string)
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
  // Scheduled downgrade fields
  scheduled_price_id?: string | null; // New price ID for scheduled downgrade
  scheduled_change_date?: string | null; // When the downgrade will take effect
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
  uiMode?: 'hosted' | 'embedded';
}

export interface ICheckoutSessionResponse {
  url: string;
  sessionId: string;
  clientSecret?: string; // Required for embedded checkout
}

export interface ICreditsPackage {
  priceId: string;
  amount: number; // Number of credits
  price: number; // Price in dollars
  name: string;
  description?: string;
}

export interface IProrationPreview {
  /** Current plan details */
  current_plan: {
    name: string;
    price_id: string;
    credits_per_month: number;
  } | null;
  /** Target plan details */
  new_plan: {
    name: string;
    price_id: string;
    credits_per_month: number;
  };
  /** Proration calculation */
  proration: {
    /** Amount due immediately (positive = charge, negative = credit) in cents */
    amount_due: number;
    /** Currency code */
    currency: string;
    /** Period start date ISO string */
    period_start: string;
    /** Period end date ISO string */
    period_end: string;
  };
  /** Whether this is an upgrade or downgrade */
  effective_immediately: boolean;
}

export interface ISubscriptionChangeRequest {
  targetPriceId: string;
}

export interface ISubscriptionChangeResponse {
  subscription_id: string;
  status: string;
  new_price_id: string;
  effective_immediately: boolean;
  current_period_start: string;
  current_period_end: string;
}
