/**
 * Client-side Analytics Service
 *
 * Browser-only analytics using Amplitude Browser SDK.
 * This module should ONLY be imported in client components.
 *
 * @example
 * ```ts
 * 'use client';
 * import { analytics } from '@client/analytics/analyticsClient';
 *
 * // Track an event
 * analytics.track('image_upscaled', {
 *   inputWidth: 512,
 *   outputWidth: 2048,
 *   durationMs: 3500
 * });
 *
 * // Identify a user (email will be securely hashed client-side)
 * await analytics.identify({
 *   userId: 'user_123',
 *   email: 'user@example.com'
 * });
 * ```
 */

import type {
  IAnalyticsEvent,
  IUserIdentity,
  IConsentStatus,
  IReferralSource,
} from '@server/analytics/types';
import { isDevelopment, isTest } from '@shared/config/env';

// Dynamically import Amplitude to code-split this heavy library (~40KB)
let amplitudeModule: typeof import('@amplitude/analytics-browser') | null = null;

// =============================================================================
// Constants
// =============================================================================

const CONSENT_STORAGE_KEY = 'pp_analytics_consent';
const SESSION_ID_KEY = 'pp_session_id';
const FIRST_TOUCH_UTM_STORAGE_KEY = 'miu_first_touch_utm';
const FIRST_TOUCH_UTM_COOKIE_KEY = 'miu_first_touch_utm';
const LAST_VISIT_KEY = 'miu_last_visit';
const REFERRAL_SOURCE_COOKIE_KEY = 'miu_referral_source';
const ENTRY_PAGE_KEY = 'miu_entry_page';

interface IFirstTouchUtm {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  landingPage?: string;
  timestamp?: number;
}

// =============================================================================
// State
// =============================================================================

let isInitialized = false;
let consentStatus: IConsentStatus = 'pending';

// =============================================================================
// Helpers
// =============================================================================

function getSessionId(): string {
  if (typeof window === 'undefined') return '';

  let sessionId = sessionStorage.getItem(SESSION_ID_KEY);
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    sessionStorage.setItem(SESSION_ID_KEY, sessionId);
  }
  return sessionId;
}

function getStoredConsent(): IConsentStatus {
  if (typeof window === 'undefined') return 'pending';

  try {
    const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.analytics || 'pending';
    }
  } catch {
    // Ignore parse errors
  }
  return 'pending';
}

function getStoredFirstTouchUtm(): IFirstTouchUtm | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(FIRST_TOUCH_UTM_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as IFirstTouchUtm;
    if (typeof parsed !== 'object' || !parsed) return null;
    return parsed;
  } catch {
    return null;
  }
}

function getLastVisit(): { timestamp: number; sessionId: string } | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(LAST_VISIT_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as { timestamp: number; sessionId: string };
    if (typeof parsed !== 'object' || !parsed) return null;
    return parsed;
  } catch {
    return null;
  }
}

function setLastVisit(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(
      LAST_VISIT_KEY,
      JSON.stringify({
        timestamp: Date.now(),
        sessionId: getSessionId(),
      })
    );
  } catch {
    // Ignore storage errors
  }
}

function getFirstTouchUtmFromCookie(): IFirstTouchUtm | null {
  if (typeof window === 'undefined') return null;

  try {
    const cookiePrefix = `${FIRST_TOUCH_UTM_COOKIE_KEY}=`;
    const rawCookie = document.cookie
      .split(';')
      .map(cookie => cookie.trim())
      .find(cookie => cookie.startsWith(cookiePrefix));

    if (!rawCookie) return null;
    const encoded = rawCookie.slice(cookiePrefix.length);
    if (!encoded) return null;

    const parsed = JSON.parse(decodeURIComponent(encoded)) as IFirstTouchUtm;
    if (typeof parsed !== 'object' || !parsed) return null;
    return parsed;
  } catch {
    return null;
  }
}

function storeFirstTouchUtm(value: IFirstTouchUtm): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(FIRST_TOUCH_UTM_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Get referral source from cookie or header.
 * Reads the first-touch referral source set by middleware.
 * Falls back to x-referral-source header if cookie is not set.
 */
function getReferralSource(): IReferralSource | null {
  if (typeof window === 'undefined') return null;

  // First try to read from cookie
  const cookiePrefix = `${REFERRAL_SOURCE_COOKIE_KEY}=`;
  const rawCookie = document.cookie
    .split(';')
    .map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith(cookiePrefix));

  if (rawCookie) {
    const referralSource = rawCookie.slice(cookiePrefix.length);
    if (
      referralSource &&
      ['chatgpt', 'perplexity', 'claude', 'google_sge', 'google', 'direct', 'other'].includes(
        referralSource
      )
    ) {
      return referralSource as IReferralSource;
    }
  }

  // Fallback: check if we're in a browser environment with access to response headers
  // Note: Response headers are not directly accessible in client-side JavaScript,
  // but the middleware may have set a meta tag or other mechanism
  // For now, return null if cookie is not set
  return null;
}

/**
 * Get the entry page for session attribution.
 * Returns the first page visited in this session.
 */
function getEntryPage(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(ENTRY_PAGE_KEY);
  } catch {
    // Gracefully handle Safari private mode and quota errors
    return null;
  }
}

function shouldLogDevAnalytics(): boolean {
  return typeof window !== 'undefined' && isDevelopment() && !isTest();
}

function buildTrackedEventProperties(
  properties?: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...properties,
    session_id: getSessionId(),
    timestamp: Date.now(),
  };
}

function getCurrentUtmProperties(): Record<string, string> {
  if (typeof window === 'undefined') return {};

  const url = new URL(window.location.href);
  const utmParams = {
    utmSource: url.searchParams.get('utm_source') || undefined,
    utmMedium: url.searchParams.get('utm_medium') || undefined,
    utmCampaign: url.searchParams.get('utm_campaign') || undefined,
    utmTerm: url.searchParams.get('utm_term') || undefined,
    utmContent: url.searchParams.get('utm_content') || undefined,
  };

  return Object.fromEntries(
    Object.entries(utmParams).filter(([, value]) => value !== undefined)
  ) as Record<string, string>;
}

function buildPageViewProperties(
  path: string,
  properties?: Record<string, unknown>,
  referralSource?: IReferralSource | null
): Record<string, unknown> {
  return {
    path,
    referrer: typeof document === 'undefined' ? undefined : document.referrer || undefined,
    referral_source: referralSource || undefined,
    entry_page: getEntryPage() || path,
    ...getCurrentUtmProperties(),
    ...properties,
  };
}

function logDevTrack(name: IAnalyticsEvent['name'], properties: Record<string, unknown>): void {
  if (!shouldLogDevAnalytics()) return;

  console.info('[Analytics:dev] track', {
    name,
    properties,
  });
}

async function getSafeIdentifyLogPayload(
  identity: IUserIdentity & { email?: string }
): Promise<Record<string, unknown>> {
  const payload: Record<string, unknown> = { ...identity };

  if (typeof identity.email === 'string') {
    payload.email_hash = await hashEmail(identity.email);
    delete payload.email;
  }

  return payload;
}

/**
 * Set the entry page if not already set.
 * Should be called on first page view.
 */
function setEntryPageOnce(path: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (!localStorage.getItem(ENTRY_PAGE_KEY)) {
      localStorage.setItem(ENTRY_PAGE_KEY, path);
    }
  } catch {
    // Gracefully handle Safari private mode and quota errors
  }
}

async function hashEmail(email: string): Promise<string> {
  // Use Web Crypto API for secure SHA-256 hashing
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    // Fallback for non-browser environments
    let hash = 0;
    const normalizedEmail = email.toLowerCase().trim();
    for (let i = 0; i < normalizedEmail.length; i++) {
      const char = normalizedEmail.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  try {
    // Normalize email to ensure consistent hashing
    const normalizedEmail = email.toLowerCase().trim();
    const encoder = new TextEncoder();
    const data = encoder.encode(normalizedEmail);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    // Fallback if crypto.subtle fails
    console.warn('[Analytics] Crypto hashing failed, using fallback:', error);
    let hash = 0;
    const normalizedEmail = email.toLowerCase().trim();
    for (let i = 0; i < normalizedEmail.length; i++) {
      const char = normalizedEmail.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
}

// =============================================================================
// Analytics Service (Client-side only)
// =============================================================================

export const analytics = {
  /**
   * Initialize analytics service.
   * Should be called once when the app loads.
   */
  async init(apiKey: string): Promise<void> {
    if (typeof window === 'undefined') {
      console.warn('[Analytics] Cannot initialize in server environment');
      return;
    }

    if (isInitialized || !apiKey) return;

    consentStatus = getStoredConsent();

    // Only initialize Amplitude if consent is granted
    if (consentStatus !== 'granted') {
      return;
    }

    // Dynamic import to code-split Amplitude (~40KB)
    if (!amplitudeModule) {
      amplitudeModule = await import('@amplitude/analytics-browser');
    }

    amplitudeModule.init(apiKey, {
      autocapture: {
        elementInteractions: false,
        pageViews: false, // We handle this manually for SPA
        sessions: true,
        formInteractions: false,
        fileDownloads: false,
      },
      defaultTracking: {
        sessions: true,
        pageViews: false, // We handle pageViews manually
      },
    });

    isInitialized = true;
  },

  /**
   * Check if analytics is enabled and initialized.
   */
  isEnabled(): boolean {
    return isInitialized && consentStatus === 'granted';
  },

  /**
   * Update consent status and re-initialize if needed.
   */
  async setConsent(status: IConsentStatus, apiKey?: string): Promise<void> {
    consentStatus = status;

    try {
      localStorage.setItem(
        CONSENT_STORAGE_KEY,
        JSON.stringify({
          analytics: status,
          updatedAt: Date.now(),
        })
      );
    } catch {
      // Ignore storage errors
    }

    if (status === 'granted' && apiKey && !isInitialized) {
      await this.init(apiKey);
    } else if (status === 'denied' && isInitialized && amplitudeModule) {
      // Reset Amplitude on consent withdrawal
      amplitudeModule.reset();
      isInitialized = false;
    }
  },

  /**
   * Get current consent status.
   */
  getConsent(): IConsentStatus {
    return consentStatus;
  },

  /**
   * Identify a user. Call after login/signup.
   */
  async identify(identity: IUserIdentity & { email?: string }): Promise<void> {
    if (shouldLogDevAnalytics()) {
      console.info('[Analytics:dev] identify', await getSafeIdentifyLogPayload(identity));
    }

    if (!this.isEnabled() || !amplitudeModule) return;

    amplitudeModule.setUserId(identity.userId);

    const identifyEvent = new amplitudeModule.Identify();

    // Set plaintext email (required for Stripe/Amplitude cross-referencing) and its hash
    if (identity.email) {
      identifyEvent.set('email', identity.email);
      const emailHash = await hashEmail(identity.email);
      identifyEvent.set('email_hash', emailHash);
    } else if (identity.emailHash) {
      identifyEvent.set('email_hash', identity.emailHash);
    }
    if (identity.createdAt) {
      identifyEvent.setOnce('created_at', identity.createdAt);
    }
    if (identity.subscriptionTier) {
      identifyEvent.set('subscription_tier', identity.subscriptionTier);
    }
    // NEW: Add pricingRegion, imagesUpscaledLifetime, accountAgeDays for user lifecycle analysis
    if (identity.pricingRegion) {
      identifyEvent.set('pricing_region', identity.pricingRegion);
    }
    if (identity.imagesUpscaledLifetime !== undefined) {
      identifyEvent.set('images_upscaled_lifetime', identity.imagesUpscaledLifetime);
    }
    if (identity.accountAgeDays !== undefined) {
      identifyEvent.set('account_age_days', identity.accountAgeDays);
    }

    amplitudeModule.identify(identifyEvent);
  },

  /**
   * Clear user identity on logout.
   */
  reset(): void {
    if (shouldLogDevAnalytics()) {
      console.info('[Analytics:dev] reset');
    }

    if (!isInitialized || !amplitudeModule) return;
    amplitudeModule.reset();
  },

  /**
   * Track an analytics event.
   */
  track(name: IAnalyticsEvent['name'], properties?: Record<string, unknown>): void {
    const eventProperties = buildTrackedEventProperties(properties);
    logDevTrack(name, eventProperties);

    if (!this.isEnabled() || !amplitudeModule) return;

    amplitudeModule.track(name, eventProperties);
  },

  /**
   * Track a page view event.
   */
  trackPageView(path: string, properties?: Record<string, unknown>): void {
    const referralSource = getReferralSource();

    if (!this.isEnabled() || !amplitudeModule) {
      logDevTrack(
        'page_view',
        buildTrackedEventProperties(buildPageViewProperties(path, properties, referralSource))
      );
      return;
    }

    // Initialize entry page for session attribution
    setEntryPageOnce(path);

    // Track return visit on first page view
    const lastVisit = getLastVisit();
    const currentSessionId = getSessionId();
    if (lastVisit && lastVisit.sessionId !== currentSessionId) {
      // Calculate days since last visit
      const daysSinceLastVisit = Math.floor(
        (Date.now() - lastVisit.timestamp) / (1000 * 60 * 60 * 24)
      );

      // Only track return visits for users who visited more than 1 day ago
      // to avoid same-day session counting as return visits
      if (daysSinceLastVisit >= 1) {
        this.track('return_visit', {
          daysSinceLastVisit,
          previousSessionId: lastVisit.sessionId,
          entryPage: path,
        });
      }
    }

    // Update last visit timestamp
    setLastVisit();

    const filteredUtm = getCurrentUtmProperties();

    // Resolve first-touch attribution from URL (preferred), then localStorage, then middleware cookie
    const hasUtmInUrl = Object.keys(filteredUtm).length > 0;
    let firstTouchUtm: IFirstTouchUtm | null = getStoredFirstTouchUtm();

    if (hasUtmInUrl) {
      // Keep strict first-touch semantics: only persist from URL when no prior attribution exists.
      if (!firstTouchUtm) {
        firstTouchUtm = {
          ...filteredUtm,
          landingPage: window.location.pathname,
          timestamp: Date.now(),
        };
        storeFirstTouchUtm(firstTouchUtm);
      }
    } else if (!firstTouchUtm) {
      const cookieUtm = getFirstTouchUtmFromCookie();
      if (cookieUtm) {
        firstTouchUtm = cookieUtm;
        storeFirstTouchUtm(cookieUtm);
      }
    }

    // Persist first-touch attribution as user properties (setOnce = never overwritten)
    if (firstTouchUtm) {
      const identifyEvent = new amplitudeModule.Identify();

      if (firstTouchUtm.utmSource) {
        identifyEvent.setOnce('first_touch_utm_source', firstTouchUtm.utmSource);
        identifyEvent.setOnce('first_touch_source', firstTouchUtm.utmSource);
      }
      if (firstTouchUtm.utmMedium) {
        identifyEvent.setOnce('first_touch_utm_medium', firstTouchUtm.utmMedium);
        identifyEvent.setOnce('first_touch_medium', firstTouchUtm.utmMedium);
      }
      if (firstTouchUtm.utmCampaign) {
        identifyEvent.setOnce('first_touch_utm_campaign', firstTouchUtm.utmCampaign);
        identifyEvent.setOnce('first_touch_campaign', firstTouchUtm.utmCampaign);
      }
      if (firstTouchUtm.utmTerm)
        identifyEvent.setOnce('first_touch_utm_term', firstTouchUtm.utmTerm);
      if (firstTouchUtm.utmContent)
        identifyEvent.setOnce('first_touch_utm_content', firstTouchUtm.utmContent);
      if (firstTouchUtm.landingPage)
        identifyEvent.setOnce('first_touch_landing', firstTouchUtm.landingPage);

      amplitudeModule.identify(identifyEvent);
    }

    // Get and persist referral source as first-touch user property
    if (referralSource) {
      const identifyEvent = new amplitudeModule.Identify();
      identifyEvent.setOnce('referral_source', referralSource);
      amplitudeModule.identify(identifyEvent);
    }

    this.track('page_view', buildPageViewProperties(path, properties, referralSource));
  },

  /**
   * Utility to hash an email for identification.
   */
  hashEmail,

  /**
   * Get the Amplitude device ID for server-side correlation.
   * Returns the device_id stored by Amplitude SDK in localStorage.
   * Returns null if not available (server environment or not initialized).
   *
   * @example
   * // Send device ID to server for identity correlation
   * const deviceId = analytics.getDeviceId();
   * if (deviceId) {
   *   await fetch('/api/checkout', {
   *     body: JSON.stringify({ deviceId, ...otherData })
   *   });
   * }
   */
  getDeviceId(): string | null {
    if (typeof window === 'undefined') return null;

    // If Amplitude is initialized, get the device ID directly from the SDK
    if (amplitudeModule) {
      try {
        const deviceId = amplitudeModule.getDeviceId();
        if (deviceId) {
          return deviceId;
        }
      } catch {
        // Ignore errors
      }
    }

    // Fallback: generate a consistent device ID based on a stored value
    // This ensures we have something to correlate even before Amplitude fully initializes
    const DEVICE_ID_KEY = 'miu_device_id';
    try {
      let deviceId = localStorage.getItem(DEVICE_ID_KEY);
      if (!deviceId) {
        // Generate a new device ID if none exists
        deviceId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
        localStorage.setItem(DEVICE_ID_KEY, deviceId);
      }
      return deviceId;
    } catch {
      return null;
    }
  },

  /**
   * Get the Amplitude session ID (Unix ms integer).
   * Pass to server-side analytics calls so server events stitch to the browser session.
   * Returns null if Amplitude is not initialized or running server-side.
   */
  getAmplitudeSessionId(): number | null {
    if (typeof window === 'undefined' || !amplitudeModule) return null;
    try {
      const id = amplitudeModule.getSessionId();
      return typeof id === 'number' ? id : null;
    } catch {
      return null;
    }
  },

  /**
   * Get the entry page for conversion attribution.
   * Returns the first page the user landed on.
   */
  getEntryPage(): string | null {
    return getEntryPage();
  },

  /**
   * Initialize entry page tracking.
   * Call on first page load.
   */
  initEntryPage(path: string): void {
    setEntryPageOnce(path);
  },
};
