// Abandoned checkout types for checkout recovery system
// See PRD: docs/PRDs/checkout-recovery-system.md

export type PurchaseType = 'subscription' | 'credit_pack';

export type AbandonedCheckoutStatus = 'pending' | 'recovered' | 'expired' | 'bounced';

export interface IAbandonedCheckoutEmailsSent {
  email_1hr: boolean;
  email_24hr: boolean;
  email_72hr: boolean;
}

export interface IAbandonedCheckoutCartData {
  priceId: string;
  purchaseType: PurchaseType;
  planKey?: string;
  packKey?: string;
  pricingRegion: string;
  discountPercent: number;
  originalAmountCents: number;
  currency: string;
  createdAt: string;
}

export interface IAbandonedCheckout {
  id: string;
  userId?: string;
  email?: string;
  priceId: string;
  purchaseType: PurchaseType;
  planKey?: string;
  packKey?: string;
  pricingRegion: string;
  discountPercent: number;
  cartData: IAbandonedCheckoutCartData;
  recoveryDiscountCode?: string;
  recoveryDiscountId?: string;
  emailsSent: IAbandonedCheckoutEmailsSent;
  status: AbandonedCheckoutStatus;
  createdAt: string;
  updatedAt: string;
  recoveredAt?: string;
  firstEmailSentAt?: string;
  secondEmailSentAt?: string;
  thirdEmailSentAt?: string;
}

// Database row type (matches Supabase schema exactly)
export interface IAbandonedCheckoutRow {
  id: string;
  user_id: string | null;
  email: string | null;
  price_id: string;
  purchase_type: PurchaseType;
  plan_key: string | null;
  pack_key: string | null;
  pricing_region: string;
  discount_percent: number;
  cart_data: IAbandonedCheckoutCartData;
  recovery_discount_code: string | null;
  recovery_discount_id: string | null;
  emails_sent: IAbandonedCheckoutEmailsSent;
  status: AbandonedCheckoutStatus;
  created_at: string;
  updated_at: string;
  recovered_at: string | null;
  first_email_sent_at: string | null;
  second_email_sent_at: string | null;
  third_email_sent_at: string | null;
}

// Create checkout request (from client)
export interface ICreateAbandonedCheckoutRequest {
  userId?: string;
  email?: string;
  priceId: string;
  purchaseType: PurchaseType;
  planKey?: string;
  packKey?: string;
  pricingRegion?: string;
  discountPercent?: number;
  originalAmountCents?: number;
  currency?: string;
  cartData?: IAbandonedCheckoutCartData;
}

// Result from get_pending_checkout RPC
export interface IPendingCheckoutResult {
  id: string;
  cart_data: IAbandonedCheckoutCartData;
  recovery_discount_code: string | null;
}

// Result from get_checkouts_pending_email RPC
export interface ICheckoutPendingEmail {
  id: string;
  email: string;
  user_id: string | null;
  cart_data: IAbandonedCheckoutCartData;
  recovery_discount_code: string | null;
  created_at: string;
}

// =============================================================================
// Recovery Types (Phase 7)
// =============================================================================

/** Request params for recovery endpoint (path param) */
export interface IRecoveryRequest {
  checkoutId: string;
}

/** Response from GET /api/checkout/recover/[checkoutId] */
export interface IRecoveryResponse {
  success: boolean;
  data?: {
    cartData: IAbandonedCheckoutCartData;
    discountCode?: string;
    isValid: boolean;
  };
  error?: {
    code: 'NOT_FOUND' | 'EXPIRED' | 'ALREADY_RECOVERED' | 'INVALID_STATUS';
    message: string;
  };
}
