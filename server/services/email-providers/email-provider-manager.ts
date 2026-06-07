/**
 * Email Provider Manager
 *
 * Manages multiple email providers with automatic provider selection
 * and fallback support when providers hit their free tier limits.
 *
 * Provider priority:
 * 1. Cloudflare Email Service (primary) - 3,000 included emails/month
 * 2. Brevo (fallback) - 9,000 free emails/month
 * 3. Resend (final fallback) - 3,000 free emails/month
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
import { createResendAdapter } from './resend.provider-adapter';

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
    this.registerProvider(createResendAdapter());
  }

  /**
   * Get best available email provider based on priority and availability
   */
  async getProvider(): Promise<IEmailProviderAdapter> {
    // Sort providers by priority (lower number = higher priority)
    const availableProviders = Array.from(this.providers.values())
      .filter(adapter => adapter.getConfig().enabled)
      .sort((a, b) => a.getConfig().priority - b.getConfig().priority);

    // Find first available provider
    for (const adapter of availableProviders) {
      const isAvailable = await adapter.isAvailable();
      if (isAvailable) {
        return adapter;
      }
    }

    throw new Error('No email providers available. All providers have hit their free tier limits.');
  }

  /**
   * Send email with automatic provider selection and fallback
   */
  async send(params: ISendEmailParams): Promise<ISendEmailResult> {
    let lastError: Error | null = null;

    // Try providers in priority order
    const sortedProviders = Array.from(this.providers.values())
      .filter(adapter => adapter.getConfig().enabled)
      .sort((a, b) => a.getConfig().priority - b.getConfig().priority);

    for (const adapter of sortedProviders) {
      try {
        const isAvailable = await adapter.isAvailable();
        if (!isAvailable) {
          continue;
        }

        const result = await adapter.send(params);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(
          `Email provider ${adapter.getProviderName()} failed, trying next provider:`,
          lastError.message
        );
        continue;
      }
    }

    throw new Error(
      `All email providers failed. Last error: ${lastError?.message || 'Unknown error'}`
    );
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
