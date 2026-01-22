import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { BaseController } from './BaseController';
import { supabaseAdmin } from '../supabase/supabaseAdmin';
import { stripe } from '../stripe';
import { trackServerEvent } from '../analytics';
import { clientEnv, serverEnv } from '@shared/config/env';
import { assertKnownPriceId, resolvePlanOrPack } from '@shared/config/stripe';
import { getTrialConfig } from '@shared/config/subscription.config';
import type { ICheckoutSessionRequest } from '@shared/types/stripe.types';
import Stripe from 'stripe';

/**
 * Portal request body
 */
interface IPortalRequest {
  returnUrl?: string;
}

/**
 * Checkout Controller
 *
 * Handles checkout and billing portal endpoints:
 * - POST /api/checkout - Create Stripe checkout session
 * - POST /api/portal - Create Stripe customer portal session
 */
export class CheckoutController extends BaseController {
  /**
   * Handle incoming request
   */
  protected async handle(req: NextRequest): Promise<NextResponse> {
    const path = req.nextUrl.pathname;

    // Route to appropriate method based on path
    if (path.endsWith('/checkout') && this.isPost(req)) {
      return this.checkout(req);
    }
    if (path.endsWith('/portal') && this.isPost(req)) {
      return this.portal(req);
    }

    return this.error('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  }

  /**
   * Authenticate user from Authorization header
   * Supports both real auth and test mode
   */
  private async authenticateUser(
    req: NextRequest
  ): Promise<{ user: { id: string; email?: string } | null; error?: NextResponse }> {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return { user: null, error: this.error('UNAUTHORIZED', 'Missing authorization header', 401) };
    }

    const token = authHeader.replace('Bearer ', '');

    if (serverEnv.ENV === 'test') {
      // Test mode mock authentication
      if (token.startsWith('test_token_')) {
        let mockUserId: string;
        if (token.startsWith('test_token_mock_user_')) {
          mockUserId = token.replace('test_token_mock_user_', '');
        } else {
          mockUserId = token.replace('test_token_', '');
        }
        return {
          user: {
            id: mockUserId,
            email: `test-${mockUserId}@example.com`,
          },
        };
      }
      return { user: null, error: this.error('UNAUTHORIZED', 'Invalid test token', 401) };
    }

    // Real authentication
    const result = await supabaseAdmin.auth.getUser(token);
    return {
      user: result.data.user,
      error: result.error ? this.error('UNAUTHORIZED', 'Invalid authentication token', 401) : undefined,
    };
  }

  /**
   * POST /api/checkout
   * Create Stripe checkout session for subscriptions or credit packs
   */
  private async checkout(req: NextRequest): Promise<NextResponse> {
    // 1. Parse and validate request body
    let body: ICheckoutSessionRequest;
    try {
      const text = await req.text();
      body = JSON.parse(text);
    } catch {
      return this.error('VALIDATION_ERROR', 'Invalid JSON in request body', 400);
    }

    const { priceId, successUrl, cancelUrl, metadata = {}, uiMode = 'hosted' } = body;

    // Validate price ID format
    if (!priceId || typeof priceId !== 'string' || priceId.trim() === '') {
      return this.error('VALIDATION_ERROR', 'priceId is required and must be a non-empty string', 400);
    }

    if (!priceId.startsWith('price_') || priceId.length < 10) {
      return this.error(
        'INVALID_PRICE',
        'Invalid price ID format. Price IDs must start with "price_" and be valid Stripe price identifiers.',
        400
      );
    }

    // 2. Authenticate user
    const { user, error: authError } = await this.authenticateUser(req);
    if (authError) return authError;
    if (!user) return this.error('UNAUTHORIZED', 'Invalid authentication token', 401);

    // Check if we're in test mode
    const isTestMode = serverEnv.ENV === 'test' || serverEnv.STRIPE_SECRET_KEY?.includes('dummy_key');

    // 3. Validate price ID using unified resolver
    let resolvedPrice = null;
    try {
      resolvedPrice = assertKnownPriceId(priceId);
    } catch (error) {
      if (isTestMode) {
        // In test mode, return mock response
        const baseUrl = req.headers.get('origin') || clientEnv.BASE_URL;
        const mockSessionId = `cs_test_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        return this.json({
          url: `${baseUrl}/success?session_id=${mockSessionId}`,
          sessionId: mockSessionId,
          mock: true,
        });
      }
      return this.error(
        'INVALID_PRICE',
        error instanceof Error ? error.message : 'Invalid price ID. Must be a subscription plan or credit pack.',
        400
      );
    }

    // 4. Check for existing active subscription (only for subscription purchases)
    if (resolvedPrice && resolvedPrice.type === 'plan') {
      if (isTestMode) {
        // In test mode, check the user token for subscription status
        // Token format: test_token_mock_user_{userId}_sub_{status}_{tier}
        const authHeader = req.headers.get('authorization');
        const token = authHeader?.replace('Bearer ', '') || '';

        if (token.includes('_sub_') && (token.includes('_sub_active_') || token.includes('_sub_trialing_'))) {
          return this.error(
            'ALREADY_SUBSCRIBED',
            'You already have an active subscription. Please manage your subscription through the billing portal to upgrade or downgrade.',
            400
          );
        }
      } else {
        // In production, query the database
        const { data: existingSubscription } = await supabaseAdmin
          .from('subscriptions')
          .select('id, status')
          .eq('user_id', user.id)
          .in('status', ['active', 'trialing'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingSubscription) {
          return this.error(
            'ALREADY_SUBSCRIBED',
            'You already have an active subscription. Please manage your subscription through the billing portal to upgrade or downgrade.',
            400
          );
        }
      }
    }

    // 5. Handle test mode mock response
    if (isTestMode) {
      let customerId = `cus_test_${user.id}`;
      try {
        await supabaseAdmin
          .from('profiles')
          .update({ stripe_customer_id: customerId })
          .eq('id', user.id);
      } catch {
        // Ignore errors in test mode
      }

      const baseUrl = req.headers.get('origin') || clientEnv.BASE_URL;
      const mockSessionId = `cs_test_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      return this.json({
        url: `${baseUrl}/success?session_id=${mockSessionId}`,
        sessionId: mockSessionId,
        mock: true,
      });
    }

    // 6. Get or create Stripe customer
    let customerId = null;
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    customerId = profile?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: user.id,
        },
      });

      customerId = customer.id;

      await supabaseAdmin
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }

    // 7. Verify price type matches expected (double-check with Stripe in production)
    if (resolvedPrice) {
      const price = await stripe.prices.retrieve(priceId);
      if (resolvedPrice.type === 'plan' && price.type !== 'recurring') {
        return this.error('INVALID_PRICE', 'Invalid price type. Subscription plans must be recurring.', 400);
      }
      if (resolvedPrice.type === 'pack' && price.type !== 'one_time') {
        return this.error('INVALID_PRICE', 'Invalid price type. Credit packs must be one-time payments.', 400);
      }
    }

    // 8. Create Stripe Checkout Session
    const baseUrl = req.headers.get('origin') || clientEnv.BASE_URL;
    const checkoutMode = resolvedPrice?.type === 'pack' ? 'payment' : 'subscription';

    const unifiedMetadata = resolvePlanOrPack(priceId);

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: checkoutMode,
      ui_mode: uiMode,
      metadata: {
        user_id: user.id,
        ...(unifiedMetadata
          ? {
              type: unifiedMetadata.type,
              ...(unifiedMetadata.type === 'plan'
                ? {
                    plan_key: unifiedMetadata.key,
                    credits_per_cycle: unifiedMetadata.creditsPerCycle?.toString() || '',
                    max_rollover: unifiedMetadata.maxRollover?.toString() || '',
                  }
                : {
                    pack_key: unifiedMetadata.key,
                    credits: unifiedMetadata.credits?.toString() || '',
                  }),
            }
          : {}),
        ...metadata,
      },
    };

    // Only add subscription_data for subscriptions
    if (resolvedPrice?.type === 'plan' && checkoutMode === 'subscription') {
      sessionParams.subscription_data = {
        metadata: {
          user_id: user.id,
          plan_key: unifiedMetadata?.key || '',
        },
      };

      // Add trial period if configured
      const trialConfig = getTrialConfig(priceId);
      if (trialConfig && trialConfig.enabled) {
        sessionParams.subscription_data.trial_period_days = trialConfig.durationDays;
        if (!trialConfig.requirePaymentMethod) {
          sessionParams.payment_method_collection = 'if_required';
        }
      }
    }

    // Add return URLs based on UI mode
    const purchaseType = resolvedPrice?.type === 'pack' ? 'credits' : 'subscription';
    const creditsParam = resolvedPrice?.type === 'pack' ? `&credits=${unifiedMetadata?.credits || 0}` : '';

    if (uiMode === 'hosted') {
      sessionParams.success_url =
        successUrl || `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}&type=${purchaseType}${creditsParam}`;
      sessionParams.cancel_url = cancelUrl || `${baseUrl}/canceled`;
    } else {
      sessionParams.return_url =
        successUrl || `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}&type=${purchaseType}${creditsParam}`;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    // Track checkout started event
    await trackServerEvent(
      'checkout_started',
      {
        priceId,
        purchaseType,
        sessionId: session.id,
        plan: unifiedMetadata?.type === 'plan' ? unifiedMetadata.key : undefined,
        pack: unifiedMetadata?.type === 'pack' ? unifiedMetadata.key : undefined,
      },
      { apiKey: serverEnv.AMPLITUDE_API_KEY, userId: user.id }
    );

    return this.json({
      url: session.url,
      sessionId: session.id,
      clientSecret: session.client_secret,
    });
  }

  /**
   * POST /api/portal
   * Create Stripe customer portal session for billing management
   */
  private async portal(req: NextRequest): Promise<NextResponse> {
    // 1. Authenticate user
    const { user, error: authError } = await this.authenticateUser(req);
    if (authError) return authError;
    if (!user) return this.error('UNAUTHORIZED', 'Invalid authentication token', 401);

    // 2. Parse and validate request body
    let body: IPortalRequest = {};
    try {
      const text = await req.text();
      if (text) {
        body = JSON.parse(text);
      }
    } catch {
      return this.error('INVALID_JSON', 'Invalid JSON in request body', 400);
    }

    // 3. Validate return URL if provided
    let returnUrl: string;
    if (body.returnUrl) {
      try {
        const url = new URL(body.returnUrl);

        // Only allow http and https protocols
        if (!['http:', 'https:'].includes(url.protocol)) {
          return this.error('INVALID_RETURN_URL', 'Invalid return URL protocol', 400);
        }

        // Domain allowlist to prevent open redirect
        const baseUrlHostname = new URL(clientEnv.BASE_URL).hostname;
        const allowedDomains = [baseUrlHostname, 'localhost', '127.0.0.1'];

        const isAllowedDomain = allowedDomains.some(domain => {
          return url.hostname === domain || url.hostname.endsWith(`.${domain}`);
        });

        if (!isAllowedDomain) {
          return this.error('INVALID_RETURN_URL', 'Return URL domain not allowed', 400);
        }

        // XSS prevention - check for dangerous patterns
        const dangerousPatterns = [
          /javascript:/i,
          /data:/i,
          /vbscript:/i,
          /<script/i,
          /onload=/i,
          /onerror=/i,
        ];

        for (const pattern of dangerousPatterns) {
          if (pattern.test(body.returnUrl)) {
            return this.error('INVALID_RETURN_URL', 'Invalid return URL format', 400);
          }
        }

        returnUrl = body.returnUrl;
      } catch {
        return this.error('INVALID_RETURN_URL', 'Invalid return URL format', 400);
      }
    } else {
      // Default return URL
      const baseUrl = req.headers.get('origin') || clientEnv.BASE_URL;
      returnUrl = `${baseUrl}/dashboard/billing`;
    }

    // 4. Get Stripe Customer ID from profile
    let stripeCustomerId: string | null = null;

    if (serverEnv.ENV === 'test' && user.id.startsWith('mock_user_')) {
      stripeCustomerId = `cus_test_${user.id}`;
    } else {
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('stripe_customer_id')
        .eq('id', user.id)
        .single();

      if (profileError || !profile?.stripe_customer_id) {
        return this.error('STRIPE_CUSTOMER_NOT_FOUND', 'Activate a subscription to manage billing.', 400);
      }

      stripeCustomerId = profile.stripe_customer_id;
    }

    // 5. Handle test mode
    if (serverEnv.STRIPE_SECRET_KEY?.includes('dummy_key') || serverEnv.ENV === 'test') {
      return this.json({
        url: `${returnUrl}?mock=true`,
        mock: true,
      });
    }

    // 6. Create Stripe Customer Portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId!,
      return_url: returnUrl,
    });

    return this.json({
      url: portalSession.url,
    });
  }
}
