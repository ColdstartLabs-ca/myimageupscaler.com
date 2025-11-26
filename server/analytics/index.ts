/**
 * Analytics Module
 *
 * Centralized analytics for PixelPerfect using Amplitude (product events)
 * and Google Analytics 4 (marketing/acquisition).
 */

export { analytics, trackServerEvent } from '@server/analytics/analyticsService';
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
  IImageUpscaledProperties,
} from '@server/analytics/types';
