import { APIRequestContext } from '@playwright/test';
import {
  StripeWebhookMockFactory,
  IWebhookTestOptions,
  IStripeEventMock,
} from './stripe-webhook-mocks';
import { ApiResponse } from './api-client';

export interface IWebhookClientOptions {
  endpoint?: string;
  signature?: string;
  enableSignatureVerification?: boolean;
}

/**
 * Webhook testing client for Stripe webhooks
 *
 * Provides a high-level interface for sending webhook events to the application
 * with proper signature handling and response validation. Abstracts away the complexity
 * of webhook event creation and signature generation.
 */
export class WebhookClient {
  private endpoint: string;
  private signature: string;
  private enableSignatureVerification: boolean;

  constructor(
    private request: APIRequestContext,
    options: IWebhookClientOptions = {}
  ) {
    this.endpoint = options.endpoint || '/api/webhooks/stripe';
    this.signature = options.signature || 'test-signature';
    this.enableSignatureVerification = options.enableSignatureVerification ?? false;
  }

  /**
   * Sends a checkout completed event for credit purchase
   *
   * @param options - Webhook test options including user ID and credit amount
   * @returns ApiResponse with fluent assertion methods
   */
  async sendCreditPurchase(options: IWebhookTestOptions): Promise<ApiResponse> {
    const event = StripeWebhookMockFactory.createCheckoutSessionCompletedForCredits(options);
    return this.send(event);
  }

  /**
   * Sends a checkout completed event for subscription purchase
   *
   * @param options - Webhook test options including user ID and subscription details
   * @returns ApiResponse with fluent assertion methods
   */
  async sendSubscriptionCheckout(options: IWebhookTestOptions): Promise<ApiResponse> {
    const event = StripeWebhookMockFactory.createCheckoutSessionCompletedForSubscription(options);
    return this.send(event);
  }

  /**
   * Sends a subscription created event
   *
   * @param options - Webhook test options including subscription details
   * @returns ApiResponse with fluent assertion methods
   */
  async sendSubscriptionCreated(options: IWebhookTestOptions): Promise<ApiResponse> {
    const event = StripeWebhookMockFactory.createSubscriptionCreated(options);
    return this.send(event);
  }

  /**
   * Sends a subscription updated event
   *
   * @param options - Webhook test options including new subscription status
   * @returns ApiResponse with fluent assertion methods
   */
  async sendSubscriptionUpdated(
    options: IWebhookTestOptions & { status?: string }
  ): Promise<ApiResponse> {
    const event = StripeWebhookMockFactory.createSubscriptionUpdated(options);
    return this.send(event);
  }

  /**
   * Sends a subscription deleted event
   *
   * @param options - Webhook test options for subscription cancellation
   * @returns ApiResponse with fluent assertion methods
   */
  async sendSubscriptionDeleted(options: IWebhookTestOptions): Promise<ApiResponse> {
    const event = StripeWebhookMockFactory.createSubscriptionDeleted(options);
    return this.send(event);
  }

  /**
   * Sends a subscription cancelled event (alias for deleted)
   *
   * @param options - Webhook test options including user ID and subscription ID
   * @returns ApiResponse with fluent assertion methods
   */
  async sendSubscriptionCancelled(options: IWebhookTestOptions): Promise<ApiResponse> {
    const event = StripeWebhookMockFactory.createSubscriptionDeleted(options);
    return this.send(event);
  }

  /**
   * Sends an invoice payment succeeded event
   *
   * @param options - Webhook test options for successful payment
   * @returns ApiResponse with fluent assertion methods
   */
  async sendInvoicePaymentSucceeded(options: IWebhookTestOptions): Promise<ApiResponse> {
    const event = StripeWebhookMockFactory.createInvoicePaymentSucceeded(options);
    return this.send(event);
  }

  /**
   * Sends an invoice payment failed event
   *
   * @param options - Webhook test options for failed payment
   * @returns ApiResponse with fluent assertion methods
   */
  async sendInvoicePaymentFailed(options: IWebhookTestOptions): Promise<ApiResponse> {
    const event = StripeWebhookMockFactory.createInvoicePaymentFailed(options);
    return this.send(event);
  }

  /**
   * Sends a custom webhook event with specified type and data
   *
   * @param eventType - Stripe event type (e.g., 'customer.subscription.updated')
   * @param data - Event data object
   * @param options - Additional event metadata
   * @returns ApiResponse with fluent assertion methods
   */
  async sendCustomEvent(
    eventType: string,
    data: Record<string, unknown>,
    options: {
      eventId?: string;
      userId?: string;
      metadata?: Record<string, string>;
    } = {}
  ): Promise<ApiResponse> {
    const event: IStripeEventMock = {
      id: options.eventId || `evt_test_${Date.now()}`,
      object: 'event',
      api_version: '2023-10-16',
      created: Math.floor(Date.now() / 1000),
      data: { object: data },
      livemode: false,
      pending_webhooks: 1,
      request: null,
      type: eventType,
    };

    // Add metadata if provided
    if (options.metadata && event.data.object) {
      (event.data.object as Record<string, unknown>).metadata = options.metadata;
    }

    return this.send(event);
  }

  /**
   * Sends a raw event without using the mock factory
   *
   * @param event - Raw webhook event object
   * @param signature - Optional custom signature
   * @returns ApiResponse with fluent assertion methods
   */
  async sendRawEvent(event: unknown, signature?: string): Promise<ApiResponse> {
    return this.send(event, signature);
  }

  /**
   * Sends a raw webhook event with optional signature
   *
   * @param event - Complete Stripe webhook event object
   * @param signature - Optional custom signature (uses default if not provided). Pass null to omit header.
   * @returns ApiResponse with fluent assertion methods
   */
  async send(event: unknown, signature?: string | null): Promise<ApiResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add signature header if verification is enabled
    if (this.enableSignatureVerification) {
      const webhookSignature = signature || this.generateSignature(event);
      headers['Stripe-Signature'] = webhookSignature;
    } else {
      // In test mode, handle signature based on what's passed
      if (signature === null) {
        // Explicitly omit the signature header
        // Do nothing - don't add the Stripe-Signature header at all
      } else if (signature === undefined) {
        // Use default test signature
        headers['Stripe-Signature'] = this.signature;
      } else {
        // Use the provided signature (even if empty string)
        headers['Stripe-Signature'] = signature;
      }
    }

    const response = await this.request.post(this.endpoint, {
      headers,
      data: event,
    });

    return new ApiResponse(response);
  }

  /**
   * Sends multiple webhook events in sequence
   *
   * @param events - Array of webhook events or event creators
   * @param delayMs - Optional delay between events in milliseconds
   * @returns Array of ApiResponse objects
   */
  async sendBatch(
    events: Array<{
      type:
        | 'credit_purchase'
        | 'subscription_checkout'
        | 'subscription_created'
        | 'subscription_updated'
        | 'subscription_deleted'
        | 'invoice_payment_succeeded'
        | 'invoice_payment_failed'
        | 'custom';
      options: IWebhookTestOptions & {
        status?: string;
        eventType?: string;
        data?: Record<string, unknown>;
      };
    }>,
    delayMs: number = 100
  ): Promise<ApiResponse[]> {
    const responses: ApiResponse[] = [];

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      let response: ApiResponse;

      switch (event.type) {
        case 'credit_purchase':
          response = await this.sendCreditPurchase(event.options);
          break;
        case 'subscription_checkout':
          response = await this.sendSubscriptionCheckout(event.options);
          break;
        case 'subscription_created':
          response = await this.sendSubscriptionCreated(event.options);
          break;
        case 'subscription_updated':
          response = await this.sendSubscriptionUpdated(event.options);
          break;
        case 'subscription_deleted':
          response = await this.sendSubscriptionDeleted(event.options);
          break;
        case 'invoice_payment_succeeded':
          response = await this.sendInvoicePaymentSucceeded(event.options);
          break;
        case 'invoice_payment_failed':
          response = await this.sendInvoicePaymentFailed(event.options);
          break;
        case 'custom':
          response = await this.sendCustomEvent(
            event.options.eventType || 'test.event',
            event.options.data || {},
            event.options
          );
          break;
        default:
          throw new Error(`Unknown event type: ${event.type}`);
      }

      responses.push(response);

      // Add delay between events if requested and not the last event
      if (delayMs > 0 && i < events.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    return responses;
  }

  /**
   * Creates a webhook client with signature verification enabled
   *
   * @param request - APIRequestContext instance
   * @param webhookSecret - Stripe webhook secret for signature generation
   * @param options - Additional client options
   * @returns WebhookClient with signature verification
   */
  static withSignatureVerification(
    request: APIRequestContext,
    webhookSecret: string,
    options: Omit<IWebhookClientOptions, 'enableSignatureVerification'> = {}
  ): WebhookClient {
    return new WebhookClient(request, {
      ...options,
      enableSignatureVerification: true,
      signature: '', // Will be generated per request
    });
  }

  /**
   * Generates a Stripe webhook signature for the given payload
   *
   * @param payload - Webhook event payload
   * @param secret - Webhook secret (optional for test mode)
   * @returns Generated signature string
   */
  private generateSignature(payload: unknown, secret?: string): string {
    const payloadString = JSON.stringify(payload);

    if (process.env.ENV === 'test' || !this.enableSignatureVerification) {
      // In test mode, return a simple test signature
      return `t=${Date.now()},v1=test_signature_${Date.now()}`;
    }

    // In non-test mode with verification enabled, would need actual HMAC-SHA256 implementation
    // For now, return mock signature - real implementation would require crypto module
    return StripeWebhookMockFactory.createMockSignature(payloadString, secret || 'whsec_test');
  }

  /**
   * Sets a custom endpoint for webhook requests
   *
   * @param endpoint - New webhook endpoint path
   */
  setEndpoint(endpoint: string): void {
    this.endpoint = endpoint;
  }

  /**
   * Enables or disables signature verification
   *
   * @param enabled - Whether to enable signature verification
   */
  setSignatureVerification(enabled: boolean): void {
    this.enableSignatureVerification = enabled;
  }
}
