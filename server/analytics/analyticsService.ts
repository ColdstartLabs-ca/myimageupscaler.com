/**
 * Server-side Analytics Service
 *
 * Server-only analytics using Amplitude HTTP API.
 * This module should ONLY be imported in server-side code (API routes, server components).
 *
 * For client-side analytics, use @client/analytics instead.
 *
 * @example
 * ```ts
 * import { trackServerEvent } from '@server/analytics';
 *
 * // Track a server-side event
 * await trackServerEvent(
 *   'subscription_created',
 *   { plan: 'pro', amountCents: 2900 },
 *   { apiKey: serverEnv.AMPLITUDE_API_KEY, userId: 'user_123' }
 * );
 *
 * // Track an $identify event to set user properties
 * await trackServerEvent(
 *   '$identify',
 *   { $set: { plan: 'pro', subscription_status: 'active' } },
 *   { apiKey: serverEnv.AMPLITUDE_API_KEY, userId: 'user_123' }
 * );
 * ```
 */

import type { IAnalyticsEvent } from '@server/analytics/types';
import { serverEnv } from '@shared/config/env';
import { GA4_EVENT_MAP, GA4_CONVERSION_EVENTS } from '@shared/analytics/types';

// =============================================================================
// Server-side HTTP API (for use in API routes)
// =============================================================================

export interface IServerTrackOptions {
  apiKey: string;
  userId?: string;
  deviceId?: string;
  /** Amplitude session_id (Unix ms) — stitches server events to the browser session that triggered them */
  sessionId?: number;
}

/**
 * Interface for $identify event properties.
 * Amplitude's $identify event uses special property keys.
 */
export interface IIdentifyEventProperties {
  $set?: Record<string, unknown>;
  $setOnce?: Record<string, unknown>;
  $add?: Record<string, number>;
  $append?: Record<string, unknown>;
  $prepend?: Record<string, unknown>;
  $remove?: Record<string, unknown>;
  $unset?: string[];
  $clearAll?: boolean;
}

/**
 * Track an event via Amplitude HTTP API.
 * Use this for server-side events (payments, auth, critical actions).
 *
 * For $identify events, properties should use Amplitude's special keys:
 * - $set: Set user properties (overwrites existing)
 * - $setOnce: Set user properties only if not already set
 * - $add: Add to a numeric user property
 * - $append: Append to a list user property
 *
 * @example
 * ```ts
 * // Regular event
 * await trackServerEvent(
 *   'subscription_created',
 *   { plan: 'pro', amountCents: 2900 },
 *   { apiKey: serverEnv.AMPLITUDE_API_KEY, userId: 'user_123' }
 * );
 *
 * // $identify event to set user properties
 * await trackServerEvent(
 *   '$identify',
 *   {
 *     $set: {
 *       plan: 'pro',
 *       subscription_status: 'active',
 *       subscription_started_at: new Date().toISOString(),
 *       billing_interval: 'monthly',
 *     },
 *   },
 *   { apiKey: serverEnv.AMPLITUDE_API_KEY, userId: 'user_123' }
 * );
 * ```
 */
export async function trackServerEvent(
  name: IAnalyticsEvent['name'],
  properties: Record<string, unknown>,
  options: IServerTrackOptions
): Promise<boolean> {
  const { apiKey, userId, deviceId, sessionId } = options;

  if (!apiKey) {
    console.error('[Analytics] Missing Amplitude API key for server event', {
      event: name,
      userId,
    });
    return false;
  }

  // Skip actual API calls in test and development environments
  if (
    serverEnv.ENV === 'test' ||
    serverEnv.ENV === 'development' ||
    serverEnv.AMPLITUDE_API_KEY?.includes('test') ||
    serverEnv.AMPLITUDE_API_KEY?.startsWith('test_amplitude_api_key')
  ) {
    if (serverEnv.ENV === 'development') {
      console.log(`[Analytics] Skipped event in development: ${name}`);
    }
    return true;
  }

  // Build the event payload
  // For $identify events, use user_properties instead of event_properties
  const isIdentifyEvent = name === '$identify';

  const event: Record<string, unknown> = {
    event_type: name,
    user_id: userId,
    device_id: deviceId || `server-${Date.now()}`,
    time: Date.now(),
    ...(sessionId !== undefined ? { session_id: sessionId } : {}),
  };

  if (isIdentifyEvent) {
    // For $identify, the properties contain user property operations
    // These go in user_properties, not event_properties
    event.user_properties = properties;
  } else {
    // For regular events, properties are event_properties
    event.event_properties = properties;
  }

  try {
    const response = await fetch('https://api2.amplitude.com/2/httpapi', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: '*/*',
      },
      body: JSON.stringify({
        api_key: apiKey,
        events: [event],
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '<unreadable>');
      console.error('[Analytics] Amplitude API error:', {
        status: response.status,
        body,
        event: name,
        userId,
      });
    }

    // Also send to GA4 Measurement Protocol (fire-and-forget, non-blocking)
    trackGA4ServerEvent(name, properties, { userId, deviceId }).catch(() => {});

    return response.ok;
  } catch (err) {
    console.error('[Analytics] Failed to send server event:', name, err);
    return false;
  }
}

/**
 * Send an event to GA4 via Measurement Protocol.
 * Non-blocking companion to Amplitude — if it fails, Amplitude is unaffected.
 */
async function trackGA4ServerEvent(
  name: IAnalyticsEvent['name'],
  properties: Record<string, unknown>,
  options: { userId?: string; deviceId?: string }
): Promise<void> {
  const measurementId = serverEnv.GA_MEASUREMENT_ID;
  const apiSecret = serverEnv.GA4_API_SECRET;

  if (!measurementId || !apiSecret) return;

  const ga4EventName = GA4_EVENT_MAP[name] || name;

  const ga4Params: Record<string, unknown> = { ...properties };
  if (options.userId) {
    ga4Params.user_id = options.userId;
  }

  // Extract value/currency for purchase events
  if (GA4_CONVERSION_EVENTS.includes(name)) {
    if (properties.amountCents) {
      ga4Params.value = (properties.amountCents as number) / 100;
      ga4Params.currency = properties.currency || 'USD';
    }
    if (properties.planTier) ga4Params.item_name = properties.planTier;
    if (properties.pack) ga4Params.item_name = properties.pack;
  }

  try {
    const response = await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: options.deviceId || `server-${Date.now()}`,
          user_id: options.userId || undefined,
          events: [{ name: ga4EventName, params: ga4Params }],
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text().catch(() => '<unreadable>');
      console.error('[Analytics] GA4 Measurement Protocol error:', {
        status: response.status,
        body,
        event: name,
      });
    }
  } catch (err) {
    console.error('[Analytics] GA4 server event failed:', name, err);
  }
}

/**
 * Track revenue via Amplitude HTTP API using special revenue properties.
 * Amplitude recognises $revenue, $productId, $quantity, $revenueType to populate
 * Revenue charts, LTV, and ARPU in the Amplitude dashboard.
 */
export async function trackRevenue(
  params: {
    userId: string;
    amountCents: number;
    productId: string; // e.g. 'subscription_pro_monthly' or 'credit_pack_starter'
    purchaseType: 'subscription' | 'credit_pack';
    quantity?: number;
    currency?: string;
  },
  options: IServerTrackOptions
): Promise<boolean> {
  return trackServerEvent(
    'revenue_received',
    {
      $revenue: params.amountCents / 100, // Amplitude expects dollars
      $productId: params.productId,
      $quantity: params.quantity ?? 1,
      $revenueType: params.purchaseType,
      amountCents: params.amountCents,
      currency: params.currency ?? 'usd',
    },
    { ...options, userId: params.userId }
  );
}

/**
 * Set pricing_region as a user property via $identify.
 * This enables regional cohort analysis even if individual events are missing data.
 * Uses $setOnce to only set once per user (doesn't overwrite if already set).
 *
 * @example
 * ```ts
 * // After detecting user's pricing region
 * await setPricingRegionUserProperty(
 *   'user_123',
 *   'south_asia',
 *   { apiKey: serverEnv.AMPLITUDE_API_KEY }
 * );
 * ```
 */
export async function setPricingRegionUserProperty(
  userId: string,
  pricingRegion: string,
  options: IServerTrackOptions
): Promise<boolean> {
  return trackServerEvent(
    '$identify',
    {
      $setOnce: { pricing_region: pricingRegion },
    },
    { ...options, userId }
  );
}

// Re-export hashEmail for backwards compatibility
export { hashEmail } from '@shared/utils/crypto';
