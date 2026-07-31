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

export interface ICreditWallShownProperties {
  source: 'preflight_batch' | 'preflight_action_panel' | 'midbatch' | 'server_402';
  requiredCredits: number;
  currentBalance: number;
  deficit: number;
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

export interface IPricingPageAbandonedProperties {
  step: 'plan_selection';
  timeSpentMs: number;
  plan: 'free' | 'starter' | 'hobby' | 'pro' | 'business';
  pricingRegion: string;
  discountPercent?: number;
  source: 'pricing_page';
  checkoutOpened: false;
}

export interface ICheckoutAbandonedProperties {
  priceId: string;
  step: 'plan_selection' | 'stripe_embed';
  timeSpentMs: number;
  plan: 'free' | 'starter' | 'hobby' | 'pro' | 'business';
  pricingRegion: string;
  source?: 'purchase_modal' | 'checkout_modal';
  method?: TCheckoutExitMethod | 'backdrop' | 'not_now' | 'rescue_offer_dismissed';
  activeTab?: 'credits' | 'subscribe';
  selectedType?: 'subscription' | 'credit_pack';
  selectedKey?: string;
  checkoutOpened?: boolean;
  outOfCredits?: boolean;
}

export interface IPurchaseModalAbandonedProperties extends ICheckoutAbandonedProperties {
  source: 'purchase_modal';
  checkoutOpened: false;
}

export interface IPurchaseModalOpenedProperties {
  trigger: string;
  outOfCredits?: boolean;
  currentPlan: 'free' | 'starter' | 'hobby' | 'pro' | 'business';
  pricingRegion: string;
  initialTab?: 'credits' | 'subscribe';
  selectedType?: 'subscription' | 'credit_pack';
  selectedKey?: string;
  priceId?: string;
  lockToCredits?: boolean;
}

export type IUpgradePromptTrigger =
  | 'premium_upsell'
  | 'out_of_credits'
  | 'insufficient_credits'
  | 'model_gate'
  | 'after_upscale'
  | 'after_download'
  | 'post_download_explore'
  | 'celebration_explore'
  | 'after_batch'
  | 'dashboard_sidebar'
  | 'workspace_batch_sidebar'
  | 'mobile_tab_credits'
  | 'upgrade_card';

export interface IUpgradePromptShownProperties {
  trigger: IUpgradePromptTrigger;
  imageVariant?: string;
  currentPlan: 'free' | 'starter' | 'hobby' | 'pro' | 'business';
  pricingRegion: string;
  copyVariant?: string; // A/B test variant assignment (e.g., 'control', 'variant_a')
  outOfCredits?: boolean;
  initialTab?: 'credits' | 'subscribe';
  lockToCredits?: boolean;
}

export interface IUpgradePromptClickedProperties {
  trigger: IUpgradePromptTrigger;
  imageVariant?: string;
  destination: string;
  currentPlan: 'free' | 'starter' | 'hobby' | 'pro' | 'business';
  pricingRegion: string;
  copyVariant?: string; // A/B test variant assignment (e.g., 'control', 'variant_a')
  originatingTrigger?: IUpgradePromptTrigger;
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
  trigger?: string;
  pricingRegion?: string;
  originatingModel?: string;
  originatingTrigger?: IUpgradePromptTrigger;
  attributionChain?: IUpgradePromptTrigger[];
}

export interface ICheckoutDirectStartedProperties extends ICheckoutOpenedProperties {
  source: 'model_gate';
  pricingRegion: string;
  uiMode: 'hosted' | 'embedded';
  isAuthenticated: boolean;
}

export interface ICheckoutModalMountedProperties extends ICheckoutOpenedProperties {
  pricingRegion: string;
  uiMode: 'hosted' | 'embedded';
  isAuthenticated: boolean;
}

export interface ICheckoutDirectUnavailableProperties {
  trigger: 'model_gate';
  imageVariant: string;
  currentPlan: 'free';
  pricingRegion: string;
  fallbackDestination: 'upgrade_plan_modal';
  originatingTrigger?: IUpgradePromptTrigger;
}

export interface ICheckoutSessionRequestedProperties {
  priceId: string;
  uiMode: 'hosted' | 'embedded';
  hasBanditArm: boolean;
  hasOfferToken: boolean;
  isAuthenticated: boolean;
  trigger?: string;
  originatingModel?: string;
  originatingTrigger?: IUpgradePromptTrigger;
  attributionChain?: IUpgradePromptTrigger[];
}

export interface ICheckoutSessionCreatedProperties {
  priceId: string;
  uiMode: 'hosted' | 'embedded';
  loadTimeMs: number;
  isAuthenticated: boolean;
  hasUrl?: boolean;
  hasClientSecret?: boolean;
  checkoutOfferApplied?: boolean;
  engagementDiscountApplied?: boolean;
  trigger?: string;
  originatingModel?: string;
  originatingTrigger?: IUpgradePromptTrigger;
  attributionChain?: IUpgradePromptTrigger[];
}

export interface ICheckoutAuthRequiredProperties {
  priceId: string;
  trigger?: string;
  source?: string;
  pricingRegion?: string;
  originatingModel?: string;
  originatingTrigger?: IUpgradePromptTrigger;
  attributionChain?: IUpgradePromptTrigger[];
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
  priceId?: string;
  uiMode?: 'hosted' | 'embedded' | null;
  trigger?: string | null;
  originatingModel?: string | null;
  originatingTrigger?: IUpgradePromptTrigger | string | null;
  attributionChain?: string[];
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

export interface IAccountDeleteModalOpenedProperties {
  source: 'self_serve' | 'admin';
}

export interface IAccountDeleteConfirmedProperties {
  method: 'self_serve' | 'admin';
}

export interface IAccountDeleteCompletedProperties {
  method: 'self_serve' | 'admin';
  hadStripeCustomer: boolean;
  hadSubscription: boolean;
  hadCreditsRemaining: boolean;
  accountAgeDays?: number;
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
  failurePoint?: string;
  uiMode?: 'hosted' | 'embedded';
  isAuthenticated?: boolean;
  trigger?: string;
  originatingModel?: string;
  originatingTrigger?: IUpgradePromptTrigger;
  attributionChain?: IUpgradePromptTrigger[];
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

// Paywall tracking properties
export interface IPaywallShownProperties {
  country: string;
  context: 'guest_api' | 'authenticated_workspace';
}

// Engagement discount toast shown properties
export interface IEngagementDiscountToastShownProperties {
  discountPercent?: number;
  originalPriceCents?: number;
  discountedPriceCents?: number;
  /** Source that triggered the discount toast. Defaults to 'engagement'. */
  engagement_discount_source?: 'engagement' | 'abandonment';
}

// PRD #90: Paywall hit tracking for zero-conversion countries
export interface IPaywallHitProperties {
  country: string | null;
  tier: 'paywalled';
  source: 'checkout_page' | 'pricing_page';
  priceId?: string;
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
  // Account deletion events
  | 'account_delete_modal_opened'
  | 'account_delete_confirmed'
  | 'account_delete_completed'
  // Subscription events
  | 'subscription_created'
  | 'subscription_updated'
  | 'subscription_canceled'
  | 'subscription_renewed'
  | 'subscription_retention_holdout_assigned'
  | 'subscription_retention_offer_shown'
  | 'subscription_retention_offer_accepted'
  | 'subscription_retention_cancellation_completed'
  | 'subscription_retention_later_cancellation'
  | 'subscription_retention_refund'
  | 'subscription_retention_chargeback'
  | 'upgrade_started'
  // Revenue events (server-side only)
  | 'revenue_received'
  // Credit events
  | 'credit_pack_purchased'
  | 'repeat_purchase_prompt_shown'
  | 'repeat_purchase_prompt_clicked'
  | 'auto_top_up_opted_in'
  | 'auto_top_up_succeeded'
  | 'auto_top_up_declined'
  | 'auto_top_up_disabled'
  | 'auto_top_up_refunded'
  | 'repeat_purchase_refunded'
  | 'revenue_support_contact'
  | 'credits_deducted'
  | 'credits_refunded'
  | 'credit_wall_shown'
  // Image processing events
  | 'image_uploaded'
  | 'image_upscale_started'
  | 'image_upscaled'
  | 'upscale_completed'
  | 'image_download'
  | 'image_preview_viewed'
  // Pricing page events
  | 'pricing_page_viewed'
  | 'pricing_page_abandoned'
  // Checkout events
  | 'checkout_started'
  | 'checkout_completed'
  | 'checkout_abandoned'
  | 'purchase_modal_abandoned'
  | 'checkout_async_payment_failed' // PIX / async payment method failed after checkout
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
  | 'free_credits_reduced'
  | 'free_limit_gate_shown'
  | 'free_limit_gate_upgrade_clicked'
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
  | 'first_time_model_picker_dismissed'
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
  | 'section_signup_cta_clicked'
  // Sample image events (PRD: first-time-user-activation)
  | 'sample_image_selector_viewed'
  | 'sample_image_selected'
  | 'sample_image_processed'
  | 'sample_help_button_clicked'
  | 'first_upload_completed'
  // Regional pricing monitoring events (server-side only)
  | 'pricing_region_mismatch'
  // Shared experiment platform events
  | 'experiment_arm_assigned'
  | 'experiment_reward_recorded'
  // Checkout funnel events (Phase 1 - Checkout Friction Investigation)
  | 'purchase_modal_opened'
  | 'purchase_cta_clicked'
  | 'checkout_direct_started'
  | 'checkout_direct_unavailable'
  | 'checkout_modal_mounted'
  | 'checkout_opened' // Fires when CheckoutModal renders (bridges upgrade_prompt_clicked → checkout_step_viewed gap)
  | 'checkout_auth_required' // Fires when unauthenticated user tries to checkout (bridges upgrade_prompt_clicked → checkout_opened gap)
  | 'checkout_session_requested'
  | 'checkout_session_created'
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
  // Country paywall events
  | 'paywall_shown'
  | 'paywall_hit' // PRD #90: Track when paywalled users visit checkout/pricing pages
  // Revenue leak detection events (PRD: analytics-tracking-enhancement - Phase 1)
  | 'payment_failed'
  | 'plan_selected'
  // User lifecycle events (PRD: analytics-tracking-enhancement - Phase 2)
  | 'account_created'
  | 'email_captured'
  | 'email_lifecycle_queued'
  | 'email_lifecycle_sent'
  | 'email_lifecycle_skipped'
  | 'email_lifecycle_clicked'
  | 'email_lifecycle_returned'
  | 'email_lifecycle_purchase_attributed'
  | 'email_lifecycle_unsubscribed'
  // Feature depth events (PRD: analytics-tracking-enhancement - Phase 3)
  | 'comparison_viewed'
  // Gallery events
  | 'gallery_image_saved'
  | 'gallery_limit_reached'
  | 'gallery_image_deleted'
  | 'gallery_page_viewed'
  | 'gallery_upgrade_clicked'
  | 'gallery_save_initiated'
  | 'gallery_image_viewed'
  | 'gallery_image_downloaded'
  // Amplitude identity events (server-side only)
  | '$identify';

/** Versioned dimensions used to join acquisition, checkout, and purchase events. */
export const FUNNEL_SCHEMA_VERSION = '1' as const;

export interface IFunnelAttributionProperties {
  funnelSchemaVersion: typeof FUNNEL_SCHEMA_VERSION;
  firstTouchSource?: string;
  firstTouchMedium?: string;
  firstTouchLandingPage?: string;
  landingPageFamily?: string;
  deviceType?: 'mobile' | 'tablet' | 'desktop';
  isPseoLanding?: boolean;
}

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
