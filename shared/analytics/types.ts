import type { IAnalyticsEventName, IUserIdentity } from '@server/analytics/types';

/**
 * Interface for analytics providers (Amplitude, GA4, etc).
 * Each provider wraps a specific analytics SDK/API.
 * The multiplexer fans out events to all enabled providers.
 */
export interface IAnalyticsProvider {
  readonly name: string;
  init(config: Record<string, unknown>): Promise<void>;
  track(name: IAnalyticsEventName, properties: Record<string, unknown>): void;
  identify(identity: IUserIdentity & { email?: string }): Promise<void>;
  trackPageView(path: string, properties: Record<string, unknown>): void;
  reset(): void;
  isEnabled(): boolean;
}

/**
 * Event name mapping from internal names to GA4 recommended events.
 * Events not in this map are sent as custom events with their original name.
 */
export const GA4_EVENT_MAP: Partial<Record<IAnalyticsEventName, string>> = {
  purchase_confirmed: 'purchase',
  subscription_created: 'purchase',
  credit_pack_purchased: 'purchase',
  checkout_started: 'begin_checkout',
  checkout_opened: 'begin_checkout',
  checkout_session_requested: 'begin_checkout',
  checkout_session_created: 'begin_checkout',
  checkout_completed: 'add_payment_info',
  signup_started: 'generate_lead',
  signup_completed: 'sign_up',
  image_upscaled: 'generate_lead',
  image_uploaded: 'select_content',
  image_upscale_started: 'select_content',
  upscale_completed: 'generate_lead',
  hero_upload_cta_clicked: 'select_content',
  pricing_page_viewed: 'view_item_list',
  page_view: 'page_view',
  upgrade_prompt_clicked: 'select_item',
  upgrade_prompt_shown: 'view_item',
};

/**
 * GA4 Measurement Protocol event mapping for server-side tracking.
 * Same mapping as client-side but used in server context.
 */
export const GA4_CONVERSION_EVENTS: readonly IAnalyticsEventName[] = [
  'purchase_confirmed',
  'subscription_created',
  'credit_pack_purchased',
  'image_uploaded',
  'image_upscale_started',
  'upscale_completed',
  'signup_started',
  'checkout_completed',
  'checkout_opened',
  'checkout_session_requested',
  'checkout_session_created',
  'checkout_started',
  'signup_completed',
];
