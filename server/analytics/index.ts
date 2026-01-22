/**
 * Server Analytics Module
 *
 * Server-side analytics using Amplitude HTTP API.
 * For client-side analytics, use @client/analytics instead.
 */

export { trackServerEvent } from '@server/analytics/analyticsService';
export type { IServerTrackOptions } from '@server/analytics/analyticsService';
export type {
  IAnalyticsEvent,
  IAnalyticsEventName,
  IUserIdentity,
  IConsentStatus,
  IAnalyticsConsent,
  IPageViewProperties,
  ISignupProperties,
  ISubscriptionProperties,
  ICreditPackProperties,
  IApiCallProperties,
} from '@server/analytics/types';
