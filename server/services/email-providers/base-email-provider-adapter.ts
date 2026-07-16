/**
 * Base Email Provider Adapter
 *
 * Abstract base class for email provider adapters with credit tracking
 * and usage monitoring.
 */

import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { isDevelopment, isTest, serverEnv } from '@shared/config/env';
import type { ReactElement } from 'react';
import type {
  IEmailProviderAdapter,
  IEmailProviderConfig,
  IEmailProviderUsage,
  ISendEmailParams,
  ISendEmailResult,
} from '@shared/types/provider-adapter.types';
import { getProviderCreditTracker } from '../provider-credit-tracker.service';

/**
 * Email error class
 */
export class EmailError extends Error {
  public readonly code: string;

  constructor(message: string, code: string = 'EMAIL_ERROR') {
    super(message);
    this.name = 'EmailError';
    this.code = code;
  }
}

export type EmailProviderFailureClassification =
  | 'rate_limited'
  | 'timeout'
  | 'provider_unavailable'
  | 'provider_error'
  | 'invalid_recipient'
  | 'unsubscribed'
  | 'complaint'
  | 'provider_authentication'
  | 'provider_configuration'
  | 'provider_request'
  | 'permanent_rejection';

export type EmailProviderFailureScope = 'provider' | 'recipient';

export function getEmailProviderFailureScope(
  classification: EmailProviderFailureClassification
): EmailProviderFailureScope {
  return ['invalid_recipient', 'unsubscribed', 'complaint', 'permanent_rejection'].includes(
    classification
  )
    ? 'recipient'
    : 'provider';
}

/** A provider-neutral failure contract used to decide whether fallback is safe. */
export class EmailProviderSendError extends Error {
  constructor(
    message: string,
    public readonly classification: EmailProviderFailureClassification,
    public readonly transient: boolean,
    public readonly attemptedProviders: string[] = [],
    public readonly fallbackEligible: boolean = transient,
    public readonly unavailableProviders: string[] = [],
    public readonly fallbackReasons: string[] = [],
    public readonly scope: EmailProviderFailureScope = getEmailProviderFailureScope(classification)
  ) {
    super(message);
    this.name = 'EmailProviderSendError';
  }
}

export function normalizeEmailProviderError(error: unknown): EmailProviderSendError {
  if (error instanceof EmailProviderSendError) return error;

  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  if (/\b429\b|rate.?limit/.test(normalized)) {
    return new EmailProviderSendError(message, 'rate_limited', true);
  }
  if (/timeout|timed out|aborterror/.test(normalized)) {
    return new EmailProviderSendError(message, 'timeout', true);
  }
  if (/\b5\d\d\b|unavailable|not configured|network|fetch failed/.test(normalized)) {
    return new EmailProviderSendError(message, 'provider_unavailable', true);
  }
  if (/invalid (recipient|email)|permanent bounce/.test(normalized)) {
    return new EmailProviderSendError(message, 'invalid_recipient', false);
  }
  if (/unsubscribe/.test(normalized)) {
    return new EmailProviderSendError(message, 'unsubscribed', false);
  }
  if (/complaint/.test(normalized)) {
    return new EmailProviderSendError(message, 'complaint', false);
  }
  if (/\b401\b|\b403\b/.test(normalized)) {
    return new EmailProviderSendError(message, 'provider_authentication', false, [], true);
  }
  if (/\b402\b/.test(normalized)) {
    return new EmailProviderSendError(message, 'provider_configuration', false, [], true);
  }
  if (/\b400\b/.test(normalized)) {
    return new EmailProviderSendError(message, 'provider_request', false, [], true);
  }
  // Unknown rejection shapes are not safe fallback signals. Fail closed so an
  // unclassified provider/library failure cannot duplicate delivery elsewhere.
  return new EmailProviderSendError(message, 'provider_error', false, [], false);
}

/**
 * Abstract base class for email provider adapters
 */
export abstract class BaseEmailProviderAdapter implements IEmailProviderAdapter {
  protected config: IEmailProviderConfig;
  protected creditTracker = getProviderCreditTracker();
  protected fromAddress: string;
  protected baseUrl: string;
  protected supportEmail: string;
  protected appName: string;

  constructor(config: IEmailProviderConfig) {
    // Deep clone the config to avoid mutations affecting the original constant
    this.config = JSON.parse(JSON.stringify(config));
    this.fromAddress = serverEnv.EMAIL_FROM_ADDRESS;
    this.baseUrl = serverEnv.BASE_URL;
    this.supportEmail = serverEnv.SUPPORT_EMAIL;
    this.appName = serverEnv.APP_NAME;
  }

  /**
   * Send email with automatic credit tracking and error handling
   */
  async send(params: ISendEmailParams): Promise<ISendEmailResult> {
    const { to, template, data, type = 'transactional', userId } = params;

    // Skip actual email sending in development or test - log payload instead
    // Unless ALLOW_TRANSACTIONAL_EMAILS_IN_DEV is true (for testing real email flow)
    const allowDevEmails = serverEnv.ALLOW_TRANSACTIONAL_EMAILS_IN_DEV;
    const isTestMode = isTest() || (isDevelopment() && !allowDevEmails);

    try {
      // Check preferences for marketing emails
      if (type === 'marketing') {
        const shouldSkip = await this.checkShouldSkipMarketing(userId, to);
        if (shouldSkip) {
          await this.logEmail({ to, template, status: 'skipped', userId, type });
          return { success: true, skipped: true, provider: this.config.provider };
        }
      }

      // Get template component and subject
      const TemplateComponent = await this.getTemplate(template);
      const subject = this.getSubject(template, data);

      // Inject common environment values into template data
      const templateData = {
        baseUrl: this.baseUrl,
        supportEmail: this.supportEmail,
        appName: this.appName,
        ...data,
      };

      // Skip actual email sending in development or test - log payload instead
      if (isTestMode) {
        console.log(`[EMAIL_${isTest() ? 'TEST' : 'DEV'}_MODE] Email would be sent:`, {
          provider: this.config.provider,
          from: this.fromAddress,
          to,
          subject,
          template,
          type,
          userId,
          templateData,
        });

        await this.logEmail({
          to,
          template,
          status: 'sent',
          userId,
          type,
          response: {
            dev_mode: true,
            skipped: isTest() ? 'test environment' : 'development environment',
          },
        });

        return {
          success: true,
          messageId: `dev-${Date.now()}`,
          provider: this.config.provider,
        };
      }

      // Send email using provider-specific implementation
      const result = await this.sendEmail(to, subject, TemplateComponent(templateData));

      // Increment usage tracking (1 request, 1 credit)
      await this.creditTracker.incrementUsage(this.config.provider, 1, 1);

      // Log usage for monitoring
      this.creditTracker.logProviderUsage(this.config.provider);

      // Log email to database
      await this.logEmail({
        to,
        template,
        status: 'sent',
        userId,
        type,
        response: result,
      });

      return {
        success: true,
        messageId: result.messageId,
        provider: this.config.provider,
      };
    } catch (error) {
      const normalized = normalizeEmailProviderError(error);
      await this.logEmail({
        to,
        template,
        status: 'failed',
        userId,
        type,
        response: {
          classification: normalized.classification,
          scope: normalized.scope,
          transient: normalized.transient,
        },
      });
      console.error('Email provider attempt failed', {
        provider: this.config.provider,
        classification: normalized.classification,
        scope: normalized.scope,
        transient: normalized.transient,
      });
      throw error;
    }
  }

  /**
   * Get provider configuration
   */
  getConfig(): IEmailProviderConfig {
    return { ...this.config };
  }

  /**
   * Get current provider usage statistics
   */
  async getUsage(): Promise<IEmailProviderUsage> {
    return (await this.creditTracker.getProviderUsage(this.config.provider)) as IEmailProviderUsage;
  }

  /**
   * Check if the provider is configured and operationally available.
   * In test mode, always return true to allow tests to work without API keys
   */
  async isAvailable(): Promise<boolean> {
    // In test mode, always return true to skip actual API calls
    if (isTest()) {
      return true;
    }
    return await this.creditTracker.isProviderAvailable(this.config.provider);
  }

  /**
   * Reset daily/monthly counters
   */
  async resetCounters(period: 'daily' | 'monthly'): Promise<void> {
    if (period === 'daily') {
      await this.creditTracker.resetDailyCounters(this.config.provider);
    } else {
      await this.creditTracker.resetMonthlyCounters(this.config.provider);
    }
  }

  /**
   * Get provider name
   */
  getProviderName(): string {
    return this.config.provider;
  }

  /**
   * Abstract method: Send email using provider-specific implementation
   */
  protected abstract sendEmail(
    to: string,
    subject: string,
    reactElement: ReactElement
  ): Promise<{ messageId: string; [key: string]: unknown }>;

  /**
   * Get template component
   */
  protected async getTemplate(
    templateName: string
  ): Promise<(data: Record<string, unknown>) => ReactElement> {
    // Map template names to their export names
    const templateExportNames: Record<string, string> = {
      welcome: 'WelcomeEmail',
      'payment-success': 'PaymentSuccessEmail',
      'subscription-update': 'SubscriptionUpdateEmail',
      'low-credits': 'LowCreditsEmail',
      'password-reset': 'PasswordResetEmail',
      'support-request': 'SupportRequestEmail',
      'lifecycle-welcome': 'LifecycleWelcomeEmail',
      'feature-reminder': 'FeatureReminderEmail',
      'blog-education': 'BlogEducationEmail',
      'unused-credits': 'UnusedCreditsEmail',
      'finish-image': 'FinishImageEmail',
      'win-back': 'WinBackEmail',
      'checkout-recovery': 'CheckoutRecoveryEmail',
      'credit-wall-recovery': 'CreditWallRecoveryEmail',
      'auto-top-up-failure': 'AutoTopUpFailureEmail',
    };

    const exportName = templateExportNames[templateName];
    if (!exportName) {
      throw new EmailError(`Template "${templateName}" not found`, 'TEMPLATE_NOT_FOUND');
    }

    /* eslint-disable no-restricted-syntax -- Dynamic imports required for lazy loading email templates */
    // Dynamic import for templates
    const templates: Record<string, () => Promise<unknown>> = {
      welcome: () => import('@/emails/templates/WelcomeEmail'),
      'payment-success': () => import('@/emails/templates/PaymentSuccessEmail'),
      'subscription-update': () => import('@/emails/templates/SubscriptionUpdateEmail'),
      'low-credits': () => import('@/emails/templates/LowCreditsEmail'),
      'password-reset': () => import('@/emails/templates/PasswordResetEmail'),
      'support-request': () => import('@/emails/templates/SupportRequestEmail'),
      'lifecycle-welcome': () => import('@/emails/templates/LifecycleWelcomeEmail'),
      'feature-reminder': () => import('@/emails/templates/FeatureReminderEmail'),
      'blog-education': () => import('@/emails/templates/BlogEducationEmail'),
      'unused-credits': () => import('@/emails/templates/UnusedCreditsEmail'),
      'finish-image': () => import('@/emails/templates/FinishImageEmail'),
      'win-back': () => import('@/emails/templates/WinBackEmail'),
      'checkout-recovery': () => import('@/emails/templates/CheckoutRecoveryEmail'),
      'credit-wall-recovery': () => import('@/emails/templates/CreditWallRecoveryEmail'),
      'auto-top-up-failure': () => import('@/emails/templates/AutoTopUpFailureEmail'),
    };
    /* eslint-enable no-restricted-syntax */

    const loader = templates[templateName];
    if (!loader) {
      throw new EmailError(`Template "${templateName}" not found`, 'TEMPLATE_NOT_FOUND');
    }

    const module = await loader();
    // Use named export if available, otherwise fall back to default export
    const templateComponent =
      (module as Record<string, unknown>)[exportName] ||
      (module as Record<string, unknown>).default;
    return templateComponent as (data: Record<string, unknown>) => ReactElement;
  }

  /**
   * Get subject line for template
   */
  protected getSubject(template: string, data: Record<string, unknown>): string {
    const subjects: Record<string, string | ((data: Record<string, unknown>) => string)> = {
      welcome: `Welcome to ${this.appName}!`,
      'payment-success': d => `Payment confirmed - ${d.amount || 'Receipt'}`,
      'subscription-update': 'Your subscription has been updated',
      'low-credits': 'Running low on credits',
      'lifecycle-welcome': 'Your first 10 credits are ready',
      'feature-reminder': d => String(d.subject || d.headline || 'Try your next image workflow'),
      'blog-education': d => `Guide: ${d.articleTitle || 'Get better image results'}`,
      'unused-credits': 'You still have credits waiting',
      'finish-image': 'Finish this image',
      'win-back': 'Still need cleaner images?',
      'checkout-recovery': d =>
        d.recoveryAudience === 'upgrade_click_no_purchase'
          ? 'Unlock the feature you tried to use'
          : 'Your checkout is still waiting',
      'credit-wall-recovery': d =>
        d.recoveryAudience === 'high_usage_free_user'
          ? 'You are close to your free upscale limit'
          : 'Finish more images with more credits',
      'auto-top-up-failure': 'Your auto top-up needs attention',
      'password-reset': 'Reset your password',
      'support-request': d =>
        `[Support] [${String(d.category || 'GENERAL').toUpperCase()}] ${d.subject || 'Support Request'}`,
    };

    const subject = subjects[template];
    return typeof subject === 'function'
      ? subject(data)
      : subject || `${this.appName} Notification`;
  }

  /**
   * Check if should skip marketing emails based on preferences
   */
  protected async checkShouldSkipMarketing(userId?: string, email?: string): Promise<boolean> {
    // If we have a userId, check preferences directly
    if (userId) {
      const { data, error } = await supabaseAdmin
        .from('email_preferences')
        .select('marketing_emails')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        // Log error but default to allowing (fail-open for transactional integrity)
        console.error('Error checking email preferences by userId:', error);
      }

      return data?.marketing_emails === false;
    }

    // If no userId but we have email, look up user by email first
    if (email) {
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (profileError) {
        console.error('Error looking up user by email:', profileError);
        return false; // Fail-open for transactional integrity
      }

      if (profile?.id) {
        const { data, error } = await supabaseAdmin
          .from('email_preferences')
          .select('marketing_emails')
          .eq('user_id', profile.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Error checking email preferences by email lookup:', error);
        }

        return data?.marketing_emails === false;
      }
    }

    // No user found - allow email (new user or non-registered recipient)
    return false;
  }

  /**
   * Log email to database
   */
  protected async logEmail(params: {
    to: string;
    template: string;
    status: 'sent' | 'failed' | 'skipped';
    userId?: string;
    type: 'transactional' | 'marketing';
    response?: unknown;
  }): Promise<void> {
    try {
      await supabaseAdmin.from('email_logs').insert({
        user_id: params.userId || null,
        email_type: params.type,
        template_name: params.template,
        recipient_email: params.to,
        status: params.status,
        // Pass object directly - column is JSONB, Supabase client handles serialization
        provider_response: params.response ?? null,
      });
    } catch (error) {
      console.error('Failed to log email', { error });
    }
  }
}
