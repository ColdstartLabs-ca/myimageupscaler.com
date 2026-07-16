/**
 * Email Provider Manager
 *
 * Manages multiple email providers with automatic provider selection
 * and failure-aware fallback support.
 *
 * Provider priority:
 * 1. Cloudflare Email Service (paid primary)
 * 2. Brevo (resilience fallback)
 * Marketing email is sent by Brevo only. Cloudflare Email Service is reserved
 * for transactional email, with Brevo as its resilience fallback.
 */

import type {
  IEmailProviderAdapter,
  IEmailProviderConfig,
  IEmailProviderManager,
  ISendEmailParams,
  ISendEmailResult,
} from '@shared/types/provider-adapter.types';
import { EmailProvider } from '@shared/types/provider-adapter.types';
import { createCloudflareEmailAdapter } from './cloudflare.provider-adapter';
import { createBrevoAdapter } from './brevo.provider-adapter';
import {
  EmailError as EmailTemplateError,
  EmailProviderSendError,
  normalizeEmailProviderError,
} from './base-email-provider-adapter';

/**
 * Email provider manager with auto-switching
 */
export class EmailProviderManager implements IEmailProviderManager {
  private providers: Map<EmailProvider, IEmailProviderAdapter>;

  constructor() {
    this.providers = new Map();

    // Register default providers
    this.registerProvider(createCloudflareEmailAdapter());
    this.registerProvider(createBrevoAdapter());
  }

  /**
   * Get best available email provider based on priority and availability
   */
  async getProvider(context?: {
    userId?: string;
    type?: 'transactional' | 'marketing';
  }): Promise<IEmailProviderAdapter> {
    return this.getProviderForType(context?.type ?? 'transactional');
  }

  private getEligibleProviders(type: 'transactional' | 'marketing'): IEmailProviderAdapter[] {
    return Array.from(this.providers.values())
      .filter(adapter => adapter.getConfig().enabled)
      .filter(adapter => adapter.getProviderName() !== EmailProvider.RESEND)
      .filter(
        adapter => type !== 'marketing' || adapter.getProviderName() !== EmailProvider.CLOUDFLARE
      )
      .sort((a, b) => a.getConfig().priority - b.getConfig().priority);
  }

  private async getProviderForType(
    type: 'transactional' | 'marketing'
  ): Promise<IEmailProviderAdapter> {
    // Sort providers by priority (lower number = higher priority)
    const availableProviders = this.getEligibleProviders(type);

    // Find first available provider
    for (const adapter of availableProviders) {
      const isAvailable = await adapter.isAvailable();
      if (isAvailable) {
        return adapter;
      }
    }

    throw new EmailProviderSendError(
      'No configured email providers are currently available.',
      'provider_unavailable',
      true
    );
  }

  /**
   * Send email with automatic provider selection and fallback
   */
  async send(params: ISendEmailParams): Promise<ISendEmailResult> {
    let lastError: EmailProviderSendError | null = null;
    const attemptedProviders: string[] = [];
    const unavailableProviders: string[] = [];
    const fallbackReasons: string[] = [];

    // Try providers in priority order
    const sortedProviders = this.getEligibleProviders(params.type ?? 'transactional');

    for (const adapter of sortedProviders) {
      try {
        const isAvailable = await adapter.isAvailable();
        if (!isAvailable) {
          unavailableProviders.push(adapter.getProviderName());
          lastError = new EmailProviderSendError(
            `${adapter.getProviderName()} is unavailable`,
            'provider_unavailable',
            true
          );
          fallbackReasons.push('provider_unavailable');
          continue;
        }

        attemptedProviders.push(adapter.getProviderName());
        const result = await adapter.send(params);
        return {
          ...result,
          attemptedProviders,
          unavailableProviders,
          fallbackReasons,
        };
      } catch (error) {
        if (error instanceof EmailTemplateError) {
          throw error;
        }
        lastError = normalizeEmailProviderError(error);
        fallbackReasons.push(lastError.classification);
        console.warn('Email provider attempt failed', {
          provider: adapter.getProviderName(),
          classification: lastError.classification,
          transient: lastError.transient,
          attemptedProviders,
        });
        if (!lastError.transient && !lastError.fallbackEligible) {
          console.error('Email delivery terminated', {
            classification: lastError.classification,
            transient: false,
            attemptedProviders,
            unavailableProviders,
          });
          throw new EmailProviderSendError(
            lastError.message,
            lastError.classification,
            false,
            attemptedProviders,
            lastError.fallbackEligible,
            unavailableProviders,
            fallbackReasons,
            lastError.scope
          );
        }
        continue;
      }
    }

    const terminalError = new EmailProviderSendError(
      `All email providers failed. Last error: ${lastError?.message || 'Unknown error'}`,
      lastError?.classification ?? 'provider_unavailable',
      lastError?.transient ?? true,
      attemptedProviders,
      lastError?.fallbackEligible ?? true,
      unavailableProviders,
      fallbackReasons,
      lastError?.scope ?? 'provider'
    );
    console.error('Email delivery terminated', {
      classification: terminalError.classification,
      transient: terminalError.transient,
      attemptedProviders,
      unavailableProviders,
    });
    throw terminalError;
  }

  /**
   * Register a new email provider adapter
   */
  registerProvider(adapter: IEmailProviderAdapter): void {
    this.providers.set(adapter.getProviderName() as EmailProvider, adapter);
  }

  /**
   * Get all registered providers
   */
  getAllProviders(): IEmailProviderAdapter[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get provider by type
   */
  getProviderByType(provider: EmailProvider): IEmailProviderAdapter | undefined {
    return this.providers.get(provider);
  }

  /**
   * Update provider configuration
   */
  updateProviderConfig(provider: EmailProvider, config: Partial<IEmailProviderConfig>): void {
    const adapter = this.providers.get(provider);
    if (adapter) {
      // Access the internal config property directly to update it
      const adapterConfig = (adapter as unknown as { config: IEmailProviderConfig }).config;
      Object.assign(adapterConfig, config);
    }
  }

  /**
   * Get usage statistics for all providers
   */
  async getAllProvidersUsage(): Promise<
    Record<EmailProvider, Awaited<ReturnType<IEmailProviderAdapter['getUsage']>>>
  > {
    const providers = Array.from(this.providers.values());
    const usagePromises = providers.map(async adapter => ({
      provider: adapter.getProviderName() as EmailProvider,
      usage: await adapter.getUsage(),
    }));

    const results = await Promise.all(usagePromises);

    return results.reduce(
      (acc, { provider, usage }) => {
        acc[provider] = usage;
        return acc;
      },
      {} as Record<EmailProvider, Awaited<ReturnType<IEmailProviderAdapter['getUsage']>>>
    );
  }
}

// Singleton instance
let emailProviderManagerInstance: EmailProviderManager | null = null;

export function getEmailProviderManager(): EmailProviderManager {
  if (!emailProviderManagerInstance) {
    emailProviderManagerInstance = new EmailProviderManager();
  }
  return emailProviderManagerInstance;
}

export function resetEmailProviderManager(): void {
  emailProviderManagerInstance = null;
}
