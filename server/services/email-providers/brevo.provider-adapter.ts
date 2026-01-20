/**
 * Brevo Provider Adapter
 *
 * Adapter for Brevo email provider with credit tracking and usage monitoring.
 * Brevo is our first fallback email provider with 300 free emails/day.
 *
 * NOTE: Uses direct REST API calls instead of @getbrevo/brevo SDK because
 * the SDK is not compatible with Cloudflare Workers edge runtime.
 * See: https://community.cloudflare.com/t/i-am-not-able-to-connect-to-brevo-apis-from-my-cloudflare-workers/694761
 */

import type { ReactElement } from 'react';
import { render } from '@react-email/render';
import { EmailProvider, ProviderTier } from '@shared/types/provider-adapter.types';
import type { IEmailProviderConfig } from '@shared/types/provider-adapter.types';
import { BaseEmailProviderAdapter } from './base-email-provider-adapter';
import { isTest, serverEnv } from '@shared/config/env';

/**
 * Brevo API response types
 */
interface IBrevoSendResponse {
  messageId?: string;
}

interface IBrevoErrorResponse {
  message?: string;
  code?: string;
}

/**
 * Brevo provider configuration
 * Free tier: 300 emails/day
 */
const BREVO_CONFIG: IEmailProviderConfig = {
  provider: EmailProvider.BREVO,
  tier: ProviderTier.HYBRID, // Free tier with paid overage
  priority: 1, // Primary provider - 300 free emails/day
  enabled: true,
  freeTier: {
    dailyRequests: 300, // 300 free emails/day
    monthlyCredits: 9000, // ~300/day * 30 days
    hardLimit: true,
    resetTimezone: 'UTC',
  },
  fallbackProvider: EmailProvider.RESEND, // Fall back to Resend if limits hit
};

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

/**
 * Adapter for Brevo email provider
 * Uses direct REST API calls for Cloudflare Workers compatibility
 */
export class BrevoProviderAdapter extends BaseEmailProviderAdapter {
  private apiKey: string;

  constructor() {
    super(BREVO_CONFIG);
    this.apiKey = serverEnv.BREVO_API_KEY || '';
    if (!this.apiKey) {
      console.warn('BREVO_API_KEY not configured, Brevo will not be available');
    }
  }

  /**
   * Send email using Brevo REST API (Edge-compatible)
   */
  protected async sendEmail(
    to: string,
    subject: string,
    reactElement: ReactElement
  ): Promise<{ messageId: string; [key: string]: unknown }> {
    if (!this.apiKey) {
      throw new Error('BREVO_API_KEY is not configured');
    }

    // Convert React element to HTML string using @react-email/render
    const html = await render(reactElement);

    const payload = {
      sender: { email: this.fromAddress, name: this.appName },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    };

    const response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => ({}))) as IBrevoErrorResponse;
      throw new Error(
        `Brevo API error (${response.status}): ${errorBody.message || response.statusText}`
      );
    }

    const result = (await response.json()) as IBrevoSendResponse;

    return {
      messageId: result.messageId || 'unknown',
      provider: 'brevo',
      response: result,
    };
  }

  /**
   * Check if Brevo is available (API key configured and within limits)
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
 * Factory function to create Brevo adapter
 */
export function createBrevoAdapter(): BrevoProviderAdapter {
  return new BrevoProviderAdapter();
}
