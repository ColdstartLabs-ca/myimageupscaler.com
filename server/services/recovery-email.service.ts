/**
 * Recovery Email Service
 *
 * Handles sending the 3-email abandoned checkout recovery sequence:
 * - Email 1 (1hr): Friendly reminder
 * - Email 2 (24hr): Social proof
 * - Email 3 (72hr): Discount incentive with unique code
 *
 * @see docs/PRDs/checkout-recovery-system.md Phase 4
 */

import { serverEnv } from '@shared/config/env';
import {
  RECOVERY_EMAIL_CONFIGS,
  type IBuildRecoveryEmailDataFn,
  type IGenerateRecoveryUrlFn,
  type IRecoveryEmailData,
  type IRecoveryEmailResult,
  type IRecoveryEmailType,
  type ISendRecoveryEmailFn,
} from '@shared/types/recovery-email.types';
import type { IAbandonedCheckout } from '@shared/types/abandoned-checkout.types';
import { getEmailProviderManager } from './email-providers';
import { generateRecoveryPromoCode } from './recovery-discount.service';
import { trackServerEvent } from '@server/analytics';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import dayjs from 'dayjs';

const RECOVERY_EMAIL_CRON_INTERVAL_MINUTES = 15;

/**
 * Generate the recovery URL for an abandoned checkout.
 *
 * Creates a URL that, when clicked, restores the user's cart state
 * and applies any discount code if present.
 *
 * @param checkoutId - The abandoned checkout ID
 * @param baseUrl - The base URL of the application
 * @returns The full recovery URL
 *
 * @example
 * const url = generateRecoveryUrl('abc-123', 'https://myimageupscaler.com');
 * // Returns: 'https://myimageupscaler.com/checkout?recover=abc-123'
 */
export const generateRecoveryUrl: IGenerateRecoveryUrlFn = (
  checkoutId: string,
  baseUrl: string
): string => {
  const url = new URL('/checkout', baseUrl);
  url.searchParams.set('recover', checkoutId);
  return url.toString();
};

/**
 * Format price from cents to display string.
 *
 * @param cents - Price in cents
 * @param currency - Currency code (e.g., 'USD')
 * @returns Formatted price string (e.g., '$9.00')
 */
function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/**
 * Get display name for a plan or pack.
 *
 * @param checkout - The abandoned checkout
 * @returns Human-readable plan name
 */
function getPlanDisplayName(checkout: IAbandonedCheckout): string {
  const { planKey, packKey, purchaseType } = checkout;

  if (purchaseType === 'subscription' && planKey) {
    // Convert plan key to display name (e.g., 'pro' -> 'Pro Plan')
    const planNames: Record<string, string> = {
      hobby: 'Hobby Plan',
      pro: 'Pro Plan',
      business: 'Business Plan',
    };
    return planNames[planKey] || `${planKey.charAt(0).toUpperCase() + planKey.slice(1)} Plan`;
  }

  if (purchaseType === 'credit_pack' && packKey) {
    // Convert pack key to display name (e.g., 'starter' -> 'Starter Pack')
    const packNames: Record<string, string> = {
      starter: 'Starter Pack',
      pro: 'Pro Pack',
      enterprise: 'Enterprise Pack',
    };
    return packNames[packKey] || `${packKey.charAt(0).toUpperCase() + packKey.slice(1)} Pack`;
  }

  return 'Your Selection';
}

/**
 * Build the email template data for a recovery email.
 *
 * @param checkout - The abandoned checkout
 * @param emailType - The type of email (1hr, 24hr, 72hr)
 * @param options - Optional data for specific email types
 * @returns The email template data
 */
export const buildRecoveryEmailData: IBuildRecoveryEmailDataFn = (
  checkout: IAbandonedCheckout,
  emailType: IRecoveryEmailType,
  options?: {
    discountCode?: string;
    discountPercent?: number;
    discountExpiresAt?: string;
    socialProofStat?: string;
  }
): IRecoveryEmailData => {
  const config = RECOVERY_EMAIL_CONFIGS[emailType];
  const baseUrl = serverEnv.BASE_URL;
  const planName = getPlanDisplayName(checkout);
  const amountCents = checkout.cartData.originalAmountCents;
  const currency = checkout.cartData.currency || 'USD';

  return {
    checkoutId: checkout.id,
    email: checkout.email || '',
    planName,
    amountCents,
    currency,
    amountFormatted: formatPrice(amountCents, currency),
    recoveryUrl: generateRecoveryUrl(checkout.id, baseUrl),
    discountCode: options?.discountCode,
    discountPercent: options?.discountPercent,
    discountExpiresAt: options?.discountExpiresAt,
    socialProofStat: options?.socialProofStat,
    emailType,
    emailNumber: config.emailNumber,
    baseUrl,
    supportEmail: serverEnv.SUPPORT_EMAIL,
    appName: serverEnv.APP_NAME,
  };
};

/**
 * Get the template name for a recovery email type.
 *
 * @param emailType - The type of email
 * @returns The template name to use with the email provider
 */
export function getRecoveryEmailTemplate(emailType: IRecoveryEmailType): string {
  return RECOVERY_EMAIL_CONFIGS[emailType].templateName;
}

/**
 * Update the checkout record to mark an email as sent.
 *
 * @param checkoutId - The checkout ID
 * @param emailType - The email type that was sent
 */
async function markEmailSent(checkoutId: string, emailType: IRecoveryEmailType): Promise<void> {
  const { error } = await supabaseAdmin.rpc('mark_email_sent', {
    checkout_uuid: checkoutId,
    email_type: `email_${emailType}`,
  });

  if (error) {
    console.error(`Failed to mark email ${emailType} as sent for checkout ${checkoutId}:`, error);
    throw error;
  }
}

/**
 * Send a recovery email for an abandoned checkout.
 *
 * This is the main function for sending recovery emails. It:
 * 1. Generates a discount code for 72hr emails
 * 2. Builds the email template data
 * 3. Sends the email via the EmailProviderManager
 * 4. Tracks the analytics event
 * 5. Updates the checkout record
 *
 * @param emailType - The type of email to send
 * @param checkout - The abandoned checkout to send email for
 * @returns The result of the send operation
 *
 * @example
 * const result = await sendRecoveryEmail('1hr', checkout);
 * if (result.success) {
 *   console.log(`Email sent: ${result.messageId}`);
 * }
 */
export const sendRecoveryEmail: ISendRecoveryEmailFn = async (
  emailType: IRecoveryEmailType,
  checkout: IAbandonedCheckout
): Promise<IRecoveryEmailResult> => {
  const config = RECOVERY_EMAIL_CONFIGS[emailType];

  // Ensure we have an email address
  if (!checkout.email) {
    return {
      success: false,
      error: 'No email address available for checkout',
      emailType,
      checkoutId: checkout.id,
    };
  }

  try {
    // For 72hr email, generate a unique discount code
    let discountCode: string | undefined;
    let discountPercent: number | undefined;
    let discountExpiresAt: string | undefined;

    if (emailType === '72hr') {
      const discount = await generateRecoveryPromoCode(checkout.id, checkout.email);
      discountCode = discount.code;
      discountPercent = 10; // From RECOVERY_DISCOUNT_CONFIG
      discountExpiresAt = dayjs(discount.expiresAt).format('MMMM D, YYYY');

      // Update the checkout record with the discount code
      await supabaseAdmin
        .from('abandoned_checkouts')
        .update({
          recovery_discount_code: discountCode,
          recovery_discount_id: discount.promotionCodeId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', checkout.id);
    }

    // Build email template data
    const emailData = buildRecoveryEmailData(checkout, emailType, {
      discountCode,
      discountPercent,
      discountExpiresAt,
      // Social proof stat would be fetched from analytics in production
      socialProofStat:
        emailType === '24hr' ? 'Join 1,000+ users who upgraded this week' : undefined,
    });

    // Send email via provider manager
    const emailManager = getEmailProviderManager();
    const result = await emailManager.send({
      to: checkout.email,
      template: config.templateName,
      data: emailData,
      type: 'transactional',
      userId: checkout.userId,
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Failed to send email',
        emailType,
        checkoutId: checkout.id,
      };
    }

    // Track analytics event
    await trackServerEvent(
      'recovery_email_sent',
      {
        emailNumber: config.emailNumber,
        checkoutId: checkout.id,
        hasDiscount: emailType === '72hr',
        planKey: checkout.planKey,
        packKey: checkout.packKey,
        purchaseType: checkout.purchaseType,
      },
      { apiKey: serverEnv.AMPLITUDE_API_KEY, userId: checkout.userId }
    );

    // Mark email as sent in database
    await markEmailSent(checkout.id, emailType);

    return {
      success: true,
      messageId: result.messageId,
      provider: result.provider,
      emailType,
      checkoutId: checkout.id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to send recovery email ${emailType} for checkout ${checkout.id}:`, error);

    return {
      success: false,
      error: errorMessage,
      emailType,
      checkoutId: checkout.id,
    };
  }
};

/**
 * Send all recovery emails that are due.
 *
 * This function is intended to be called by a cron job.
 * It queries for checkouts that need emails sent based on their
 * creation time and email sending status.
 *
 * @param emailType - The type of emails to send
 * @returns Summary of sent and failed emails
 *
 * @example
 * const result = await sendDueRecoveryEmails('1hr');
 * console.log(`Sent: ${result.sent}, Failed: ${result.failed}`);
 */
export async function sendDueRecoveryEmails(
  emailType: IRecoveryEmailType,
  options: { dryRun?: boolean } = {}
): Promise<{ sent: number; failed: number; total: number }> {
  const config = RECOVERY_EMAIL_CONFIGS[emailType];
  const emailField = `email_${emailType}` as const;
  const { dryRun = false } = options;

  // The recovery cron runs every 15 minutes, so only process the slice that
  // just became due to avoid sending reminders early or reprocessing the same window.
  const newestEligibleAt = dayjs().subtract(config.hoursAfterAbandonment, 'hour').toISOString();
  const oldestEligibleAt = dayjs(newestEligibleAt)
    .subtract(RECOVERY_EMAIL_CRON_INTERVAL_MINUTES, 'minute')
    .toISOString();

  // Query for checkouts that:
  // 1. Have status 'pending'
  // 2. Were created in the right time window
  // 3. Haven't had this email sent yet
  const { data: checkouts, error } = await supabaseAdmin
    .from('abandoned_checkouts')
    .select('*')
    .eq('status', 'pending')
    .not('email', 'is', null)
    .neq('email', '')
    .gt('created_at', oldestEligibleAt)
    .lte('created_at', newestEligibleAt)
    .eq(`emails_sent->>${emailField}`, 'false');

  if (error) {
    console.error(`Failed to query checkouts for ${emailType} email:`, error);
    throw error;
  }

  if (!checkouts || checkouts.length === 0) {
    return { sent: 0, failed: 0, total: 0 };
  }

  if (dryRun) {
    return { sent: 0, failed: 0, total: checkouts.length };
  }

  let sent = 0;
  let failed = 0;

  // Send emails in parallel with a concurrency limit
  const concurrencyLimit = 5;
  const chunks: (typeof checkouts)[] = [];

  for (let i = 0; i < checkouts.length; i += concurrencyLimit) {
    chunks.push(checkouts.slice(i, i + concurrencyLimit));
  }

  for (const chunk of chunks) {
    const results = await Promise.all(
      chunk.map(async row => {
        // Transform database row to IAbandonedCheckout
        const checkout: IAbandonedCheckout = {
          id: row.id,
          userId: row.user_id ?? undefined,
          email: row.email ?? undefined,
          priceId: row.price_id,
          purchaseType: row.purchase_type,
          planKey: row.plan_key ?? undefined,
          packKey: row.pack_key ?? undefined,
          pricingRegion: row.pricing_region,
          discountPercent: row.discount_percent,
          cartData: row.cart_data,
          recoveryDiscountCode: row.recovery_discount_code ?? undefined,
          recoveryDiscountId: row.recovery_discount_id ?? undefined,
          emailsSent: row.emails_sent,
          status: row.status,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          recoveredAt: row.recovered_at ?? undefined,
          firstEmailSentAt: row.first_email_sent_at ?? undefined,
          secondEmailSentAt: row.second_email_sent_at ?? undefined,
          thirdEmailSentAt: row.third_email_sent_at ?? undefined,
        };

        return sendRecoveryEmail(emailType, checkout);
      })
    );

    for (const result of results) {
      if (result.success) {
        sent++;
      } else {
        failed++;
      }
    }
  }

  return { sent, failed, total: checkouts.length };
}

/**
 * Get a default social proof stat for the 24hr email.
 *
 * In production, this would fetch real data from analytics.
 * For now, returns a static message.
 *
 * @returns Social proof stat string
 */
export function getDefaultSocialProofStat(): string {
  return 'Join 1,000+ users who upgraded this week';
}
