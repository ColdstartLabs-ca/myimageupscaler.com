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

import * as amplitude from '@amplitude/analytics-browser';
import type {
  IAnalyticsEvent,
  IUserIdentity,
  IConsentStatus,
} from '@server/analytics/types';

// =============================================================================
// Constants
// =============================================================================

const CONSENT_STORAGE_KEY = 'pp_analytics_consent';
const SESSION_ID_KEY = 'pp_session_id';

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
   * Initialize the analytics service.
   * Should be called once when the app loads.
   */
  init(apiKey: string): void {
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

    amplitude.init(apiKey, {
      autocapture: {
        elementInteractions: false,
        pageViews: false, // We handle this manually for SPA
        sessions: true,
        formInteractions: false,
        fileDownloads: false,
      },
      defaultTracking: false,
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
  setConsent(status: IConsentStatus, apiKey?: string): void {
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
      this.init(apiKey);
    } else if (status === 'denied' && isInitialized) {
      // Reset Amplitude on consent withdrawal
      amplitude.reset();
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
    if (!this.isEnabled()) return;

    amplitude.setUserId(identity.userId);

    const identifyEvent = new amplitude.Identify();

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

    amplitude.identify(identifyEvent);
  },

  /**
   * Clear user identity on logout.
   */
  reset(): void {
    if (!isInitialized) return;
    amplitude.reset();
  },

  /**
   * Track an analytics event.
   */
  track(name: IAnalyticsEvent['name'], properties?: Record<string, unknown>): void {
    if (!this.isEnabled()) return;

    const eventProperties = {
      ...properties,
      session_id: getSessionId(),
      timestamp: Date.now(),
    };

    amplitude.track(name, eventProperties);
  },

  /**
   * Track a page view event.
   */
  trackPageView(path: string, properties?: Record<string, unknown>): void {
    if (!this.isEnabled()) return;

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
};
