import type { IAnalyticsEventName, IUserIdentity } from '@server/analytics/types';
import type { IAnalyticsProvider } from '../types';

type TGtag = (...args: unknown[]) => void;

/**
 * GA4 analytics provider using gtag (Google Tag).
 * For client-side event tracking via the browser.
 */
export class GA4Provider implements IAnalyticsProvider {
  readonly name = 'ga4';
  private measurementId: string | null = null;
  private initialized = false;

  async init(config: Record<string, unknown>): Promise<void> {
    const measurementId = config.measurementId as string;
    if (!measurementId || this.initialized) return;

    this.measurementId = measurementId;

    // gtag is loaded via <Script> in layout.tsx and available on window
    if (typeof window === 'undefined') return;

    this.initialized = true;
  }

  track(name: IAnalyticsEventName, properties: Record<string, unknown>): void {
    if (!this.initialized || !this.measurementId) return;

    const gtag = this.getGtag();
    if (!gtag) return;

    // Map internal event names to GA4 recommended events
    const ga4EventName = this.mapEventName(name);

    // Extract value/revenue for purchase events
    const ga4Params: Record<string, unknown> = { ...properties };

    if (
      name === 'purchase_confirmed' ||
      name === 'subscription_created' ||
      name === 'credit_pack_purchased'
    ) {
      if (properties.amountCents) {
        ga4Params.value = (properties.amountCents as number) / 100;
        ga4Params.currency = properties.currency || 'USD';
      }
      if (properties.planTier) {
        ga4Params.item_name = properties.planTier;
      }
      if (properties.pack) {
        ga4Params.item_name = properties.pack;
      }
    }

    gtag('event', ga4EventName, ga4Params);
  }

  async identify(identity: IUserIdentity): Promise<void> {
    if (!this.initialized || !this.measurementId) return;

    const gtag = this.getGtag();
    if (!gtag) return;

    gtag('set', { user_id: identity.userId });
  }

  trackPageView(path: string, properties: Record<string, unknown>): void {
    if (!this.initialized || !this.measurementId) return;

    const gtag = this.getGtag();
    if (!gtag) return;

    gtag('event', 'page_view', {
      page_path: path,
      page_title: properties.pageTitle || document?.title || '',
      ...properties,
    });
  }

  reset(): void {
    if (!this.initialized) return;

    const gtag = this.getGtag();
    if (gtag) {
      gtag('set', { user_id: null });
    }

    this.initialized = false;
  }

  isEnabled(): boolean {
    return this.initialized;
  }

  private getGtag(): TGtag | null {
    if (typeof window === 'undefined') return null;
    return ((window as unknown as Record<string, unknown>).gtag as TGtag) || null;
  }

  private mapEventName(name: IAnalyticsEventName): string {
    const map: Record<string, string> = {
      purchase_confirmed: 'purchase',
      subscription_created: 'purchase',
      credit_pack_purchased: 'purchase',
      checkout_started: 'begin_checkout',
      checkout_completed: 'add_payment_info',
      signup_completed: 'sign_up',
      image_upscaled: 'generate_lead',
      image_uploaded: 'select_content',
      pricing_page_viewed: 'view_item_list',
      page_view: 'page_view',
      upgrade_prompt_clicked: 'select_item',
      upgrade_prompt_shown: 'view_item',
    };

    return map[name] || name;
  }
}
