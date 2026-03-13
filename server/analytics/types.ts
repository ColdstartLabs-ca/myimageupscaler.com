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

export interface IReturnVisitProperties {
  daysSinceLastVisit: number;
  previousSessionId?: string;
  entryPage: string;
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

export interface IImageDownloadProperties {
  mode: string; // Quality tier used (e.g., 'quick', 'standard', 'premium', etc.)
  filename: string;
  count: number; // 1 for single download, N for batch zip
  fileSize?: number; // Downloaded file size in bytes
  outputWidth?: number; // Output image width (if available)
  outputHeight?: number; // Output image height (if available)
  modelUsed?: string; // Model/variant that generated the image
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

export interface ICheckoutStartedProperties {
  priceId: string;
  purchaseType: 'subscription' | 'credit_pack';
  sessionId?: string;
  plan?: string;
  pack?: string;
  pricingRegion?: string;
  discountPercent?: number;
}

export interface ICheckoutCompletedProperties {
  purchaseType: 'subscription' | 'credit_pack';
  planTier?: string;
  pack?: string;
  amount: number;
  paymentMethod: string;
  sessionId: string;
  currency?: string;
  priceId?: string;
  pricingRegion?: string;
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
// Onboarding Event Properties (PRD: first-time-user-activation)
// =============================================================================

// Onboarding step viewed properties
export interface IOnboardingStepViewedProperties {
  step: 1 | 2 | 3;
  durationToStepMs: number;
  source?: 'sample' | 'upload';
}

// Onboarding completed properties
export interface IOnboardingCompletedProperties {
  totalDurationMs: number;
  source: 'sample' | 'upload';
  uploadCount: number;
}

// Onboarding tour step viewed properties
export interface IOnboardingTourStepViewedProperties {
  step: 1 | 2 | 3;
  trigger: 'auto' | 'manual';
}

// Hero upload CTA clicked properties
export interface IHeroUploadCTAClickedProperties {
  ctaType: 'primary' | 'secondary';
}

// Hero upload zone visible properties
export interface IHeroUploadZoneVisibleProperties {
  viewportHeight: number;
  scrollDepth: number;
}

// Sample image selector viewed properties
export interface ISampleImageSelectorViewedProperties {
  availableSamples: number;
}

// Sample image selected properties
export interface ISampleImageSelectedProperties {
  sampleType: 'photo' | 'illustration' | 'old_photo';
}

// Sample image processed properties
export interface ISampleImageProcessedProperties {
  sampleType: 'photo' | 'illustration' | 'old_photo';
  durationMs: number;
  qualityTier: string;
}

// First upload completed properties
export interface IFirstUploadCompletedProperties {
  source: 'sample' | 'upload';
  durationMs: number;
  fileSize?: number;
  fileType?: string;
}

// Error tracking properties
export interface IErrorOccurredProperties {
  errorType:
    | 'upload_failed'
    | 'upscale_failed'
    | 'download_failed'
    | 'validation_failed'
    | 'timeout'
    | 'rate_limited'
    | 'insufficient_credits'
    | 'unknown';
  errorMessage: string; // Sanitized error message
  context?: Record<string, unknown>; // Additional context like file size, resolution, etc.
}

// Upscale quality selection properties
export interface IUpscaleQualitySelectedProperties {
  qualityLevel: '2x' | '4x' | '8x';
  modelVariant: string; // Quality tier (quick, standard, premium, ultra, auto)
}

// Upscale completion tracking properties
export interface IImageUpscaleStartedProperties {
  inputWidth?: number;
  inputHeight?: number;
  scaleFactor?: number;
  modelUsed?: string;
}

export interface IUpscaleCompletedProperties {
  durationMs: number;
  modelUsed?: string;
  inputResolution?: string;
  outputResolution?: string;
  success: boolean;
  errorType?: string;
}

// Image preview tracking properties
export interface IImagePreviewViewedProperties {
  hasTransparency?: boolean; // Whether result has transparency (e.g., from bg-removal)
  showUpgradeNudge?: boolean; // Whether upgrade nudge was shown
}

// =============================================================================
// Event Types
// =============================================================================

export type IAnalyticsEventName =
  // Page and session events
  | 'page_view'
  | 'return_visit'
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
  | 'image_upscale_started'
  | 'image_upscaled'
  | 'upscale_completed'
  | 'image_download'
  | 'image_preview_viewed'
  // Pricing page events
  | 'pricing_page_viewed'
  // Checkout events
  | 'checkout_started'
  | 'checkout_completed'
  | 'checkout_abandoned'
  | 'purchase_confirmed' // Client-side confirmation when user sees success page
  // Error/limit events (server-side only)
  | 'rate_limit_exceeded'
  | 'processing_failed'
  // Error tracking events (client and server-side)
  | 'error_occurred'
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
  // Upscale quality selection events
  | 'upscale_quality_selected'
  // pSEO-specific events
  | 'pseo_page_view'
  | 'pseo_cta_clicked'
  | 'pseo_scroll_depth'
  | 'pseo_faq_expanded'
  | 'pseo_internal_link_clicked'
  // Onboarding events (PRD: first-time-user-activation)
  | 'onboarding_started'
  | 'onboarding_step_viewed'
  | 'onboarding_completed'
  | 'onboarding_tour_started'
  | 'onboarding_tour_step_viewed'
  | 'onboarding_tour_completed'
  | 'onboarding_tour_skipped'
  // Hero activation events (PRD: first-time-user-activation)
  | 'hero_upload_cta_clicked'
  | 'hero_upload_zone_visible'
  // Sample image events (PRD: first-time-user-activation)
  | 'sample_image_selector_viewed'
  | 'sample_image_selected'
  | 'sample_image_processed'
  | 'first_upload_completed'
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
