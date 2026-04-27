import * as amplitudeLib from '@amplitude/analytics-browser';
import type { IAnalyticsEventName, IUserIdentity } from '@server/analytics/types';
import type { IAnalyticsProvider } from '../types';

/**
 * Amplitude analytics provider using the Browser SDK.
 * Extracted from the original analyticsClient.ts.
 */
export class AmplitudeProvider implements IAnalyticsProvider {
  readonly name = 'amplitude';
  private initialized = false;

  async init(config: Record<string, unknown>): Promise<void> {
    const apiKey = config.apiKey as string;
    if (!apiKey || this.initialized) return;

    amplitudeLib.init(apiKey, {
      autocapture: {
        elementInteractions: false,
        pageViews: false,
        sessions: true,
        formInteractions: false,
        fileDownloads: false,
      },
      defaultTracking: {
        sessions: true,
        pageViews: false,
      },
    });

    this.initialized = true;
  }

  track(name: IAnalyticsEventName, properties: Record<string, unknown>): void {
    if (!this.initialized) return;
    amplitudeLib.track(name, properties);
  }

  async identify(identity: IUserIdentity & { email?: string }): Promise<void> {
    if (!this.initialized) return;

    amplitudeLib.setUserId(identity.userId);

    const identifyEvent = new amplitudeLib.Identify();

    if (identity.email) {
      identifyEvent.set('email', identity.email);
    }
    if (identity.emailHash) {
      identifyEvent.set('email_hash', identity.emailHash);
    }
    if (identity.createdAt) {
      identifyEvent.setOnce('created_at', identity.createdAt);
    }
    if (identity.subscriptionTier) {
      identifyEvent.set('subscription_tier', identity.subscriptionTier);
    }
    if (identity.pricingRegion) {
      identifyEvent.set('pricing_region', identity.pricingRegion);
    }
    if (identity.imagesUpscaledLifetime !== undefined) {
      identifyEvent.set('images_upscaled_lifetime', identity.imagesUpscaledLifetime);
    }
    if (identity.accountAgeDays !== undefined) {
      identifyEvent.set('account_age_days', identity.accountAgeDays);
    }

    amplitudeLib.identify(identifyEvent);
  }

  trackPageView(_path: string, _properties: Record<string, unknown>): void {
    // Amplitude page views are tracked as regular events via track()
    // The caller (analyticsClient) handles calling track('page_view', ...)
  }

  reset(): void {
    if (!this.initialized) return;
    amplitudeLib.reset();
    this.initialized = false;
  }

  isEnabled(): boolean {
    return this.initialized;
  }

  /** Expose the underlying Amplitude module for device/session ID lookups. */
  getAmplitudeModule(): typeof amplitudeLib | null {
    return this.initialized ? amplitudeLib : null;
  }

  /**
   * Persist first-touch UTM parameters as Amplitude user properties (setOnce).
   * This preserves the original attribution logic from analyticsClient.
   */
  setFirstTouchUtm(utm: {
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmTerm?: string;
    utmContent?: string;
    landingPage?: string;
  }): void {
    if (!this.initialized) return;

    const identifyEvent = new amplitudeLib.Identify();
    if (utm.utmSource) identifyEvent.setOnce('first_touch_utm_source', utm.utmSource);
    if (utm.utmMedium) identifyEvent.setOnce('first_touch_utm_medium', utm.utmMedium);
    if (utm.utmCampaign) identifyEvent.setOnce('first_touch_utm_campaign', utm.utmCampaign);
    if (utm.utmTerm) identifyEvent.setOnce('first_touch_utm_term', utm.utmTerm);
    if (utm.utmContent) identifyEvent.setOnce('first_touch_utm_content', utm.utmContent);
    if (utm.landingPage) identifyEvent.setOnce('first_touch_landing_page', utm.landingPage);

    amplitudeLib.identify(identifyEvent);
  }
}
