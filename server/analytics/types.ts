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
  upscaleFactor?: number; // Scale factor applied (2x, 4x, 8x)
  inputResolution?: string; // Original resolution before upscaling (e.g., '800x600')
}

export interface IPricingPageViewedProperties {
  entryPoint: 'navbar' | 'batch_limit_modal' | 'out_of_credits_modal' | 'pseo_cta' | 'direct';
  currentPlan: 'free' | 'starter' | 'hobby' | 'pro' | 'business';
  referrer?: string;
  pricingRegion: string;
  discountPercent?: number;
}

export interface ICheckoutAbandonedProperties {
  priceId: string;
  step: 'plan_selection' | 'stripe_embed';
  timeSpentMs: number;
  plan: 'free' | 'starter' | 'hobby' | 'pro' | 'business';
  pricingRegion: string;
}

export type IUpgradePromptTrigger =
  | 'premium_upsell'
  | 'out_of_credits'
  | 'model_gate'
  | 'after_upscale'
  | 'after_comparison'
  | 'after_download'
  | 'after_batch'
  | 'upgrade_card';

export interface IUpgradePromptShownProperties {
  trigger: IUpgradePromptTrigger;
  imageVariant?: string;
  currentPlan: 'free' | 'starter' | 'hobby' | 'pro' | 'business';
  pricingRegion: string;
  copyVariant?: string; // A/B test variant assignment (e.g., 'control', 'variant_a')
}

export interface IUpgradePromptClickedProperties {
  trigger: IUpgradePromptTrigger;
  imageVariant?: string;
  destination: string;
  currentPlan: 'free' | 'starter' | 'hobby' | 'pro' | 'business';
  pricingRegion: string;
  copyVariant?: string; // A/B test variant assignment (e.g., 'control', 'variant_a')
}

export interface IUpgradePromptDismissedProperties {
  trigger: IUpgradePromptTrigger;
  imageVariant?: string;
  currentPlan: 'free' | 'starter' | 'hobby' | 'pro' | 'business';
  pricingRegion: string;
  copyVariant?: string; // A/B test variant assignment (e.g., 'control', 'variant_a')
}

export interface ICheckoutOpenedProperties {
  priceId: string;
  source: string;
  originatingModel?: string;
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
  pricingRegion: string;
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
  pricingRegion: string;
}

export interface IPurchaseConfirmedProperties {
  purchaseType: 'subscription' | 'credit_pack';
  sessionId: string;
  pricingRegion: string;
  discountPercent?: number;
  planTier?: string;
  pack?: string;
  amount?: number;
  currency?: string;
}

export interface ISuccessPageViewedProperties {
  purchaseType: 'subscription' | 'credit_pack';
  sessionId: string | null;
  originatingModel?: string;
  entryPage?: string;
}

// =============================================================================
// Revenue Leak Detection Events (PRD: analytics-tracking-enhancement - Phase 1)
// =============================================================================

export interface IPaymentFailedProperties {
  priceId?: string;
  plan?: string;
  errorType: 'card_declined' | 'insufficient_funds' | 'expired_card' | 'generic';
  errorMessage: string; // Sanitized error message
  attemptCount: number;
  customerId: string;
}

export interface IPlanSelectedProperties {
  planName: 'starter' | 'hobby' | 'pro' | 'business';
  priceId: string;
  price: number;
  billingInterval: 'monthly' | 'yearly';
  pricingRegion?: string;
  discountPercent?: number;
  source: 'pricing_page' | 'upgrade_modal' | 'batch_limit';
}

// =============================================================================
// User Lifecycle Events (PRD: analytics-tracking-enhancement - Phase 2)
// =============================================================================

export interface IAccountCreatedProperties {
  method: 'email' | 'google' | 'facebook' | 'azure';
  hasEmail: boolean;
  fingerprintHash?: string;
  pricingRegion?: string;
}

export interface IEmailCapturedProperties {
  source: 'newsletter' | 'support_form' | 'waitlist' | 'upgrade_prompt';
  hasAccount: boolean;
}

// =============================================================================
// Feature Depth Events (PRD: analytics-tracking-enhancement - Phase 3)
// =============================================================================

export interface IComparisonViewedProperties {
  upscaleFactor: number;
  modelUsed: string;
  interactionType: 'slider_move' | 'toggle' | 'zoom';
  timeViewedMs: number;
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
    | 'upload_file_too_large'
    | 'upload_invalid_format'
    | 'upscale_failed'
    | 'upscale_timeout'
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

// =============================================================================
// Checkout Funnel Events (Phase 1 - Checkout Friction Investigation)
// =============================================================================

export type TCheckoutStep = 'plan_selection' | 'stripe_embed' | 'payment_details' | 'confirmation';

export type TCheckoutErrorType =
  | 'card_declined'
  | '3ds_failed'
  | 'network_error'
  | 'invalid_card'
  | 'session_expired'
  | 'other';

export type TCheckoutExitMethod = 'close_button' | 'escape_key' | 'click_outside' | 'navigate_away';

export type TDeviceType = 'mobile' | 'desktop' | 'tablet';

export type TCheckoutSurveyReason =
  | 'price_too_high'
  | 'payment_method_not_accepted'
  | 'not_sure_needed'
  | 'technical_issue'
  | 'just_browsing'
  | 'other';

export interface ICheckoutStepViewedProperties {
  step: TCheckoutStep;
  loadTimeMs?: number;
  priceId: string;
  purchaseType: 'subscription' | 'credit_pack';
  deviceType: TDeviceType;
}

export interface ICheckoutStepTimeProperties {
  step: TCheckoutStep;
  timeSpentMs: number;
  priceId: string;
  cumulativeTimeMs?: number;
}

export interface ICheckoutErrorProperties {
  errorType: TCheckoutErrorType;
  /** Sanitized error message - no sensitive card data */
  errorMessage: string;
  step: TCheckoutStep;
  priceId: string;
}

export interface ICheckoutExitIntentProperties {
  step: TCheckoutStep;
  timeSpentMs: number;
  priceId: string;
  method: TCheckoutExitMethod;
}

export interface ICheckoutExitSurveyResponseProperties {
  reason: TCheckoutSurveyReason;
  otherReason?: string;
  priceId: string;
  timeSpentMs: number;
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
// Checkout Recovery Event Properties
// =============================================================================

export interface IPreCheckoutEmailShownProperties {
  source: 'pricing_page' | 'upgrade_prompt' | 'out_of_credits' | 'premium_upsell';
  hasPlanId: boolean;
}

export interface IPreCheckoutEmailCapturedProperties {
  source: string;
  consent: boolean;
}

export interface IPreCheckoutEmailDismissedProperties {
  source: string;
}

export interface IRecoveryBannerShownProperties {
  planKey?: string;
  packKey?: string;
  hasDiscountCode: boolean;
}

export interface IRecoveryBannerClickedProperties {
  planKey?: string;
  packKey?: string;
  hasDiscountCode: boolean;
}

export interface IRecoveryBannerDismissedProperties {
  planKey?: string;
  packKey?: string;
  hasDiscountCode: boolean;
}

export interface IRecoveryEmailSentProperties {
  emailNumber: 1 | 2 | 3;
  checkoutId: string;
  hasDiscount: boolean;
}

export interface IRecoveryEmailOpenedProperties {
  emailNumber: 1 | 2 | 3;
  checkoutId: string;
}

export interface IRecoveryEmailClickedProperties {
  emailNumber: 1 | 2 | 3;
  checkoutId: string;
  hasDiscount: boolean;
}

export interface IRecoveryLinkClickedProperties {
  checkoutId: string;
  hasDiscount: boolean;
}

export interface ICheckoutRecoveredProperties {
  checkoutId: string;
  hasDiscount: boolean;
  isValid: boolean;
}

export interface IRecoveryCronExecutedProperties {
  dryRun: boolean;
  email1hrTotal: number;
  email24hrTotal: number;
  email72hrTotal: number;
  totalSent: number;
  totalFailed: number;
}

export interface IRecoveryCronErrorProperties {
  error: string;
  dryRun: boolean;
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
  | 'purchase_confirmed' // Server-side confirmation fired from Stripe webhook
  | 'success_page_viewed' // Client-side: user actually reached the success page
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
  | 'upgrade_prompt_tab_toggled'
  | 'upgrade_plans_viewed'
  // Checkout flow events
  | 'checkout_loaded'
  | 'pricing_plan_viewed'
  // Batch limit events
  | 'batch_limit_modal_shown'
  | 'batch_limit_upgrade_clicked'
  | 'batch_limit_quick_buy_clicked'
  | 'batch_limit_see_plans_clicked'
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
  | 'sample_help_button_clicked'
  | 'first_upload_completed'
  // Regional pricing monitoring events (server-side only)
  | 'pricing_region_mismatch'
  // Checkout funnel events (Phase 1 - Checkout Friction Investigation)
  | 'checkout_opened' // Fires when CheckoutModal renders (bridges upgrade_prompt_clicked → checkout_step_viewed gap)
  | 'checkout_auth_required' // Fires when unauthenticated user tries to checkout (bridges upgrade_prompt_clicked → checkout_opened gap)
  | 'checkout_step_viewed'
  | 'checkout_step_time'
  | 'checkout_error'
  | 'checkout_exit_intent'
  | 'checkout_exit_survey_response'
  // Engagement-based first-purchase discount events (PRD: engagement-based-first-purchase-discount)
  | 'engagement_discount_eligible'
  | 'engagement_discount_toast_shown'
  | 'engagement_discount_toast_dismissed'
  | 'engagement_discount_cta_clicked'
  | 'engagement_discount_checkout_started'
  | 'engagement_discount_redeemed'
  // Revenue leak detection events (PRD: analytics-tracking-enhancement - Phase 1)
  | 'payment_failed'
  | 'plan_selected'
  // User lifecycle events (PRD: analytics-tracking-enhancement - Phase 2)
  | 'account_created'
  | 'email_captured'
  // Feature depth events (PRD: analytics-tracking-enhancement - Phase 3)
  | 'comparison_viewed'
  // Checkout recovery events
  | 'pre_checkout_email_shown'
  | 'pre_checkout_email_captured'
  | 'pre_checkout_email_dismissed'
  | 'recovery_banner_shown'
  | 'recovery_banner_clicked'
  | 'recovery_banner_dismissed'
  | 'recovery_email_sent'
  | 'recovery_email_opened'
  | 'recovery_email_clicked'
  | 'recovery_link_clicked'
  | 'checkout_recovered'
  | 'recovery_cron_executed'
  | 'recovery_cron_error'
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
  pricingRegion?: string; // User's pricing region for regional funnel analysis
  imagesUpscaledLifetime?: number; // Total images upscaled for power user identification
  accountAgeDays?: number; // Account tenure for segmentation
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

// =============================================================================
// Referral Source Attribution
// =============================================================================

/**
 * Referral source type for AI search attribution.
 * Tracks where users originated from: AI search engines, traditional search,
 * direct traffic, or other sources.
 */
export type IReferralSource =
  | 'chatgpt'
  | 'perplexity'
  | 'claude'
  | 'google_sge'
  | 'google'
  | 'direct'
  | 'other';
