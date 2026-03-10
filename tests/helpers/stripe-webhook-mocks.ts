/**
 * Mock Stripe webhook payloads for testing billing flows
 * These simulate the actual webhook events that Stripe would send
 */

export interface IStripeEventMock {
  id: string;
  object: 'event';
  api_version: string;
  created: number;
  data: {
    object: Record<string, unknown>;
  };
  livemode: boolean;
  pending_webhooks: number;
  request: string | null;
  type: string;
}

export interface IWebhookTestOptions {
  userId: string;
  customerId?: string;
  sessionId?: string;
  subscriptionId?: string;
  priceId?: string;
  creditsAmount?: number;
}

/**
 * Factory for creating mock Stripe webhook events
 */
export class StripeWebhookMockFactory {
  /**
   * Create a mock checkout.session.completed event for credit purchase
   */
  static createCheckoutSessionCompletedForCredits(options: IWebhookTestOptions): IStripeEventMock {
    const {
      userId,
      customerId = `cus_test_${userId}`,
      sessionId = `cs_test_${userId}`,
      creditsAmount = 50,
    } = options;

    return {
      id: `evt_test_${Date.now()}`,
      object: 'event',
      api_version: '2023-10-16',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: sessionId,
          object: 'checkout.session',
          after_expiration: null,
          allow_promotion_codes: null,
          amount_subtotal: creditsAmount * 100, // $0.50 per credit
          amount_total: creditsAmount * 100,
          automatic_tax: {
            enabled: false,
            liability: null,
            status: null,
          },
          billing_address_collection: null,
          cancel_url: 'https://example.com/canceled',
          client_reference_id: null,
          collection_method: 'charge_automatically',
          created: Math.floor(Date.now() / 1000),
          currency: 'usd',
          customer: customerId,
          customer_creation: 'if_required',
          customer_details: {
            address: null,
            email: `test-${userId}@example.com`,
            name: 'Test User',
            phone: null,
            tax_exempt: 'none',
            tax_ids: [],
          },
          customer_email: null,
          expires_at: Math.floor(Date.now() / 1000) + 1800,
          invoice: null,
          invoice_creation: null,
          livemode: false,
          locale: null,
          metadata: {
            user_id: userId,
            credits_amount: creditsAmount.toString(),
          },
          mode: 'payment',
          payment_intent: `pi_test_${Date.now()}`,
          payment_link: null,
          payment_method_collection: 'if_required',
          payment_method_options: {},
          payment_method_types: ['card'],
          payment_status: 'paid',
          paused: null,
          recovered_from: null,
          setup_intent: null,
          shipping_address_collection: null,
          shipping_cost: null,
          shipping_details: null,
          shipping_options: [],
          status: 'complete',
          submit_type: null,
          subscription: null,
          success_url: 'https://example.com/success',
          total_details: {
            amount_discount: 0,
            amount_shipping: 0,
            amount_tax: 0,
          },
          url: null,
        },
      },
      livemode: false,
      pending_webhooks: 1,
      request: null,
      type: 'checkout.session.completed',
    };
  }

  /**
   * Create a mock checkout.session.completed event for subscription
   */
  static createCheckoutSessionCompletedForSubscription(
    options: IWebhookTestOptions
  ): IStripeEventMock {
    const {
      userId,
      customerId = `cus_test_${userId}`,
      sessionId = `cs_test_${userId}`,
      subscriptionId = `sub_test_${userId}`,
    } = options;

    return {
      id: `evt_test_${Date.now()}`,
      object: 'event',
      api_version: '2023-10-16',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: sessionId,
          object: 'checkout.session',
          after_expiration: null,
          allow_promotion_codes: null,
          amount_subtotal: 2900, // $29.00
          amount_total: 2900,
          automatic_tax: {
            enabled: false,
            liability: null,
            status: null,
          },
          billing_address_collection: null,
          cancel_url: 'https://example.com/canceled',
          client_reference_id: null,
          collection_method: 'charge_automatically',
          created: Math.floor(Date.now() / 1000),
          currency: 'usd',
          customer: customerId,
          customer_creation: 'if_required',
          customer_details: {
            address: null,
            email: `test-${userId}@example.com`,
            name: 'Test User',
            phone: null,
            tax_exempt: 'none',
            tax_ids: [],
          },
          customer_email: null,
          expires_at: Math.floor(Date.now() / 1000) + 1800,
          invoice: `in_test_${Date.now()}`,
          invoice_creation: null,
          livemode: false,
          locale: null,
          metadata: {
            user_id: userId,
          },
          mode: 'subscription',
          payment_intent: null,
          payment_link: null,
          payment_method_collection: 'if_required',
          payment_method_options: {},
          payment_method_types: ['card'],
          payment_status: 'paid',
          paused: null,
          recovered_from: null,
          setup_intent: null,
          shipping_address_collection: null,
          shipping_cost: null,
          shipping_details: null,
          shipping_options: [],
          status: 'complete',
          submit_type: null,
          subscription: subscriptionId,
          success_url: 'https://example.com/success',
          total_details: {
            amount_discount: 0,
            amount_shipping: 0,
            amount_tax: 0,
          },
          url: null,
        },
      },
      livemode: false,
      pending_webhooks: 1,
      request: null,
      type: 'checkout.session.completed',
    };
  }

  /**
   * Create a mock customer.subscription.created event
   */
  static createSubscriptionCreated(options: IWebhookTestOptions): IStripeEventMock {
    const {
      userId,
      customerId = `cus_test_${userId}`,
      subscriptionId = `sub_test_${userId}`,
      priceId = 'price_test_pro_monthly',
    } = options;

    return {
      id: `evt_test_${Date.now()}`,
      object: 'event',
      api_version: '2023-10-16',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: subscriptionId,
          object: 'subscription',
          application: null,
          application_fee_percent: null,
          automatic_tax: {
            enabled: false,
            liability: null,
            status: null,
          },
          billing_cycle_anchor: Math.floor(Date.now() / 1000),
          billing_thresholds: null,
          cancel_at: null,
          cancel_at_period_end: false,
          canceled_at: null,
          collection_method: 'charge_automatically',
          created: Math.floor(Date.now() / 1000),
          currency: 'usd',
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days from now
          current_period_start: Math.floor(Date.now() / 1000),
          customer: customerId,
          days_until_due: null,
          default_payment_method: null,
          default_source: null,
          default_tax_rates: [],
          description: null,
          discount: null,
          ended_at: null,
          items: {
            object: 'list',
            data: [
              {
                id: `si_test_${Date.now()}`,
                object: 'subscription_item',
                billing_thresholds: null,
                created: Math.floor(Date.now() / 1000),
                discount: null,
                metadata: {},
                plan: {
                  id: priceId,
                  object: 'plan',
                  active: true,
                  aggregate_usage: null,
                  amount: 2900,
                  amount_decimal: '2900',
                  billing_scheme: 'per_unit',
                  created: Math.floor(Date.now() / 1000),
                  currency: 'usd',
                  interval: 'month',
                  interval_count: 1,
                  livemode: false,
                  metadata: {},
                  nickname: 'Pro Plan Monthly',
                  product: 'prod_test_pro',
                  tiers: null,
                  tiers_mode: null,
                  transform_usage: null,
                  trial_period_days: null,
                  usage_type: 'licensed',
                },
                price: {
                  id: priceId,
                  object: 'price',
                  active: true,
                  billing_scheme: 'per_unit',
                  created: Math.floor(Date.now() / 1000),
                  currency: 'usd',
                  custom_unit_amount: null,
                  lookup_key: null,
                  metadata: {},
                  nickname: 'Pro Plan Monthly',
                  product: 'prod_test_pro',
                  recurring: {
                    aggregate_usage: null,
                    interval: 'month',
                    interval_count: 1,
                    trial_period_days: null,
                    usage_type: 'licensed',
                  },
                  tax_behavior: 'unspecified',
                  tiers: null,
                  tiers_mode: null,
                  transform_quantity: null,
                  type: 'recurring',
                  unit_amount: 2900,
                  unit_amount_decimal: '2900',
                },
                quantity: 1,
                subscription: subscriptionId,
                tax_rates: [],
              },
            ],
            has_more: false,
            total_count: 1,
            url: `/v1/subscription_items?subscription=${subscriptionId}`,
          },
          latest_invoice: `in_test_${Date.now()}`,
          livemode: false,
          metadata: {
            user_id: userId,
          },
          next_pending_invoice_item_invoice: null,
          pause_collection: null,
          payment_settings: {
            payment_method_options: {},
            payment_method_types: ['card'],
            save_default_payment_method: 'off',
          },
          pending_invoice_item_interval: null,
          pending_setup_intent: null,
          pending_update: null,
          plan: null,
          quantity: 1,
          schedule: null,
          start_date: Math.floor(Date.now() / 1000),
          status: 'active',
          test_clock: null,
          transfer_data: null,
          trial_end: null,
          trial_settings: {
            end_behavior: {
              missing_payment_method: 'create_invoice',
            },
          },
          trial_start: null,
        },
      },
      livemode: false,
      pending_webhooks: 1,
      request: null,
      type: 'customer.subscription.created',
    };
  }

  /**
   * Create a mock customer.subscription.updated event
   */
  static createSubscriptionUpdated(
    options: IWebhookTestOptions & { status?: string }
  ): IStripeEventMock {
    const {
      userId,
      customerId = `cus_test_${userId}`,
      subscriptionId = `sub_test_${userId}`,
      priceId = 'price_test_pro_monthly',
      status = 'active',
    } = options;

    const baseEvent = this.createSubscriptionCreated({
      userId,
      customerId,
      subscriptionId,
      priceId,
    });
    baseEvent.type = 'customer.subscription.updated';
    baseEvent.data.object.status = status;

    return baseEvent;
  }

  /**
   * Create a mock customer.subscription.deleted event
   */
  static createSubscriptionDeleted(options: IWebhookTestOptions): IStripeEventMock {
    const {
      userId,
      customerId = `cus_test_${userId}`,
      subscriptionId = `sub_test_${userId}`,
      priceId = 'price_test_pro_monthly',
    } = options;

    const baseEvent = this.createSubscriptionCreated({
      userId,
      customerId,
      subscriptionId,
      priceId,
    });
    baseEvent.type = 'customer.subscription.deleted';
    baseEvent.data.object.status = 'canceled';
    baseEvent.data.object.canceled_at = Math.floor(Date.now() / 1000);
    baseEvent.data.object.ended_at = Math.floor(Date.now() / 1000);

    return baseEvent;
  }

  /**
   * Create a mock invoice.payment_succeeded event
   */
  static createInvoicePaymentSucceeded(options: IWebhookTestOptions): IStripeEventMock {
    const {
      userId,
      customerId = `cus_test_${userId}`,
      subscriptionId = `sub_test_${userId}`,
    } = options;

    return {
      id: `evt_test_${Date.now()}`,
      object: 'event',
      api_version: '2023-10-16',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: `in_test_${Date.now()}`,
          object: 'invoice',
          account_country: 'US',
          account_name: 'Test Account',
          accounting_category: 'service',
          address: null,
          amount_due: 2900,
          amount_paid: 2900,
          amount_remaining: 0,
          amount_shipping: 0,
          application: null,
          application_fee_amount: null,
          attempt_count: 1,
          attempted: true,
          auto_advance: true,
          automatic_tax: {
            enabled: false,
            liability: null,
            status: null,
          },
          billing_reason: 'subscription_cycle',
          charge: `ch_test_${Date.now()}`,
          collection_method: 'charge_automatically',
          created: Math.floor(Date.now() / 1000),
          currency: 'usd',
          custom_fields: null,
          customer: customerId,
          customer_address: null,
          customer_email: `test-${userId}@example.com`,
          customer_name: 'Test User',
          customer_phone: null,
          customer_shipping: null,
          customer_tax_exempt: 'none',
          customer_tax_ids: [],
          default_payment_method: null,
          default_source: null,
          default_tax_rates: [],
          description: null,
          discount: null,
          discounts: [],
          due_date: null,
          ending_balance: 0,
          footer: null,
          hosted_invoice_url: `https://invoice.stripe.com/inv/test/${Date.now()}`,
          invoice_pdf: `https://pay.stripe.com/invoice/acct/test/invoices/pdf/${Date.now()}`,
          issuer: {
            type: 'self',
          },
          last_finalization_error: null,
          lines: {
            object: 'list',
            data: [
              {
                id: `il_test_${Date.now()}`,
                object: 'line_item',
                amount: 2900,
                amount_excluding_tax: 2900,
                currency: 'usd',
                description: 'Pro Plan Monthly',
                discount_amounts: [],
                discountable: true,
                discounts: [],
                invoice_item: `ii_test_${Date.now()}`,
                livemode: false,
                metadata: {},
                period: {
                  end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
                  start: Math.floor(Date.now() / 1000),
                },
                plan: {
                  id: 'price_test_pro_monthly',
                  object: 'plan',
                  active: true,
                  aggregate_usage: null,
                  amount: 2900,
                  amount_decimal: '2900',
                  billing_scheme: 'per_unit',
                  created: Math.floor(Date.now() / 1000),
                  currency: 'usd',
                  interval: 'month',
                  interval_count: 1,
                  livemode: false,
                  metadata: {},
                  nickname: 'Pro Plan Monthly',
                  product: 'prod_test_pro',
                  tiers: null,
                  tiers_mode: null,
                  transform_usage: null,
                  trial_period_days: null,
                  usage_type: 'licensed',
                },
                price: {
                  id: 'price_test_pro_monthly',
                  object: 'price',
                  active: true,
                  billing_scheme: 'per_unit',
                  created: Math.floor(Date.now() / 1000),
                  currency: 'usd',
                  custom_unit_amount: null,
                  lookup_key: null,
                  metadata: {},
                  nickname: 'Pro Plan Monthly',
                  product: 'prod_test_pro',
                  recurring: {
                    aggregate_usage: null,
                    interval: 'month',
                    interval_count: 1,
                    trial_period_days: null,
                    usage_type: 'licensed',
                  },
                  tax_behavior: 'unspecified',
                  tiers: null,
                  tiers_mode: null,
                  transform_quantity: null,
                  type: 'recurring',
                  unit_amount: 2900,
                  unit_amount_decimal: '2900',
                },
                proration: false,
                quantity: 1,
                subscription: subscriptionId,
                subscription_item: `si_test_${Date.now()}`,
                tax_amounts: [],
                tax_rates: [],
                type: 'subscription',
              },
            ],
            has_more: false,
            total_count: 1,
            url: `/v1/invoices/${Date.now()}/lines`,
          },
          livemode: false,
          metadata: {
            user_id: userId,
          },
          next_payment_attempt: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
          number: `INV-${Date.now().toString().slice(-6)}`,
          on_behalf_of: null,
          paid: true,
          paid_out_of_band: false,
          payment_intent: `pi_test_${Date.now()}`,
          payment_settings: {
            payment_method_options: {},
            payment_method_types: ['card'],
          },
          period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
          period_start: Math.floor(Date.now() / 1000),
          post_payment_credit_notes_amount: 0,
          pre_payment_credit_notes_amount: 0,
          quote: null,
          receipt_number: `${Date.now().toString().slice(-6)}-${Date.now().toString().slice(-4)}`,
          starting_balance: 0,
          statement_descriptor: null,
          status: 'paid',
          status_transitions: {
            finalized_at: Math.floor(Date.now() / 1000),
            marked_uncollectible_at: null,
            paid_at: Math.floor(Date.now() / 1000),
            voided_at: null,
          },
          subscription: subscriptionId,
          subtotal: 2900,
          tax: null,
          test_clock: null,
          total: 2900,
          total_discount_amounts: [],
          total_tax_amounts: [],
          transfer_data: null,
          webhooks_delivered_at: Math.floor(Date.now() / 1000),
        },
      },
      livemode: false,
      pending_webhooks: 1,
      request: null,
      type: 'invoice.payment_succeeded',
    };
  }

  /**
   * Create a mock invoice.payment_failed event
   */
  static createInvoicePaymentFailed(options: IWebhookTestOptions): IStripeEventMock {
    const {
      userId,
      customerId = `cus_test_${userId}`,
      subscriptionId = `sub_test_${userId}`,
    } = options;

    const baseEvent = this.createInvoicePaymentSucceeded({ userId, customerId, subscriptionId });
    baseEvent.type = 'invoice.payment_failed';
    baseEvent.data.object.paid = false;
    baseEvent.data.object.status = 'open';
    baseEvent.data.object.attempt_count = 2;
    baseEvent.data.object.next_payment_attempt = Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60; // 3 days retry

    return baseEvent;
  }

  /**
   * Create a mock invoice.payment_succeeded event for a specific plan tier
   *
   * Uses real price IDs from the subscription config for accurate testing.
   * Credit amounts match the subscription tier's monthly credit allocation.
   *
   * @param planKey - Subscription tier key (starter | hobby | pro | business)
   * @param options - Webhook test options
   * @returns Mock invoice.payment_succeeded event with plan-specific details
   *
   * @example
   * ```typescript
   * const event = StripeWebhookMockFactory.createInvoicePaymentSucceededForPlan(
   *   'pro',
   *   { userId: 'user123' }
   * );
   * ```
   */
  static createInvoicePaymentSucceededForPlan(
    planKey: 'starter' | 'hobby' | 'pro' | 'business',
    options: IWebhookTestOptions
  ): IStripeEventMock {
    const { PRICE_IDS, CREDITS } = this.getPlanConstants();

    const priceId = PRICE_IDS[planKey.toUpperCase() as keyof typeof PRICE_IDS];
    const creditsAmount = CREDITS[`${planKey.toUpperCase()}_MONTHLY` as keyof typeof CREDITS];

    const baseEvent = this.createInvoicePaymentSucceeded({
      ...options,
      priceId,
    });

    // Update the line item with the correct price and description
    if (baseEvent.data.object.lines && baseEvent.data.object.lines.data) {
      const lineItem = baseEvent.data.object.lines.data[0];
      if (lineItem) {
        lineItem.price.id = priceId;
        lineItem.plan.id = priceId;
        lineItem.description = `${planKey.charAt(0).toUpperCase() + planKey.slice(1)} Plan Monthly`;
      }
    }

    // Add metadata with credit amount for verification
    baseEvent.data.object.metadata = {
      ...baseEvent.data.object.metadata,
      credits_amount: creditsAmount.toString(),
      plan_key: planKey,
    };

    return baseEvent;
  }

  /**
   * Create a mock checkout.session.completed event for regional subscription
   *
   * Simulates a subscription checkout with regional pricing discount.
   * The event includes the discounted price information and region metadata.
   *
   * @param options - Webhook test options with country code and discount percent
   * @returns Mock checkout.session.completed event with regional pricing
   *
   * @example
   * ```typescript
   * const event = StripeWebhookMockFactory.createCheckoutSessionCompletedForRegionalSubscription({
   *   userId: 'user123',
   *   countryCode: 'IN',
   *   discountPercent: 65,
   * });
   * ```
   */
  static createCheckoutSessionCompletedForRegionalSubscription(
    options: IWebhookTestOptions & {
      countryCode: string;
      discountPercent: number;
    }
  ): IStripeEventMock {
    const { userId, countryCode, discountPercent, priceId = 'price_test_regional' } = options;
    const customerId = options.customerId || `cus_test_${userId}`;
    const sessionId = options.sessionId || `cs_test_${userId}`;
    const subscriptionId = options.subscriptionId || `sub_test_${userId}`;

    // Calculate regional price (assuming base price is $29 for Pro)
    const basePrice = 2900; // $29.00 in cents
    const regionalPrice = Math.round(basePrice * ((100 - discountPercent) / 100));

    return {
      id: `evt_test_${Date.now()}`,
      object: 'event',
      api_version: '2023-10-16',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: sessionId,
          object: 'checkout.session',
          after_expiration: null,
          allow_promotion_codes: null,
          amount_subtotal: regionalPrice,
          amount_total: regionalPrice,
          automatic_tax: {
            enabled: false,
            liability: null,
            status: null,
          },
          billing_address_collection: null,
          cancel_url: 'https://example.com/canceled',
          client_reference_id: null,
          collection_method: 'charge_automatically',
          created: Math.floor(Date.now() / 1000),
          currency: 'usd',
          customer: customerId,
          customer_creation: 'if_required',
          customer_details: {
            address: null,
            email: `test-${userId}@example.com`,
            name: 'Test User',
            phone: null,
            tax_exempt: 'none',
            tax_ids: [],
          },
          customer_email: null,
          expires_at: Math.floor(Date.now() / 1000) + 1800,
          invoice: `in_test_${Date.now()}`,
          invoice_creation: null,
          livemode: false,
          locale: null,
          metadata: {
            user_id: userId,
            country_code: countryCode,
            discount_percent: discountPercent.toString(),
            base_region: 'standard',
            pricing_region: this.getRegionForCountry(countryCode),
          },
          mode: 'subscription',
          payment_intent: null,
          payment_link: null,
          payment_method_collection: 'if_required',
          payment_method_options: {},
          payment_method_types: ['card'],
          payment_status: 'paid',
          paused: null,
          recovered_from: null,
          setup_intent: null,
          shipping_address_collection: null,
          shipping_cost: null,
          shipping_details: null,
          shipping_options: [],
          status: 'complete',
          submit_type: null,
          subscription: subscriptionId,
          success_url: 'https://example.com/success',
          total_details: {
            amount_discount: basePrice - regionalPrice,
            amount_shipping: 0,
            amount_tax: 0,
          },
          url: null,
        },
      },
      livemode: false,
      pending_webhooks: 1,
      request: null,
      type: 'checkout.session.completed',
    };
  }

  /**
   * Get plan constants (price IDs and credit amounts)
   *
   * These match the real values from the subscription and credits config.
   * @private
   */
  private static getPlanConstants() {
    return {
      PRICE_IDS: {
        STARTER: 'price_1Sz0fNL1vUl00LlZX1XClz95',
        HOBBY: 'price_1Sz0fNL1vUl00LlZT6MMTxAg',
        PRO: 'price_1Sz0fOL1vUl00LlZ7bbM2cDs',
        BUSINESS: 'price_1Sz0fOL1vUl00LlZP3y5zdFx',
      },
      CREDITS: {
        STARTER_MONTHLY: 100,
        HOBBY_MONTHLY: 200,
        PRO_MONTHLY: 1000,
        BUSINESS_MONTHLY: 5000,
      },
    };
  }

  /**
   * Get pricing region for a country code
   *
   * Maps country codes to their pricing regions.
   * @private
   */
  private static getRegionForCountry(countryCode: string): string {
    const regionMap: Record<string, string> = {
      // South Asia
      IN: 'south_asia',
      BD: 'south_asia',
      PK: 'south_asia',
      NP: 'south_asia',
      LK: 'south_asia',
      // Southeast Asia
      TH: 'southeast_asia',
      VN: 'southeast_asia',
      ID: 'southeast_asia',
      PH: 'southeast_asia',
      MY: 'southeast_asia',
      // Latin America
      BR: 'latam',
      AR: 'latam',
      MX: 'latam',
      CO: 'latam',
      CL: 'latam',
      PE: 'latam',
      // Eastern Europe
      UA: 'eastern_europe',
      RO: 'eastern_europe',
      BG: 'eastern_europe',
      HU: 'eastern_europe',
      PL: 'eastern_europe',
      // Africa
      ZA: 'africa',
      NG: 'africa',
      KE: 'africa',
      EG: 'africa',
      MA: 'africa',
    };

    return regionMap[countryCode.toUpperCase()] || 'standard';
  }

  /**
   * Create a mock signature for webhook testing
   * Note: In real tests, you'd need to either bypass signature verification or use test secrets
   */
  static createMockSignature(payload: string, secret: string): string {
    // This is a simplified mock - in reality, Stripe uses HMAC-SHA256
    // For testing, you might disable signature verification or use test webhook secrets
    return `t=${Date.now()},v1=${Buffer.from(`${secret}${payload}`).toString('base64').slice(0, 64)}`;
  }
}

/**
 * Convenience object for creating webhook mocks with simpler API
 * Maps test-friendly method names to factory methods
 */
export const stripeWebhookMocks = {
  checkoutCompleted: (options: IWebhookTestOptions & { tier?: string; amount?: number }) => {
    return StripeWebhookMockFactory.createCheckoutSessionCompletedForSubscription(options);
  },
  invoicePaymentSucceeded: (options: IWebhookTestOptions) => {
    return StripeWebhookMockFactory.createInvoicePaymentSucceeded(options);
  },
  subscriptionUpdated: (options: IWebhookTestOptions & { status?: string }) => {
    return StripeWebhookMockFactory.createSubscriptionUpdated(options);
  },
  subscriptionDeleted: (options: IWebhookTestOptions) => {
    return StripeWebhookMockFactory.createSubscriptionDeleted(options);
  },
};
