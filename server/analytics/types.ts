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

export interface IImageUpscaledProperties {
  inputWidth: number;
  inputHeight: number;
  outputWidth: number;
  outputHeight: number;
  scaleFactor: number;
  modelVersion?: string;
  durationMs: number;
}

export interface IImageUploadedProperties {
  fileSize: number;
  fileType: string;
  inputWidth?: number;
  inputHeight?: number;
  source: 'drag_drop' | 'file_picker' | 'paste' | 'url';
  isGuest: boolean;
  batchPosition: number;
}

export interface IPricingPageViewedProperties {
  entryPoint: 'navbar' | 'batch_limit_modal' | 'out_of_credits_modal' | 'pseo_cta' | 'direct';
  currentPlan: 'free' | 'starter' | 'hobby' | 'pro' | 'business';
  referrer?: string;
  pricingRegion?: string;
  discountPercent?: number;
}

export interface ICheckoutAbandonedProperties {
  priceId: string;
  step: 'plan_selection' | 'stripe_embed';
  timeSpentMs: number;
  plan: 'free' | 'starter' | 'hobby' | 'pro' | 'business';
  pricingRegion?: string;
}

export interface ICheckoutStartedProperties {
  priceId: string;
  purchaseType: string;
  sessionId: string;
  plan?: string;
  pack?: string;
  pricingRegion?: string;
  discountPercent?: number;
}

export interface ICheckoutCompletedProperties {
  priceId: string;
  purchaseType: string;
  sessionId: string;
  pricingRegion?: string;
}

export type IUpgradePromptTrigger =
  | 'premium_upsell'
  | 'out_of_credits'
  | 'model_gate'
  | 'after_upscale'
  | 'after_comparison'
  | 'after_download'
  | 'after_batch';

export interface IUpgradePromptShownProperties {
  trigger: IUpgradePromptTrigger;
  imageVariant?: string;
  currentPlan: 'free' | 'starter' | 'hobby' | 'pro' | 'business';
}

export interface IUpgradePromptClickedProperties {
  trigger: IUpgradePromptTrigger;
  imageVariant?: string;
  destination: string;
  currentPlan: 'free' | 'starter' | 'hobby' | 'pro' | 'business';
}

export interface IUpgradePromptDismissedProperties {
  trigger: IUpgradePromptTrigger;
  imageVariant?: string;
  currentPlan: 'free' | 'starter' | 'hobby' | 'pro' | 'business';
}

export interface ICheckoutLoadedProperties {
  loadTimeMs: number;
  priceId: string;
}

export interface IPricingPlanViewedProperties {
  planName: string;
  priceId: string;
}

// pSEO-specific event properties
export interface IPSEOPageViewProperties extends IPageViewProperties {
  pageType:
    | 'tool'
    | 'comparison'
    | 'guide'
    | 'useCase'
    | 'use-case'
    | 'alternative'
    | 'format'
    | 'scale'
    | 'free'
    | 'platform'
    | 'format-scale'
    | 'platform-format'
    | 'device-use';
  slug: string;
  primaryKeyword?: string;
  tier?: number;
}

export interface IPSEOInteractionProperties {
  pageType:
    | 'tool'
    | 'comparison'
    | 'guide'
    | 'useCase'
    | 'use-case'
    | 'alternative'
    | 'format'
    | 'scale'
    | 'free'
    | 'platform'
    | 'format-scale'
    | 'platform-format'
    | 'device-use';
  slug: string;
  elementType: 'cta' | 'faq' | 'feature' | 'benefit' | 'usecase' | 'internal_link';
  elementId?: string;
}

export interface IPSEOScrollProperties {
  pageType:
    | 'tool'
    | 'comparison'
    | 'guide'
    | 'useCase'
    | 'use-case'
    | 'alternative'
    | 'format'
    | 'scale'
    | 'free'
    | 'platform'
    | 'format-scale'
    | 'platform-format'
    | 'device-use';
  slug: string;
  depth: 25 | 50 | 75 | 100;
  timeToDepthMs: number;
}

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
  | 'subscription_updated'
  | 'subscription_canceled'
  | 'subscription_renewed'
  | 'upgrade_started'
  // Revenue events (server-side only)
  | 'revenue_received'
  // Credit events
  | 'credit_pack_purchased'
  | 'credits_deducted'
  | 'credits_refunded'
  // Image processing events
  | 'image_uploaded'
  | 'image_upscaled'
  | 'image_download'
  // Pricing page events
  | 'pricing_page_viewed'
  // Checkout events
  | 'checkout_started'
  | 'checkout_completed'
  | 'checkout_abandoned'
  // Error/limit events (server-side only)
  | 'rate_limit_exceeded'
  | 'processing_failed'
  // Guest upscaler events (server-side only)
  | 'guest_limit_reached'
  | 'guest_upscale_completed'
  // Upgrade prompt events
  | 'upgrade_prompt_shown'
  | 'upgrade_prompt_clicked'
  | 'upgrade_prompt_dismissed'
  // Checkout flow events
  | 'checkout_loaded'
  | 'pricing_plan_viewed'
  // Batch limit events
  | 'batch_limit_modal_shown'
  | 'batch_limit_upgrade_clicked'
  | 'batch_limit_partial_add_clicked'
  | 'batch_limit_modal_closed'
  // Model selection events
  | 'model_gallery_opened'
  | 'model_selection_changed'
  | 'model_gallery_closed'
  // pSEO-specific events
  | 'pseo_page_view'
  | 'pseo_cta_clicked'
  | 'pseo_scroll_depth'
  | 'pseo_faq_expanded'
  | 'pseo_internal_link_clicked'
  // Regional pricing monitoring events (server-side only)
  | 'pricing_region_mismatch'
  // Amplitude identity events (server-side only)
  | '$identify';

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
