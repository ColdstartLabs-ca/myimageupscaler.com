/**
 * Brevo Provider Adapter
 *
 * Adapter for Brevo email provider with credit tracking and usage monitoring.
 * Brevo is the first resilience fallback after Cloudflare.
 *
 * NOTE: Uses direct REST API calls instead of @getbrevo/brevo SDK because
 * the SDK is not compatible with Cloudflare Workers edge runtime.
 * See: https://community.cloudflare.com/t/i-am-not-able-to-connect-to-brevo-apis-from-my-cloudflare-workers/694761
 */

import type { ReactElement } from 'react';
import { render } from '@react-email/render';
import { EmailProvider, ProviderTier } from '@shared/types/provider-adapter.types';
import type { IEmailProviderConfig } from '@shared/types/provider-adapter.types';
import { BaseEmailProviderAdapter, EmailProviderSendError } from './base-email-provider-adapter';
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
 * Brevo provider configuration.
 */
const BREVO_CONFIG: IEmailProviderConfig = {
  provider: EmailProvider.BREVO,
  tier: ProviderTier.HYBRID,
  priority: 2,
  enabled: true,
};

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

export function createBrevoSendError(
  status: number,
  body: IBrevoErrorResponse
): EmailProviderSendError {
  const code = String(body.code ?? '').toLowerCase();
  const detail = String(body.message ?? '').toLowerCase();
  const providerDetail = `${code} ${detail}`;
  if (status === 401 || status === 403) {
    return new EmailProviderSendError(
      'Brevo authentication failed',
      'provider_authentication',
      false,
      [],
      false
    );
  }
  if (status === 429) {
    return new EmailProviderSendError('Brevo rate limit reached', 'rate_limited', true, [], false);
  }
  if (status === 408 || status >= 500) {
    return new EmailProviderSendError(
      'Brevo is temporarily unavailable',
      status === 408 ? 'timeout' : 'provider_unavailable',
      true,
      [],
      false
    );
  }
  if (
    /invalid.*(recipient|email|address)|(?:recipient|email(?: address)?|to address).*invalid|hard.?bounce|permanent.?bounce/.test(
      providerDetail
    )
  ) {
    return new EmailProviderSendError(
      'Brevo rejected the recipient',
      'invalid_recipient',
      false,
      [],
      false
    );
  }
  if (
    status === 402 ||
    /not enough credit|account (?:is )?(?:disabled|suspended|not activated)|sender.*not configured|configuration_error/.test(
      providerDetail
    )
  ) {
    return new EmailProviderSendError(
      'Brevo account configuration failed',
      'provider_configuration',
      false,
      [],
      false
    );
  }
  return new EmailProviderSendError(
    'Brevo rejected the request',
    'provider_request',
    false,
    [],
    false
  );
}

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
      throw new EmailProviderSendError(
        'Brevo is not configured',
        'provider_configuration',
        false,
        [],
        false
      );
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
      throw createBrevoSendError(response.status, errorBody);
    }

    const result = (await response.json()) as IBrevoSendResponse;

    return {
      messageId: result.messageId || 'unknown',
      provider: 'brevo',
      response: result,
    };
  }

  /**
   * Check if Brevo is configured and available as a resilience fallback.
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

    return await this.creditTracker.isProviderAvailable(EmailProvider.BREVO);
  }
}

/**
 * Factory function to create Brevo adapter
 */
export function createBrevoAdapter(): BrevoProviderAdapter {
  return new BrevoProviderAdapter();
}
