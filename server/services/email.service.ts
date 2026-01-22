import { getEmailProviderManager } from './email-providers/email-provider-manager';
import type { ISendEmailParams, ISendEmailResult } from '@shared/types/provider-adapter.types';
import type { IEmailService } from '../interfaces/IEmailService';

export type EmailType = 'transactional' | 'marketing';

// Re-export types for convenience
export type { ISendEmailParams, ISendEmailResult };

export class EmailError extends Error {
  public readonly code: string;

  constructor(message: string, code: string = 'EMAIL_ERROR') {
    super(message);
    this.name = 'EmailError';
    this.code = code;
  }
}

/**
 * Email service for sending transactional and marketing emails via provider manager.
 *
 * Provider priority:
 * 1. Brevo (primary) - 300 free emails/day
 * 2. Resend (fallback) - 3,000 free emails/month
 *
 * The service automatically handles:
 * - Provider selection and fallback
 * - Template loading and rendering
 * - Marketing email preference checking
 * - Development mode (logging instead of sending)
 * - Email logging to database
 */
export class EmailService implements IEmailService {
  /**
   * Send an email using the provider manager.
   * All template loading, preference checking, dev-mode handling, and logging
   * is done by the BaseEmailProviderAdapter.
   */
  async send(params: ISendEmailParams): Promise<ISendEmailResult> {
    try {
      const providerManager = getEmailProviderManager();
      return await providerManager.send(params);
    } catch (error) {
      // Re-throw EmailErrors directly without wrapping
      if (error instanceof EmailError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('Email send failed', { template: params.template, error: message });
      throw new EmailError(`Failed to send email: ${message}`, 'SEND_FAILED');
    }
  }
}

// Singleton instance
let emailServiceInstance: EmailService | null = null;

export function getEmailService(): EmailService {
  if (!emailServiceInstance) {
    emailServiceInstance = new EmailService();
  }
  return emailServiceInstance;
}
