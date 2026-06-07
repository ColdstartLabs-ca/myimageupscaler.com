/**
 * Email Providers
 *
 * Adapter pattern implementation for email providers with credit tracking
 * and automatic provider switching based on free tier limits.
 */

export { BaseEmailProviderAdapter, EmailError } from './base-email-provider-adapter';
export {
  CloudflareEmailProviderAdapter,
  createCloudflareEmailAdapter,
} from './cloudflare.provider-adapter';
export { BrevoProviderAdapter, createBrevoAdapter } from './brevo.provider-adapter';
export { ResendProviderAdapter, createResendAdapter } from './resend.provider-adapter';
export {
  EmailProviderManager,
  getEmailProviderManager,
  resetEmailProviderManager,
} from './email-provider-manager';
