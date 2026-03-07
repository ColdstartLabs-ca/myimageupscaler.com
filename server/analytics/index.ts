/**
 * Server Analytics Module
 *
 * Server-side analytics using Amplitude HTTP API.
 * For client-side analytics, use @client/analytics instead.
 */

export { trackServerEvent, trackRevenue } from '@server/analytics/analyticsService';
export type { IServerTrackOptions } from '@server/analytics/analyticsService';
export type {
  IAnalyticsEvent,
  IAnalyticsEventName,
  IUserIdentity,
  IConsentStatus,
  IAnalyticsConsent,
  IPageViewProperties,
  IReturnVisitProperties,
  ISignupProperties,
  ISubscriptionProperties,
  ICreditPackProperties,
  IImageUpscaledProperties,
} from '@server/analytics/types';
