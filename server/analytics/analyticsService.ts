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
 * ```
 */

import type { IAnalyticsEvent } from '@server/analytics/types';
import { serverEnv } from '@shared/config/env';

// =============================================================================
// Server-side HTTP API (for use in API routes)
// =============================================================================

export interface IServerTrackOptions {
  apiKey: string;
  userId?: string;
  deviceId?: string;
}

/**
 * Track an event via Amplitude HTTP API.
 * Use this for server-side events (payments, auth, critical actions).
 *
 * @example
 * ```ts
 * await trackServerEvent(
 *   'subscription_created',
 *   { plan: 'pro', amountCents: 2900 },
 *   { apiKey: serverEnv.AMPLITUDE_API_KEY, userId: 'user_123' }
 * );
 * ```
 */
export async function trackServerEvent(
  name: IAnalyticsEvent['name'],
  properties: Record<string, unknown>,
  options: IServerTrackOptions
): Promise<boolean> {
  const { apiKey, userId, deviceId } = options;

  if (!apiKey) {
    return false;
  }

  // Skip actual API calls in test environment to avoid rate limiting
  if (
    serverEnv.ENV === 'test' ||
    serverEnv.AMPLITUDE_API_KEY?.includes('test') ||
    serverEnv.AMPLITUDE_API_KEY?.startsWith('test_amplitude_api_key')
  ) {
    return true;
  }

  const event = {
    event_type: name,
    user_id: userId,
    device_id: deviceId || `server-${Date.now()}`,
    event_properties: properties,
    time: Date.now(),
  };

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

    return response.ok;
  } catch {
    // Log to Baselime in production
    console.error('[Analytics] Failed to send server event:', name);
    return false;
  }
}
