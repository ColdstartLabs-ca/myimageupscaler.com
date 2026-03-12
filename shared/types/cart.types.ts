// Cart types for checkout recovery system
// See PRD: docs/PRDs/checkout-recovery-system.md

/**
 * Data stored in localStorage to persist checkout state across sessions.
 * Used to show restoration banner when users return to the pricing page.
 */
export interface ICheckoutLocalStorage {
  /** User email if captured before abandonment */
  email?: string;
  /** Stripe Price ID for the selected plan/pack */
  priceId: string;
  /** Type of purchase */
  purchaseType: 'subscription' | 'credit_pack';
  /** Plan key for subscriptions (e.g., 'pro', 'business') */
  planKey?: string;
  /** Pack key for credit packs (e.g., 'starter', 'pro') */
  packKey?: string;
  /** Pricing region for regional discounts */
  pricingRegion: string;
  /** Discount percentage applied (0-100) */
  discountPercent: number;
  /** Recovery discount code if returning from email */
  recoveryCode?: string;
  /** Timestamp when checkout was saved (for expiration) */
  timestamp: number;
}

/** LocalStorage key for pending checkout data */
export const PENDING_CHECKOUT_KEY = 'miu_pending_checkout';

/** Session storage key to track if banner was shown this session */
export const RESTORE_BANNER_SHOWN_KEY = 'miu_restore_banner_shown';

/** Expiration time for pending checkout in milliseconds (7 days) */
export const CHECKOUT_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000;
