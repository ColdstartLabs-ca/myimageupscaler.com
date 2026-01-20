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
      // Log error and rethrow
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.logEmail({
        to,
        template,
        status: 'failed',
        userId,
        type,
        response: { error: message },
      });
      console.error(`Email provider ${this.config.provider} error:`, error);
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
   * Check if provider is available (within free tier limits)
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
      'password-reset': 'Reset your password',
      'support-request': d =>
        `[SUPPORT] [${String(d.category || 'GENERAL').toUpperCase()}] ${d.subject || 'Support Request'}`,
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
