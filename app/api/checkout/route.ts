import type { ICheckoutSessionRequest } from '@/shared/types/stripe.types';
import { stripe } from '@server/stripe';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { trackServerEvent } from '@server/analytics';
import { clientEnv, serverEnv } from '@shared/config/env';
import { assertKnownPriceId, resolvePlanOrPack } from '@shared/config/stripe';
import { getTrialConfig } from '@shared/config/subscription.config';
import { getPricingRegion, getDiscountedPriceInCents } from '@shared/config/pricing-regions';
import {
  isDiscountValid,
  calculateStackedDiscount,
} from '@server/services/engagement-discount.service';
import { ENGAGEMENT_DISCOUNT_CONFIG } from '@shared/config/engagement-discount';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

/**
 * Validates and parses the request body
 */
async function parseRequestBody(request: NextRequest): Promise<ICheckoutSessionRequest> {
  let body: ICheckoutSessionRequest;
  try {
    const text = await request.text();
    body = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON in request body');
  }
  return body;
}

/**
 * Validates price ID format and basic requirements
 */
function validatePriceId(priceId: unknown): string {
  if (!priceId) {
    throw new Error('priceId is required');
  }

  const priceIdStr = String(priceId);
  if (typeof priceId !== 'string' || priceIdStr.trim() === '') {
    throw new Error('priceId must be a non-empty string');
  }

  // Validate basic Stripe price ID format
  if (!priceIdStr.startsWith('price_') || priceIdStr.length < 10) {
    throw new Error(
      'Invalid price ID format. Price IDs must start with "price_" and be valid Stripe price identifiers.'
    );
  }

  return priceIdStr;
}

/**
 * Extracts user from authentication token
 */
async function authenticateUser(authHeader: string | null, token: string) {
  let user: {
    id: string;
    email?: string;
    user_metadata?: Record<string, string>;
    app_metadata?: Record<string, string>;
  } | null = null;
  let authError: {
    message: string;
    status?: number;
  } | null = null;

  if (serverEnv.ENV === 'test') {
    // In test mode, only accept mock tokens
    if (token.startsWith('test_token_')) {
      let mockUserId: string;
      if (token.startsWith('test_token_mock_user_')) {
        mockUserId = token.replace('test_token_mock_user_', '');
      } else {
        mockUserId = token.replace('test_token_', '');
      }
      user = {
        id: mockUserId,
        email: `test-${mockUserId}@example.com`,
      };
    } else {
      authError = { message: 'Invalid test token', status: 401 };
    }
  } else {
    const result = await supabaseAdmin.auth.getUser(token);
    user = result.data.user;
    authError = result.error;
  }

  return { user, authError };
}

/**
 * Checks for existing active subscription
 */
async function checkExistingSubscription(
  user: { id: string },
  resolvedPrice: { type: string } | null,
  token: string
) {
  // Only check for existing subscription if purchasing a subscription plan
  if (!resolvedPrice || resolvedPrice.type !== 'plan') {
    return null;
  }

  let existingSubscription = null;

  if (serverEnv.ENV === 'test' && token.startsWith('test_token_')) {
    // For mock users, check if subscription status is encoded in the token
    const tokenParts = token.split('_');
    if (tokenParts.length > 5) {
      const subscriptionStatus = tokenParts[tokenParts.length - 2];
      if (['active', 'trialing'].includes(subscriptionStatus)) {
        existingSubscription = { status: subscriptionStatus };
      }
    }
  } else {
    const { data: subscriptionData } = await supabaseAdmin
      .from('subscriptions')
      .select('id, status, price_id')
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    existingSubscription = subscriptionData;
  }

  return existingSubscription;
}

/**
 * Gets or creates Stripe customer ID
 */
async function getOrCreateCustomerId(
  user: { id: string; email?: string },
  token: string
): Promise<string> {
  let customerId = null;

  if (!(serverEnv.ENV === 'test' && token.startsWith('test_token_'))) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    customerId = profile?.stripe_customer_id;
  }

  if (!customerId) {
    // Create a new Stripe customer
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: {
        supabase_user_id: user.id,
      },
    });

    customerId = customer.id;

    // Update the profile with the new customer ID
    await supabaseAdmin
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.id);
  }

  return customerId;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Parse and validate request body
    let body: ICheckoutSessionRequest;
    try {
      body = await parseRequestBody(request);
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: error instanceof Error ? error.message : 'Invalid JSON in request body',
          },
        },
        { status: 400 }
      );
    }

    const { priceId, successUrl, cancelUrl, metadata = {}, uiMode = 'hosted' } = body;

    // Validate price ID format
    let validatedPriceId: string;
    try {
      validatedPriceId = validatePriceId(priceId);
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code:
              error instanceof Error && error.message.includes('Invalid price ID format')
                ? 'INVALID_PRICE'
                : 'VALIDATION_ERROR',
            message: error instanceof Error ? error.message : 'Invalid price ID',
          },
        },
        { status: 400 }
      );
    }

    // 2. Get the authenticated user from the Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Missing authorization header',
          },
        },
        { status: 401 }
      );
    }

    // Extract the JWT token
    const token = authHeader.replace('Bearer ', '');

    // Check if we're in test mode (after basic validation)
    const isTestMode =
      (serverEnv.STRIPE_SECRET_KEY?.includes('dummy_key') && serverEnv.ENV === 'test') ||
      (serverEnv.ENV === 'test' && token.startsWith('test_token_'));

    // Validate price ID using unified resolver (skip validation errors in test mode, but still resolve for type checking)
    let resolvedPrice = null;

    try {
      resolvedPrice = assertKnownPriceId(validatedPriceId);
    } catch (error) {
      if (isTestMode) {
        // In test mode, accept any validly formatted price ID and return a mock response immediately
        // This allows tests to use arbitrary test price IDs without needing to configure them
        const baseUrl = request.headers.get('origin') || clientEnv.BASE_URL;
        const mockSessionId = `cs_test_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        return NextResponse.json({
          success: true,
          data: {
            url: `${baseUrl}/success?session_id=${mockSessionId}`,
            sessionId: mockSessionId,
            mock: true,
          },
        });
      } else {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_PRICE',
              message:
                error instanceof Error
                  ? error.message
                  : 'Invalid price ID. Must be a subscription plan or credit pack.',
            },
          },
          { status: 400 }
        );
      }
    }

    // 3. Authenticate user
    const { user, authError } = await authenticateUser(null, token);

    if (authError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid authentication token',
          },
        },
        { status: 401 }
      );
    }

    // 4. Check if user already has an active subscription (only for subscription purchases)
    const existingSubscription = await checkExistingSubscription(user, resolvedPrice, token);

    if (existingSubscription) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'ALREADY_SUBSCRIBED',
            message:
              'You already have an active subscription. Please manage your subscription through the billing portal to upgrade or downgrade.',
          },
        },
        { status: 400 }
      );
    }

    // 5. Handle test mode mock response
    if (isTestMode) {
      // Create mock customer ID if it doesn't exist
      let customerId = `cus_test_${user.id}`;

      // Only try to update profile for non-mock users
      if (!token.startsWith('test_token_mock_user_')) {
        try {
          await supabaseAdmin
            .from('profiles')
            .update({ stripe_customer_id: customerId })
            .eq('id', user.id);
        } catch {
          // Ignore errors in test mode
        }
      }

      // Return mock checkout session for testing
      const baseUrl = request.headers.get('origin') || clientEnv.BASE_URL;
      const mockSessionId = `cs_test_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      return NextResponse.json({
        success: true,
        data: {
          url: `${baseUrl}/success?session_id=${mockSessionId}`,
          sessionId: mockSessionId,
          mock: true,
        },
      });
    }

    // 6. Get or create Stripe customer
    const customerId = await getOrCreateCustomerId(user, token);

    // 6.5. Detect country and resolve regional pricing
    const country =
      request.headers.get('CF-IPCountry') ||
      request.headers.get('cf-ipcountry') ||
      (serverEnv.ENV === 'test' ? request.headers.get('x-test-country') : null);
    const pricingConfig = getPricingRegion(country || '');

    // 6.6. Log region mismatch for monitoring (non-blocking, does not affect checkout)
    if (country && !isTestMode) {
      try {
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('signup_country')
          .eq('id', user.id)
          .single();

        if (profile?.signup_country && profile.signup_country !== country) {
          const signupRegion = getPricingRegion(profile.signup_country);
          await trackServerEvent(
            'pricing_region_mismatch',
            {
              signupCountry: profile.signup_country,
              signupRegion: signupRegion.region,
              checkoutCountry: country,
              checkoutRegion: pricingConfig.region,
              discountPercent: pricingConfig.discountPercent,
            },
            { apiKey: serverEnv.AMPLITUDE_API_KEY, userId: user.id }
          );
        }
      } catch {
        // Mismatch logging is best-effort — never block checkout
      }
    }

    // 6.7. Check for engagement discount eligibility (first-purchase discount for engaged free users)
    let engagementDiscountPercent = 0;

    // Resolve metadata early for engagement discount check
    const unifiedMetadata = resolvePlanOrPack(validatedPriceId);

    // Only check for engagement discount on credit pack purchases (not subscriptions)
    if (resolvedPrice?.type === 'pack' && !isTestMode) {
      try {
        const discountValidity = await isDiscountValid(user.id);
        if (discountValidity.valid) {
          const targetPackKey = ENGAGEMENT_DISCOUNT_CONFIG.targetPackKey;
          const isTargetPack = unifiedMetadata?.key === targetPackKey;

          if (isTargetPack) {
            engagementDiscountPercent = ENGAGEMENT_DISCOUNT_CONFIG.discountPercent;

            // Track checkout started with engagement discount
            await trackServerEvent(
              'engagement_discount_checkout_started',
              {
                targetPackKey,
                priceId: validatedPriceId,
              },
              { apiKey: serverEnv.AMPLITUDE_API_KEY, userId: user.id }
            ).catch(() => {
              // Non-blocking
            });
          }
        }
      } catch {
        // Engagement discount check is best-effort — never block checkout
      }
    }

    // 7. Verify price type matches expected (double-check with Stripe in production)
    if (!isTestMode && resolvedPrice) {
      const price = await stripe.prices.retrieve(validatedPriceId);
      if (resolvedPrice.type === 'plan' && price.type !== 'recurring') {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_PRICE',
              message: 'Invalid price type. Subscription plans must be recurring.',
            },
          },
          { status: 400 }
        );
      }
      if (resolvedPrice.type === 'pack' && price.type !== 'one_time') {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'INVALID_PRICE',
              message: 'Invalid price type. Credit packs must be one-time payments.',
            },
          },
          { status: 400 }
        );
      }
    }

    // 8. Create Stripe Checkout Session (supports both subscription and payment modes)
    const baseUrl = request.headers.get('origin') || clientEnv.BASE_URL;
    const checkoutMode = resolvedPrice?.type === 'pack' ? 'payment' : 'subscription';

    // Build line_items: use price_data with inline discounted amount for all regional purchases,
    // so no Stripe Price objects need to be created per region.
    // Engagement discount stacks on top of regional discount.
    let lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];
    const totalDiscountPercent = pricingConfig.discountPercent + engagementDiscountPercent;

    if (totalDiscountPercent > 0) {
      const originalPrice = await stripe.prices.retrieve(validatedPriceId);
      const productId =
        typeof originalPrice.product === 'string'
          ? originalPrice.product
          : originalPrice.product.id;

      // Calculate final price with both regional and engagement discounts
      let finalAmount: number;
      if (engagementDiscountPercent > 0 && pricingConfig.discountPercent > 0) {
        // Stack discounts: regional first, then engagement
        finalAmount = calculateStackedDiscount(
          originalPrice.unit_amount!,
          pricingConfig.discountPercent,
          engagementDiscountPercent
        );
      } else if (engagementDiscountPercent > 0) {
        // Only engagement discount
        finalAmount = getDiscountedPriceInCents(
          originalPrice.unit_amount!,
          engagementDiscountPercent
        );
      } else {
        // Only regional discount
        finalAmount = getDiscountedPriceInCents(
          originalPrice.unit_amount!,
          pricingConfig.discountPercent
        );
      }

      const priceData: Stripe.Checkout.SessionCreateParams.LineItem.PriceData = {
        currency: 'usd',
        product: productId,
        unit_amount: finalAmount,
      };
      if (resolvedPrice?.type === 'plan') {
        priceData.recurring = { interval: 'month' };
      }
      lineItems = [{ price_data: priceData, quantity: 1 }];
    } else {
      lineItems = [{ price: validatedPriceId, quantity: 1 }];
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      line_items: lineItems,
      mode: checkoutMode,
      ui_mode: uiMode,
      metadata: {
        user_id: user.id,
        pricing_region: pricingConfig.region,
        discount_percent: pricingConfig.discountPercent.toString(),
        // Track engagement discount for webhook redemption
        ...(engagementDiscountPercent > 0
          ? {
              engagement_discount_percent: engagementDiscountPercent.toString(),
              engagement_discount_applied: 'true',
            }
          : {}),
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

      // Add trial period if configured and enabled
      const trialConfig = getTrialConfig(validatedPriceId);
      if (trialConfig && trialConfig.enabled) {
        // Add trial period to subscription
        sessionParams.subscription_data.trial_period_days = trialConfig.durationDays;

        // If payment method is not required upfront, set payment collection
        if (!trialConfig.requirePaymentMethod) {
          sessionParams.payment_method_collection = 'if_required';
        }
      }
    }

    // Add return URLs only for hosted mode
    // Include purchase type in success URL for proper messaging
    const purchaseType = resolvedPrice?.type === 'pack' ? 'credits' : 'subscription';
    const creditsParam =
      resolvedPrice?.type === 'pack' ? `&credits=${unifiedMetadata?.credits || 0}` : '';

    if (uiMode === 'hosted') {
      sessionParams.success_url =
        successUrl ||
        `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}&type=${purchaseType}${creditsParam}`;
      sessionParams.cancel_url = cancelUrl || `${baseUrl}/canceled`;
    } else {
      // For embedded mode, use return_url
      sessionParams.return_url =
        successUrl ||
        `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}&type=${purchaseType}${creditsParam}`;
    }

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create(sessionParams);
    } catch (sessionError) {
      // If the stored customer ID is stale (deleted in Stripe), create a fresh one and retry once
      if (
        sessionError instanceof Stripe.errors.StripeInvalidRequestError &&
        sessionError.code === 'resource_missing' &&
        sessionError.param === 'customer'
      ) {
        const freshCustomer = await stripe.customers.create({
          email: user.email,
          metadata: { supabase_user_id: user.id },
        });
        await supabaseAdmin
          .from('profiles')
          .update({ stripe_customer_id: freshCustomer.id })
          .eq('id', user.id);
        sessionParams.customer = freshCustomer.id;
        session = await stripe.checkout.sessions.create(sessionParams);
      } else {
        throw sessionError;
      }
    }

    // Track checkout started event
    await trackServerEvent(
      'checkout_started',
      {
        priceId: validatedPriceId,
        purchaseType,
        sessionId: session.id,
        plan: unifiedMetadata?.type === 'plan' ? unifiedMetadata.key : undefined,
        pack: unifiedMetadata?.type === 'pack' ? unifiedMetadata.key : undefined,
        pricingRegion: pricingConfig.region,
        discountPercent: pricingConfig.discountPercent,
      },
      { apiKey: serverEnv.AMPLITUDE_API_KEY, userId: user.id }
    );

    // 8. Return the session data
    return NextResponse.json({
      success: true,
      data: {
        url: session.url,
        sessionId: session.id,
        clientSecret: session.client_secret, // Required for embedded checkout
      },
    });
  } catch (error: unknown) {
    console.error('Checkout error:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'An error occurred during checkout';
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      },
      { status: 500 }
    );
  }
}
