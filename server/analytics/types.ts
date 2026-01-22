/**
 * Analytics event taxonomy and type definitions.
 *
 * All custom events follow a consistent naming convention:
 * - snake_case for event names
 * - Properties are camelCase
 */

// =============================================================================
// Event Properties
// =============================================================================

export interface IPageViewProperties {
  path: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
}

export interface ISignupProperties {
  method: 'email' | 'google' | 'facebook' | 'azure';
}

export interface ISubscriptionProperties {
  plan: 'hobby' | 'pro' | 'business';
  amountCents: number;
  billingInterval: 'monthly' | 'yearly';
  currency?: string;
}

export interface ICreditPackProperties {
  pack: 'starter' | 'pro' | 'enterprise';
  amountCents: number;
  credits: number;
  currency?: string;
}

// Generic API operation event properties for boilerplate
export interface IApiCallProperties {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  durationMs: number;
  success: boolean;
  creditsCost?: number;
}

// TODO: Add your own event properties specific to your SaaS product
// Example: export interface IYourOperationProperties { ... }

// =============================================================================
// Event Types
// =============================================================================

export type IAnalyticsEventName =
  // Page and session events
  | 'page_view'
  // Authentication events
  | 'signup_started'
  | 'signup_completed'
  | 'login'
  | 'logout'
  // Subscription events
  | 'subscription_created'
  | 'subscription_canceled'
  | 'subscription_renewed'
  | 'upgrade_started'
  // Credit events
  | 'credit_pack_purchased'
  | 'credits_deducted'
  | 'credits_refunded'
  // Generic API operation events (replace with your specific events)
  | 'api_call_completed'
  | 'content_downloaded'
  // Checkout events
  | 'checkout_started'
  | 'checkout_completed'
  | 'checkout_abandoned'
  // Error/limit events (server-side only)
  | 'rate_limit_exceeded'
  | 'processing_failed'
  // Batch/limit events
  | 'batch_limit_modal_shown'
  | 'batch_limit_upgrade_clicked'
  | 'batch_limit_partial_add_clicked'
  | 'batch_limit_modal_closed';

export interface IAnalyticsEvent {
  name: IAnalyticsEventName;
  properties?: Record<string, unknown>;
  userId?: string;
  sessionId?: string;
  timestamp?: number;
}

// =============================================================================
// User Identity
// =============================================================================

export interface IUserIdentity {
  userId: string;
  email?: string; // Raw email for hashing (will be hashed client-side)
  emailHash?: string; // Pre-computed SHA-256 hash, never raw email
  createdAt?: string;
  subscriptionTier?: string;
}

// =============================================================================
// Consent
// =============================================================================

export type IConsentStatus = 'granted' | 'denied' | 'pending';

export interface IAnalyticsConsent {
  analytics: IConsentStatus;
  marketing: IConsentStatus;
  updatedAt: number;
}
