/**
 * Cloudflare Email Provider Adapter
 *
 * Adapter for Cloudflare Email Service using the REST API. React Email
 * templates are rendered in the shared base adapter before delivery.
 */

import type { ReactElement } from 'react';
import { render } from '@react-email/render';
import { EmailProvider, ProviderTier } from '@shared/types/provider-adapter.types';
import type { IEmailProviderConfig } from '@shared/types/provider-adapter.types';
import { isTest, serverEnv } from '@shared/config/env';
import { BaseEmailProviderAdapter } from './base-email-provider-adapter';

interface ICloudflareEmailResponse {
  success?: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  messages?: unknown[];
  result?: {
    delivered?: string[];
    permanent_bounces?: string[];
    queued?: string[];
  } | null;
}

const CLOUDFLARE_CONFIG: IEmailProviderConfig = {
  provider: EmailProvider.CLOUDFLARE,
  tier: ProviderTier.HYBRID,
  priority: 1,
  enabled: true,
  freeTier: {
    dailyRequests: 0,
    monthlyCredits: 3000,
    hardLimit: true,
    resetTimezone: 'UTC',
  },
  fallbackProvider: EmailProvider.BREVO,
};

export class CloudflareEmailProviderAdapter extends BaseEmailProviderAdapter {
  private readonly apiToken: string;
  private readonly accountId: string;

  constructor() {
    super(CLOUDFLARE_CONFIG);
    this.apiToken = serverEnv.CLOUDFLARE_EMAIL_API_TOKEN || '';
    this.accountId = serverEnv.CLOUDFLARE_ACCOUNT_ID || '';

    if (!this.apiToken || !this.accountId) {
      console.warn(
        'CLOUDFLARE_EMAIL_API_TOKEN or CLOUDFLARE_ACCOUNT_ID not configured, Cloudflare Email Service will not be available'
      );
    }
  }

  protected async sendEmail(
    to: string,
    subject: string,
    reactElement: ReactElement
  ): Promise<{ messageId: string; [key: string]: unknown }> {
    if (!this.apiToken) {
      throw new Error('CLOUDFLARE_EMAIL_API_TOKEN is not configured');
    }

    if (!this.accountId) {
      throw new Error('CLOUDFLARE_ACCOUNT_ID is not configured');
    }

    const html = await render(reactElement);
    const text = await render(reactElement, { plainText: true });
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/email/sending/send`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to,
        from: { address: this.fromAddress, name: this.appName },
        subject,
        html,
        text,
      }),
    });

    const result = (await response.json().catch(() => ({}))) as ICloudflareEmailResponse;
    const errorMessage = this.getErrorMessage(result);

    if (!response.ok || result.success === false || errorMessage) {
      throw new Error(
        `Cloudflare Email Service API error (${response.status}): ${
          errorMessage || response.statusText
        }`
      );
    }

    if (result.result?.permanent_bounces?.length) {
      throw new Error(
        `Cloudflare Email Service permanent bounce: ${result.result.permanent_bounces.join(', ')}`
      );
    }

    return {
      messageId: this.getMessageId(result, to),
      provider: EmailProvider.CLOUDFLARE,
      response: result,
    };
  }

  override async isAvailable(): Promise<boolean> {
    if (isTest()) {
      return true;
    }

    if (!this.apiToken || !this.accountId || !this.config.enabled) {
      return false;
    }

    return await super.isAvailable();
  }

  private getErrorMessage(result: ICloudflareEmailResponse): string | null {
    const firstError = result.errors?.[0];
    if (!firstError) {
      return null;
    }

    return [firstError.code, firstError.message].filter(Boolean).join(' ') || 'Unknown error';
  }

  private getMessageId(result: ICloudflareEmailResponse, to: string): string {
    const delivered = result.result?.delivered ?? [];
    const queued = result.result?.queued ?? [];
    const recipientStatus = delivered.includes(to)
      ? 'delivered'
      : queued.includes(to)
        ? 'queued'
        : 'accepted';

    return `cloudflare-${recipientStatus}-${to}`;
  }
}

export function createCloudflareEmailAdapter(): CloudflareEmailProviderAdapter {
  return new CloudflareEmailProviderAdapter();
}
