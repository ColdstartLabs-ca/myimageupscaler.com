/**
 * Recovery Email Types
 *
 * Type definitions for the abandoned checkout recovery email sequence.
 * Supports 3-email sequence: 1hr (reminder), 24hr (social proof), 72hr (discount).
 */

import type { IAbandonedCheckout } from './abandoned-checkout.types';

/**
 * Recovery email timing types
 * - 1hr: Friendly reminder sent 1 hour after abandonment
 * - 24hr: Social proof email sent 24 hours after abandonment
 * - 72hr: Discount incentive email sent 72 hours after abandonment
 */
export type IRecoveryEmailType = '1hr' | '24hr' | '72hr';

/**
 * Data passed to recovery email templates
 */
export interface IRecoveryEmailData {
  /** Index signature for compatibility with Record<string, unknown> */
  [key: string]: unknown;
  /** Abandoned checkout ID for tracking and recovery URL */
  checkoutId: string;
  /** User's email address */
  email: string;
  /** Plan name for display (e.g., "Pro Plan", "Starter Pack") */
  planName: string;
  /** Original price in cents */
  amountCents: number;
  /** Currency code (e.g., "USD") */
  currency: string;
  /** Formatted price for display (e.g., "$9.00") */
  amountFormatted: string;
  /** Full recovery URL with checkout ID */
  recoveryUrl: string;
  /** Discount code (only for 72hr email) */
  discountCode?: string;
  /** Discount percentage (only for 72hr email) */
  discountPercent?: number;
  /** Discount expiration date (only for 72hr email) */
  discountExpiresAt?: string;
  /** Social proof stat (only for 24hr email) */
  socialProofStat?: string;
  /** Email type for analytics */
  emailType: IRecoveryEmailType;
  /** Email number for analytics (1, 2, or 3) */
  emailNumber: 1 | 2 | 3;
  /** Base URL for the app */
  baseUrl: string;
  /** Support email address */
  supportEmail: string;
  /** App name */
  appName: string;
}

/**
 * Result of sending a recovery email
 */
export interface IRecoveryEmailResult {
  /** Whether the email was sent successfully */
  success: boolean;
  /** Email message ID from provider */
  messageId?: string;
  /** Provider that sent the email */
  provider?: string;
  /** Error message if failed */
  error?: string;
  /** Whether email was skipped (e.g., user opted out) */
  skipped?: boolean;
  /** The email type that was sent */
  emailType: IRecoveryEmailType;
  /** The checkout ID */
  checkoutId: string;
}

/**
 * Template configuration for each email type
 */
export interface IRecoveryEmailTemplateConfig {
  /** Template name for email provider */
  templateName: string;
  /** Email subject line */
  subject: string;
  /** CTA button text */
  ctaText: string;
  /** Email number (1, 2, or 3) */
  emailNumber: 1 | 2 | 3;
  /** Hours after abandonment to send */
  hoursAfterAbandonment: number;
}

/**
 * Configuration map for all recovery email types
 */
export const RECOVERY_EMAIL_CONFIGS: Record<IRecoveryEmailType, IRecoveryEmailTemplateConfig> = {
  '1hr': {
    templateName: 'abandoned-checkout-reminder',
    subject: 'Complete your purchase',
    ctaText: 'Complete Your Purchase',
    emailNumber: 1,
    hoursAfterAbandonment: 1,
  },
  '24hr': {
    templateName: 'abandoned-checkout-social-proof',
    subject: 'Your cart is waiting',
    ctaText: 'Complete Purchase',
    emailNumber: 2,
    hoursAfterAbandonment: 24,
  },
  '72hr': {
    templateName: 'abandoned-checkout-discount',
    subject: '10% off - complete now',
    ctaText: 'Claim 10% Off - Complete Now',
    emailNumber: 3,
    hoursAfterAbandonment: 72,
  },
} as const;

/**
 * Function type for sending recovery emails
 */
export type ISendRecoveryEmailFn = (
  emailType: IRecoveryEmailType,
  checkout: IAbandonedCheckout
) => Promise<IRecoveryEmailResult>;

/**
 * Function type for generating recovery URLs
 */
export type IGenerateRecoveryUrlFn = (checkoutId: string, baseUrl: string) => string;

/**
 * Function type for building email template data
 */
export type IBuildRecoveryEmailDataFn = (
  checkout: IAbandonedCheckout,
  emailType: IRecoveryEmailType,
  options?: {
    discountCode?: string;
    discountPercent?: number;
    discountExpiresAt?: string;
    socialProofStat?: string;
  }
) => IRecoveryEmailData;
