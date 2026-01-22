import type { ISendEmailParams, ISendEmailResult } from '@shared/types/provider-adapter.types';

/**
 * Email service interface
 * Handles sending emails through the provider manager
 */
export interface IEmailService {
  /**
   * Send an email using the configured provider
   *
   * @param params - Email parameters including template, to, from, etc.
   * @returns Send result with success status and provider info
   */
  send(params: ISendEmailParams): Promise<ISendEmailResult>;
}
