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
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { serverEnv } from '@shared/config/env';
import { TIMEOUTS } from '@shared/config/timeouts.config';
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
  /** Stable provider object used to deduplicate billing telemetry. */
  sourceObjectId?: string;
  /** Stable lifecycle action paired with sourceObjectId. */
  lifecycleAction?: string;
  /** Claim the billing analytics deduplication record before sending. */
  deduplicate?: boolean;
  /** Explicit Amplitude insert_id override. */
  insertId?: string;
}

export function buildAnalyticsInsertId(
  eventName: IAnalyticsEvent['name'],
  options: Pick<IServerTrackOptions, 'sourceObjectId' | 'lifecycleAction' | 'insertId'>
): string | undefined {
  if (options.insertId) return options.insertId;
  if (!options.sourceObjectId) return undefined;

  return `${eventName}:${options.sourceObjectId}:${options.lifecycleAction || 'event'}`;
}

interface IBillingAnalyticsClaimError {
  code?: string;
  message?: string;
}

interface IBillingAnalyticsClaimResult {
  shouldSend: boolean;
  claimed: boolean;
}

async function claimBillingAnalyticsEvent(
  eventName: IAnalyticsEvent['name'],
  options: IServerTrackOptions,
  insertId: string | undefined
): Promise<IBillingAnalyticsClaimResult> {
  if (!options.deduplicate || !options.sourceObjectId || !options.lifecycleAction || !insertId) {
    return { shouldSend: true, claimed: false };
  }

  try {
    const { error } = await supabaseAdmin.from('billing_analytics_events').insert({
      event_key: insertId,
      event_name: eventName,
      source_object_id: options.sourceObjectId,
      lifecycle_action: options.lifecycleAction,
      user_id: options.userId ?? null,
    });

    if (error?.code === '23505') {
      return { shouldSend: false, claimed: false };
    }

    if (!error) return { shouldSend: true, claimed: true };

    console.error('[Analytics] Billing event deduplication claim failed', {
      event: eventName,
      sourceObjectId: options.sourceObjectId,
      lifecycleAction: options.lifecycleAction,
      error: error.message,
    });
  } catch (error) {
    // A telemetry claim must never prevent a successful Stripe operation.
    const claimError = error as IBillingAnalyticsClaimError;
    console.error('[Analytics] Billing event deduplication claim unavailable', {
      event: eventName,
      sourceObjectId: options.sourceObjectId,
      lifecycleAction: options.lifecycleAction,
      error: claimError.message || String(error),
    });
  }

  return { shouldSend: true, claimed: false };
}

async function releaseBillingAnalyticsClaim(
  eventName: IAnalyticsEvent['name'],
  options: IServerTrackOptions,
  insertId: string | undefined
): Promise<void> {
  if (!insertId || !options.sourceObjectId || !options.lifecycleAction) return;

  try {
    const { error } = await supabaseAdmin
      .from('billing_analytics_events')
      .delete()
      .eq('event_key', insertId);
    if (error) {
      console.error('[Analytics] Billing event deduplication claim release failed', {
        event: eventName,
        sourceObjectId: options.sourceObjectId,
        lifecycleAction: options.lifecycleAction,
        error: error.message,
      });
    }
  } catch (error) {
    const releaseError = error as IBillingAnalyticsClaimError;
    console.error('[Analytics] Billing event deduplication claim release unavailable', {
      event: eventName,
      sourceObjectId: options.sourceObjectId,
      lifecycleAction: options.lifecycleAction,
      error: releaseError.message || String(error),
    });
  }
}

export async function fetchAnalyticsWithTimeout(
  url: string,
  init: Parameters<typeof fetch>[1],
  timeoutMs = TIMEOUTS.ANALYTICS_BATCH_TIMEOUT,
  fetchImplementation: typeof fetch = fetch
): Promise<Response> {
  const controller = new AbortController();
  const timeoutError = new Error(`Analytics request timed out after ${timeoutMs}ms`);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort(timeoutError);
      reject(timeoutError);
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      fetchImplementation(url, { ...init, signal: controller.signal }),
      timeoutPromise,
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
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
  properties: object,
  options: IServerTrackOptions
): Promise<boolean> {
  const { apiKey, userId, deviceId, sessionId, sourceObjectId, lifecycleAction } = options;

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

  const insertId = buildAnalyticsInsertId(name, options);
  const claim = await claimBillingAnalyticsEvent(name, options, insertId);
  if (!claim.shouldSend) return true;

  const eventProperties: Record<string, unknown> = {
    ...(properties as Record<string, unknown>),
    ...(name !== '$identify' && sourceObjectId && !('sourceObjectId' in properties)
      ? { sourceObjectId }
      : {}),
    ...(name !== '$identify' && lifecycleAction && !('lifecycleAction' in properties)
      ? { lifecycleAction }
      : {}),
  };

  // Build the event payload
  // For $identify events, use user_properties instead of event_properties
  const isIdentifyEvent = name === '$identify';

  const event: Record<string, unknown> = {
    event_type: name,
    user_id: userId,
    device_id: deviceId || `server-${Date.now()}`,
    time: Date.now(),
    ...(sessionId !== undefined ? { session_id: sessionId } : {}),
    ...(insertId ? { insert_id: insertId } : {}),
  };

  if (isIdentifyEvent) {
    // For $identify, the properties contain user property operations
    // These go in user_properties, not event_properties
    event.user_properties = eventProperties;
  } else {
    // For regular events, properties are event_properties
    event.event_properties = eventProperties;
  }

  try {
    const response = await fetchAnalyticsWithTimeout('https://api2.amplitude.com/2/httpapi', {
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
      if (claim.claimed) {
        await releaseBillingAnalyticsClaim(name, options, insertId);
      }
    }

    // Also send to GA4 Measurement Protocol (fire-and-forget, non-blocking)
    trackGA4ServerEvent(name, eventProperties, { userId, deviceId }).catch(() => {});

    return response.ok;
  } catch (err) {
    if (claim.claimed) {
      await releaseBillingAnalyticsClaim(name, options, insertId);
    }
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
    const response = await fetchAnalyticsWithTimeout(
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
    invoiceId?: string;
    subscriptionId?: string;
    sourceObjectId?: string;
    lifecycleAction?: string;
  },
  options: IServerTrackOptions
): Promise<boolean> {
  if (!Number.isFinite(params.amountCents) || params.amountCents <= 0) {
    console.warn('[Analytics] Skipping non-positive revenue event', {
      userId: params.userId,
      amountCents: params.amountCents,
      sourceObjectId: params.sourceObjectId || options.sourceObjectId,
    });
    return false;
  }

  const sourceObjectId = params.sourceObjectId || options.sourceObjectId;
  const lifecycleAction = params.lifecycleAction || options.lifecycleAction;

  return trackServerEvent(
    'revenue_received',
    {
      $revenue: params.amountCents / 100, // Amplitude expects dollars
      $productId: params.productId,
      $quantity: params.quantity ?? 1,
      $revenueType: params.purchaseType,
      amountCents: params.amountCents,
      currency: (params.currency ?? 'usd').toLowerCase(),
      ...(params.invoiceId ? { invoiceId: params.invoiceId } : {}),
      ...(params.subscriptionId ? { subscriptionId: params.subscriptionId } : {}),
      ...(sourceObjectId ? { sourceObjectId } : {}),
      ...(lifecycleAction ? { lifecycleAction } : {}),
    },
    {
      ...options,
      userId: params.userId,
      ...(sourceObjectId ? { sourceObjectId } : {}),
      ...(lifecycleAction ? { lifecycleAction } : {}),
    }
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
