/**
 * Resend Provider Adapter
 *
 * Adapter for Resend email provider with credit tracking and usage monitoring.
 * Resend is our last fallback email provider with 3,000 free emails/month (~100/day).
 */

import type { ReactElement } from 'react';
import { Resend } from 'resend';
import { EmailProvider, ProviderTier } from '@shared/types/provider-adapter.types';
import type { IEmailProviderConfig } from '@shared/types/provider-adapter.types';
import { BaseEmailProviderAdapter } from './base-email-provider-adapter';
import { isTest, serverEnv } from '@shared/config/env';

/**
 * Resend provider configuration
 * Free tier: 3,000 emails/month (~100/day)
 */
const RESEND_CONFIG: IEmailProviderConfig = {
  provider: EmailProvider.RESEND,
  tier: ProviderTier.HYBRID, // Free tier with paid overage
  priority: 3, // Last priority - use as final fallback
  enabled: true,
  freeTier: {
    dailyRequests: 100, // ~100/day
    monthlyCredits: 3000, // 3,000 free emails/month
    hardLimit: true,
    resetTimezone: 'UTC',
  },
  // No fallback - Resend is the last resort
};

/**
 * Adapter for Resend email provider
 */
export class ResendProviderAdapter extends BaseEmailProviderAdapter {
  private resend: Resend | null = null;
  private apiKey: string;

  constructor() {
    super(RESEND_CONFIG);
    this.apiKey = serverEnv.RESEND_API_KEY || '';
    if (!this.apiKey) {
      console.warn('RESEND_API_KEY not configured, Resend will not be available');
    } else {
      this.resend = new Resend(this.apiKey);
    }
  }

  /**
   * Send email using Resend API
   */
  protected async sendEmail(
    to: string,
    subject: string,
    reactElement: ReactElement
  ): Promise<{ messageId: string; [key: string]: unknown }> {
    if (!this.resend) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    const result = await this.resend.emails.send({
      from: this.fromAddress,
      to,
      subject,
      react: reactElement,
    });

    // Resend SDK can return error without throwing
    if (result.error) {
      throw new Error(`Resend error: ${result.error.message}`);
    }

    return {
      messageId: result.data?.id || 'unknown',
      provider: 'resend',
      response: result.data,
    };
  }

  /**
   * Check if Resend is available (API key configured and within limits)
   * In test mode, always return true to allow tests to work without API keys
   */
  override async isAvailable(): Promise<boolean> {
    // In test mode, always return true to skip actual API calls
    if (isTest()) {
      return true;
    }

    if (!this.apiKey || !this.config.enabled) {
      return false;
    }

    // Check if we're within free tier limits
    return await super.isAvailable();
  }
}

/**
 * Factory function to create Resend adapter
 */
export function createResendAdapter(): ResendProviderAdapter {
  return new ResendProviderAdapter();
}
