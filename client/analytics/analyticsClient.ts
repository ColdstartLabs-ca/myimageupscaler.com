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

import type { IAnalyticsEvent, IUserIdentity, IConsentStatus } from '@server/analytics/types';

// Dynamically import Amplitude to code-split this heavy library (~40KB)
let amplitudeModule: typeof import('@amplitude/analytics-browser') | null = null;

// =============================================================================
// Constants
// =============================================================================

const CONSENT_STORAGE_KEY = 'pp_analytics_consent';
const SESSION_ID_KEY = 'pp_session_id';
const FIRST_TOUCH_UTM_STORAGE_KEY = 'miu_first_touch_utm';
const FIRST_TOUCH_UTM_COOKIE_KEY = 'miu_first_touch_utm';

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
    if (!this.isEnabled() || !amplitudeModule) return;

    amplitudeModule.setUserId(identity.userId);

    const identifyEvent = new amplitudeModule.Identify();

    // Hash email if provided, otherwise use pre-computed hash
    if (identity.email) {
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

    amplitudeModule.identify(identifyEvent);
  },

  /**
   * Clear user identity on logout.
   */
  reset(): void {
    if (!isInitialized || !amplitudeModule) return;
    amplitudeModule.reset();
  },

  /**
   * Track an analytics event.
   */
  track(name: IAnalyticsEvent['name'], properties?: Record<string, unknown>): void {
    if (!this.isEnabled() || !amplitudeModule) return;

    const eventProperties = {
      ...properties,
      session_id: getSessionId(),
      timestamp: Date.now(),
    };

    amplitudeModule.track(name, eventProperties);
  },

  /**
   * Track a page view event.
   */
  trackPageView(path: string, properties?: Record<string, unknown>): void {
    if (!this.isEnabled() || !amplitudeModule) return;

    const url = new URL(window.location.href);
    const utmParams = {
      utmSource: url.searchParams.get('utm_source') || undefined,
      utmMedium: url.searchParams.get('utm_medium') || undefined,
      utmCampaign: url.searchParams.get('utm_campaign') || undefined,
      utmTerm: url.searchParams.get('utm_term') || undefined,
      utmContent: url.searchParams.get('utm_content') || undefined,
    };

    // Filter out undefined values
    const filteredUtm = Object.fromEntries(
      Object.entries(utmParams).filter(([, v]) => v !== undefined)
    );

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

    this.track('page_view', {
      path,
      referrer: document.referrer || undefined,
      ...filteredUtm,
      ...properties,
    });
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
};
