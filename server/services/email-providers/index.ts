/**
 * Email Providers
 *
 * Adapter pattern implementation for email providers with credit tracking
 * and failure-aware switching to resilience providers.
 */

export { BaseEmailProviderAdapter, EmailError } from './base-email-provider-adapter';
export {
  CloudflareEmailProviderAdapter,
  createCloudflareEmailAdapter,
} from './cloudflare.provider-adapter';
export { BrevoProviderAdapter, createBrevoAdapter } from './brevo.provider-adapter';
export {
  EmailProviderManager,
  getEmailProviderManager,
  resetEmailProviderManager,
} from './email-provider-manager';
