import type { ICheckoutSessionRequest } from '@/shared/types/stripe.types';
import { stripe } from '@server/stripe';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { trackServerEvent } from '@server/analytics';
import { clientEnv, serverEnv } from '@shared/config/env';
import { STRIPE_PRICES, assertKnownPriceId, resolvePlanOrPack } from '@shared/config/stripe';
import { getTrialConfig } from '@shared/config/subscription.config';
import { getPricingRegion, getDiscountedPriceInCents } from '@shared/config/pricing-regions';
import { PRICING_GEO_COOKIE_NAME, parsePricingGeoSession } from '@shared/utils/pricing-geo-session';
import {
  isDiscountValid,
  calculateStackedDiscount,
} from '@server/services/engagement-discount.service';
import { verifyCheckoutRescueOffer } from '@server/services/checkout-rescue-offer.service';
import { getRevenueRecoveryService } from '@server/services/revenue-recovery.service';
import { isRevenueFeatureEligible } from '@server/services/revenue-feature-rollout.service';
import { ENGAGEMENT_DISCOUNT_CONFIG } from '@shared/config/engagement-discount';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { validateExperimentCheckoutAttribution } from '@lib/experiments';
import { EXPERIMENT_CHECKOUT_METADATA_KEYS } from '@shared/types/experiments.types';
import {
  FUNNEL_CHECKOUT_METADATA_KEYS,
  parseFunnelCheckoutAttribution,
} from './funnel-attribution';

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

const RESERVED_CHECKOUT_METADATA_KEYS = new Set([
  'user_id',
  'supabase_user_id',
  'pricing_region',
  'discount_percent',
  'effective_discount_percent',
  'engagement_discount_percent',
  'engagement_discount_applied',
  'checkout_offer_percent',
  'checkout_offer_applied',
  'type',
  'plan_key',
  'credits_per_cycle',
  'max_rollover',
  'pack_key',
  'credits',
  'price_id',
  'auto_top_up_consent_version',
  'auto_top_up_threshold',
  'auto_top_up_pack_key',
  ...Object.values(EXPERIMENT_CHECKOUT_METADATA_KEYS),
  ...Object.values(FUNNEL_CHECKOUT_METADATA_KEYS),
  // bandit_arm_id is intentionally NOT reserved: it comes from the client (via /api/geo)
  // and must pass through to Stripe metadata so the webhook can record conversions.
]);

function parseExperimentCheckoutAttribution(metadata: Record<string, string>) {
  const keys = EXPERIMENT_CHECKOUT_METADATA_KEYS;
  const hasExperimentMetadata = Object.values(keys).some(key => metadata[key] !== undefined);
  if (!hasExperimentMetadata) return null;

  const experimentKey = metadata[keys.experimentKey];
  const experimentContextKey = metadata[keys.experimentContextKey];
  const experimentArmKey = metadata[keys.experimentArmKey];
  const experimentAssignmentKey = metadata[keys.experimentAssignmentKey];
  const experimentArmId = Number(metadata[keys.experimentArmId]);
  if (
    !experimentKey ||
    !experimentContextKey ||
    !experimentArmKey ||
    !experimentAssignmentKey ||
    !Number.isSafeInteger(experimentArmId) ||
    experimentArmId <= 0
  ) {
    throw new Error('Incomplete or invalid experiment checkout attribution');
  }
  return {
    experimentKey,
    contextKey: experimentContextKey,
    armId: experimentArmId,
    armKey: experimentArmKey,
    assignmentKey: experimentAssignmentKey,
  };
}

function sanitizeCustomCheckoutMetadata(metadata: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(metadata).filter(([key]) => !RESERVED_CHECKOUT_METADATA_KEYS.has(key))
  );
}

function stableSerialize(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter(key => record[key] !== undefined)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

async function buildCheckoutIdempotencyKey(input: {
  funnelAttemptId?: string;
  sessionParams: Stripe.Checkout.SessionCreateParams;
}): Promise<{ key: string; hash: string } | null> {
  if (!input.funnelAttemptId) return null;

  // Stripe rejects reusing an idempotency key with a different request body.
  // Hash every session parameter, including validated metadata, customer,
  // line items, discounts, and return URLs, rather than only funnel identity.
  const identity = stableSerialize(input.sessionParams);

  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
    const hash = Array.from(new Uint8Array(digest))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
    return { key: `miu_checkout_${hash}`, hash };
  } catch {
    // Checkout must remain available if a runtime lacks Web Crypto.
    return null;
  }
}

function consentVersionFromHash(hash: string): string {
  const bytes = hash.slice(0, 32).padEnd(32, '0').split('');
  bytes[12] = '4';
  bytes[16] = ['8', '9', 'a', 'b'][parseInt(bytes[16], 16) % 4];
  return [
    bytes.slice(0, 8).join(''),
    bytes.slice(8, 12).join(''),
    bytes.slice(12, 16).join(''),
    bytes.slice(16, 20).join(''),
    bytes.slice(20).join(''),
  ].join('-');
}

function createTestResolvedPrice(priceId: string): ReturnType<typeof assertKnownPriceId> {
  const creditPackPriceIds = new Set([
    STRIPE_PRICES.SMALL_CREDITS,
    STRIPE_PRICES.MEDIUM_CREDITS,
    STRIPE_PRICES.LARGE_CREDITS,
  ]);
  const isPack = creditPackPriceIds.has(priceId);

  return {
    type: isPack ? 'pack' : 'plan',
    key: isPack ? 'test-pack' : 'test-plan',
    name: isPack ? 'Test Credit Pack' : 'Test Plan',
    stripePriceId: priceId,
    priceInCents: 100,
    currency: 'usd',
    credits: isPack ? 100 : 10,
    maxRollover: isPack ? null : 60,
  };
}

/**
 * Extracts user from authentication token
 */
async function authenticateUser(token: string) {
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

  // Test-token authentication is available only in the test environment. The
  // headers are not trusted as an environment switch in a deployed build.
  const isTestMode = serverEnv.ENV === 'test';

  if (isTestMode) {
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

    const {
      priceId,
      successUrl,
      cancelUrl,
      metadata = {},
      uiMode = 'hosted',
      offerToken,
      autoTopUp,
    } = body;
    const customMetadata = sanitizeCustomCheckoutMetadata(metadata);

    let validatedFunnelMetadata: Record<string, string> = {};
    try {
      validatedFunnelMetadata = parseFunnelCheckoutAttribution(metadata) || {};
    } catch (error) {
      // Funnel data is observability metadata, not a payment prerequisite.
      // Ignore invalid or stale client attribution so cached bundles cannot
      // turn a valid checkout into a hard 400.
      console.warn('[CHECKOUT_FUNNEL_ATTRIBUTION_IGNORED]', {
        error: error instanceof Error ? error.message : String(error),
      });
      validatedFunnelMetadata = {};
    }

    if (Object.keys(customMetadata).length !== Object.keys(metadata).length) {
      console.warn('[CHECKOUT_METADATA_OVERRIDE_BLOCKED]', {
        requestedKeys: Object.keys(metadata),
        allowedKeys: Object.keys(customMetadata),
      });
    }

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

    // Test-token and relaxed price handling are available only in the test
    // environment; request headers cannot enable them in production.
    const isTestMode = serverEnv.ENV === 'test';

    // Validate price ID using unified resolver (skip validation errors in test mode, but still resolve for type checking)
    let resolvedPrice = null;

    try {
      resolvedPrice = assertKnownPriceId(validatedPriceId);
    } catch (error) {
      if (isTestMode) {
        // In test mode, accept any validly formatted price ID while still
        // running auth and subscription-conflict checks below.
        resolvedPrice = createTestResolvedPrice(validatedPriceId);
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
    const { user, authError } = await authenticateUser(token);

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

    let validatedExperimentMetadata: Record<string, string> = {};
    try {
      const attribution = parseExperimentCheckoutAttribution(metadata);
      if (attribution) {
        const validation = await validateExperimentCheckoutAttribution(attribution);
        if (!validation.valid) {
          console.warn('[CHECKOUT_EXPERIMENT_ATTRIBUTION_IGNORED]', {
            userId: user.id,
            reason: validation.reason,
          });
        } else {
          validatedExperimentMetadata = {
            [EXPERIMENT_CHECKOUT_METADATA_KEYS.experimentKey]: validation.attribution.experimentKey,
            [EXPERIMENT_CHECKOUT_METADATA_KEYS.experimentContextKey]:
              validation.attribution.contextKey,
            [EXPERIMENT_CHECKOUT_METADATA_KEYS.experimentArmId]:
              validation.attribution.armId.toString(),
            [EXPERIMENT_CHECKOUT_METADATA_KEYS.experimentArmKey]: validation.attribution.armKey,
            [EXPERIMENT_CHECKOUT_METADATA_KEYS.experimentAssignmentKey]:
              validation.attribution.assignmentKey,
          };
        }
      }
    } catch (error) {
      console.warn('[CHECKOUT_EXPERIMENT_ATTRIBUTION_IGNORED]', {
        userId: user.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (
      autoTopUp &&
      (autoTopUp.enabled !== true ||
        !Number.isInteger(autoTopUp.thresholdCredits) ||
        autoTopUp.thresholdCredits < 1 ||
        autoTopUp.thresholdCredits > 50 ||
        resolvedPrice?.type !== 'pack' ||
        !['small', 'medium'].includes(resolvedPrice.key))
    ) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'INVALID_AUTO_TOP_UP', message: 'Invalid auto top-up rule' },
        },
        { status: 400 }
      );
    }
    if (autoTopUp && !(await isRevenueFeatureEligible(user.id, 'auto_top_up'))) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'AUTO_TOP_UP_NOT_ELIGIBLE',
            message: 'Auto top-up is not available for this account yet',
          },
        },
        { status: 403 }
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
          engagementDiscountApplied: false,
          checkoutOfferApplied: false,
        },
      });
    }

    // 6. Get or create Stripe customer
    let customerId = await getOrCreateCustomerId(user, token);

    // 6.5. Detect country and resolve regional pricing
    const country =
      request.headers.get('CF-IPCountry') ||
      request.headers.get('cf-ipcountry') ||
      (serverEnv.ENV === 'test' ? request.headers.get('x-test-country') : null);
    const pricingConfig = getPricingRegion(country || '');
    const cachedGeo = parsePricingGeoSession(request.cookies.get(PRICING_GEO_COOKIE_NAME)?.value);
    const resolvedGeo = cachedGeo && (!country || cachedGeo.country === country) ? cachedGeo : null;
    const resolvedPricingRegion = resolvedGeo?.pricingRegion ?? pricingConfig.region;

    // 6.5b. If a bandit arm was selected by /api/geo, use its discount instead of the static config.
    // This is critical: the bandit may have shown the user a different discount than the static default,
    // so checkout must apply that same arm's discount to avoid a price mismatch.
    let regionalDiscountPercent = resolvedGeo?.discountPercent ?? pricingConfig.discountPercent;
    const banditArmIdStr =
      customMetadata.bandit_arm_id ??
      (resolvedGeo?.banditArmId ? String(resolvedGeo.banditArmId) : undefined);
    if (banditArmIdStr) {
      const armId = parseInt(banditArmIdStr, 10);
      if (!isNaN(armId) && armId > 0) {
        try {
          const { data: arm } = await supabaseAdmin
            .from('pricing_bandit_arms')
            .select('discount_percent, region, is_active')
            .eq('id', armId)
            .eq('is_active', true)
            .single();
          if (arm && arm.region === resolvedPricingRegion) {
            regionalDiscountPercent = arm.discount_percent;
          }
        } catch {
          // Bandit lookup is best-effort — fall back to static config
        }
      }
    }

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
              checkoutRegion: resolvedPricingRegion,
              discountPercent: regionalDiscountPercent,
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
    let checkoutOfferDiscountPercent = 0;
    const checkoutTrigger = validatedFunnelMetadata.checkout_trigger;

    // Resolve metadata early for engagement discount check
    const unifiedMetadata = resolvePlanOrPack(validatedPriceId);

    // Only check for engagement discount on credit pack purchases that were explicitly opened
    // from the engagement discount flow. This prevents hidden discounts from appearing in Stripe
    // when the modal/card price did not show them.
    if (
      resolvedPrice?.type === 'pack' &&
      !isTestMode &&
      checkoutTrigger === 'engagement_discount_banner'
    ) {
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

    // 6.8. Validate an optional rescue-offer token for checkout recovery (subscriptions and packs).
    // Invalid tokens are ignored rather than blocking checkout.
    if (offerToken && resolvedPrice && !isTestMode) {
      const offerVerification = verifyCheckoutRescueOffer({
        offerToken,
        userId: user.id,
        priceId: validatedPriceId,
      });

      if (offerVerification.valid) {
        checkoutOfferDiscountPercent = offerVerification.discountPercent || 0;
      } else {
        console.warn('[CHECKOUT_RESCUE_OFFER] Ignoring invalid or expired offer token', {
          userId: user.id,
          priceId: validatedPriceId,
        });
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
    // Engagement and rescue discounts stack on top of regional pricing.
    let lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];
    let effectiveDiscountPercent = regionalDiscountPercent;

    if (
      regionalDiscountPercent > 0 ||
      engagementDiscountPercent > 0 ||
      checkoutOfferDiscountPercent > 0
    ) {
      const originalPrice = await stripe.prices.retrieve(validatedPriceId);
      const productId =
        typeof originalPrice.product === 'string'
          ? originalPrice.product
          : originalPrice.product.id;

      let finalAmount = originalPrice.unit_amount!;

      if (regionalDiscountPercent > 0 && engagementDiscountPercent > 0) {
        finalAmount = calculateStackedDiscount(
          originalPrice.unit_amount!,
          regionalDiscountPercent,
          engagementDiscountPercent
        );
      } else if (regionalDiscountPercent > 0) {
        finalAmount = getDiscountedPriceInCents(finalAmount, regionalDiscountPercent);
      } else if (engagementDiscountPercent > 0) {
        finalAmount = getDiscountedPriceInCents(finalAmount, engagementDiscountPercent);
      }

      if (checkoutOfferDiscountPercent > 0) {
        finalAmount = getDiscountedPriceInCents(finalAmount, checkoutOfferDiscountPercent);
      }

      effectiveDiscountPercent = Math.max(
        0,
        Math.round(((originalPrice.unit_amount! - finalAmount) / originalPrice.unit_amount!) * 100)
      );

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

    const checkoutMetadata: Record<string, string> = {
      ...customMetadata,
      ...validatedExperimentMetadata,
      ...validatedFunnelMetadata,
      user_id: user.id,
      price_id: validatedPriceId,
      pricing_region: resolvedPricingRegion,
      discount_percent: regionalDiscountPercent.toString(),
      effective_discount_percent: effectiveDiscountPercent.toString(),
      // Track engagement discount for webhook redemption
      ...(engagementDiscountPercent > 0
        ? {
            engagement_discount_percent: engagementDiscountPercent.toString(),
            engagement_discount_applied: 'true',
          }
        : {}),
      ...(checkoutOfferDiscountPercent > 0
        ? {
            checkout_offer_percent: checkoutOfferDiscountPercent.toString(),
            checkout_offer_applied: 'true',
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
    };

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      client_reference_id: user.id,
      line_items: lineItems,
      mode: checkoutMode,
      ui_mode: uiMode,
      metadata: checkoutMetadata,
    };

    if (checkoutMode === 'payment') {
      sessionParams.payment_intent_data = {
        metadata: checkoutMetadata,
        ...(autoTopUp ? { setup_future_usage: 'off_session' as const } : {}),
      };
    }

    // Only add subscription_data for subscriptions
    if (resolvedPrice?.type === 'plan' && checkoutMode === 'subscription') {
      sessionParams.subscription_data = {
        metadata: {
          user_id: user.id,
          plan_key: unifiedMetadata?.key || '',
          ...validatedFunnelMetadata,
          ...validatedExperimentMetadata,
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

    // Include the auto-top-up rule in the request fingerprint. The consent
    // version itself is derived from that fingerprint and is added afterward.
    if (autoTopUp && resolvedPrice?.type === 'pack') {
      Object.assign(checkoutMetadata, {
        auto_top_up_threshold: autoTopUp.thresholdCredits.toString(),
        auto_top_up_pack_key: resolvedPrice.key,
      });
    }

    const checkoutIdempotency = await buildCheckoutIdempotencyKey({
      funnelAttemptId: validatedFunnelMetadata.funnel_attempt_id,
      sessionParams,
    });
    const autoTopUpConsentVersion = autoTopUp
      ? checkoutIdempotency
        ? consentVersionFromHash(checkoutIdempotency.hash)
        : crypto.randomUUID()
      : null;

    // Add the derived consent version after hashing to avoid a circular identity
    // dependency. The object is shared by session metadata and payment_intent_data metadata.
    if (autoTopUp && autoTopUpConsentVersion && resolvedPrice?.type === 'pack') {
      Object.assign(checkoutMetadata, {
        auto_top_up_consent_version: autoTopUpConsentVersion,
      });
    }

    if (autoTopUp && autoTopUpConsentVersion && resolvedPrice?.type === 'pack') {
      const { error: pendingError } = await supabaseAdmin
        .from('auto_top_up_checkout_consents')
        .upsert(
          {
            consent_version: autoTopUpConsentVersion,
            user_id: user.id,
            checkout_session_id: null,
            threshold_credits: autoTopUp.thresholdCredits,
            pack_key: resolvedPrice.key,
            stripe_price_id: validatedPriceId,
            stripe_customer_id: customerId,
            consented_at: new Date().toISOString(),
          },
          { onConflict: 'consent_version', ignoreDuplicates: true }
        );
      if (pendingError) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'AUTO_TOP_UP_SETUP_FAILED',
              message: 'Unable to save auto top-up consent',
            },
          },
          { status: 500 }
        );
      }
    }

    const clearPendingConsent = async (failureReason: string, checkoutSessionId?: string) => {
      if (!autoTopUpConsentVersion) return;
      const { error: consentError } = await supabaseAdmin
        .from('auto_top_up_checkout_consents')
        .delete()
        .eq('user_id', user.id)
        .eq('consent_version', autoTopUpConsentVersion);
      if (consentError) {
        console.error('[AUTO_TOP_UP_CONSENT_CLEANUP_FAILED]', consentError);
      }
      // Clean up pending rows created by an older deployment without touching
      // a currently active setting.
      await supabaseAdmin
        .from('auto_top_up_settings')
        .update({
          pending_enabled: false,
          failure_reason: failureReason,
          ...(checkoutSessionId ? { checkout_session_id: checkoutSessionId } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('consent_version', autoTopUpConsentVersion)
        .eq('pending_enabled', true);
    };

    let session: Stripe.Checkout.Session;
    const createStripeCheckoutSession = (idempotencySuffix = '') => {
      if (!checkoutIdempotency) return stripe.checkout.sessions.create(sessionParams);
      return stripe.checkout.sessions.create(sessionParams, {
        idempotencyKey: `${checkoutIdempotency.key}${idempotencySuffix}`,
      });
    };

    try {
      session = await createStripeCheckoutSession();
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
        customerId = freshCustomer.id;
        sessionParams.customer = freshCustomer.id;
        try {
          session = await createStripeCheckoutSession(':customer-retry');
        } catch (retryError) {
          await clearPendingConsent('checkout_session_retry_failed');
          throw retryError;
        }
      } else {
        await clearPendingConsent('checkout_session_failed');
        throw sessionError;
      }
    }

    if (autoTopUp && autoTopUpConsentVersion) {
      const { data: attachedConsent, error: settingsError } = await supabaseAdmin
        .from('auto_top_up_checkout_consents')
        .update({
          checkout_session_id: session.id,
          stripe_customer_id: customerId,
        })
        .eq('user_id', user.id)
        .eq('consent_version', autoTopUpConsentVersion)
        .select('user_id')
        .maybeSingle();
      if (settingsError || !attachedConsent) {
        try {
          await stripe.checkout.sessions.expire(session.id);
        } catch {
          await clearPendingConsent('orphaned_session_expiration_failed', session.id);
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'AUTO_TOP_UP_SESSION_CLEANUP_FAILED',
                message: 'Checkout cleanup is pending reconciliation',
              },
            },
            { status: 503 }
          );
        }
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'AUTO_TOP_UP_SETUP_FAILED',
              message: 'Auto top-up consent changed before checkout completed',
            },
          },
          { status: 409 }
        );
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
        pricingRegion: resolvedPricingRegion,
        discountPercent: regionalDiscountPercent,
        funnelSchemaVersion: validatedFunnelMetadata.funnel_schema_version,
        funnelAttemptId: validatedFunnelMetadata.funnel_attempt_id,
        entrySurface: validatedFunnelMetadata.entry_surface,
        trigger: validatedFunnelMetadata.checkout_trigger,
        originatingModel: validatedFunnelMetadata.checkout_originating_model,
        originatingTrigger: validatedFunnelMetadata.checkout_originating_trigger,
        attributionChain: validatedFunnelMetadata.checkout_attribution_chain
          ?.split(',')
          .filter(Boolean),
        experimentKey: validatedExperimentMetadata[EXPERIMENT_CHECKOUT_METADATA_KEYS.experimentKey],
        experimentContextKey:
          validatedExperimentMetadata[EXPERIMENT_CHECKOUT_METADATA_KEYS.experimentContextKey],
        experimentArmId: validatedExperimentMetadata[
          EXPERIMENT_CHECKOUT_METADATA_KEYS.experimentArmId
        ]
          ? Number(validatedExperimentMetadata[EXPERIMENT_CHECKOUT_METADATA_KEYS.experimentArmId])
          : undefined,
        experimentArmKey:
          validatedExperimentMetadata[EXPERIMENT_CHECKOUT_METADATA_KEYS.experimentArmKey],
        experimentAssignmentKey:
          validatedExperimentMetadata[EXPERIMENT_CHECKOUT_METADATA_KEYS.experimentAssignmentKey],
        firstTouchSource: validatedFunnelMetadata.first_touch_source,
        firstTouchMedium: validatedFunnelMetadata.first_touch_medium,
        firstTouchLandingPage: validatedFunnelMetadata.first_touch_landing_page,
        landingPageFamily: validatedFunnelMetadata.landing_page_family,
        deviceType: validatedFunnelMetadata.device_type,
        isPseoLanding:
          validatedFunnelMetadata.is_pseo_landing === undefined
            ? undefined
            : validatedFunnelMetadata.is_pseo_landing === 'true',
        checkoutAuthenticated: true,
      },
      { apiKey: serverEnv.AMPLITUDE_API_KEY, userId: user.id }
    );

    await getRevenueRecoveryService()
      .persistCheckoutIntentContext({
        userId: user.id,
        priceId: validatedPriceId,
        purchaseType: resolvedPrice?.type === 'pack' ? 'credit_pack' : 'subscription',
        selectedKey: unifiedMetadata?.key,
        pricingRegion: resolvedPricingRegion,
        stripeCheckoutSessionId: session.id,
      })
      .catch(error => {
        console.warn('[RECOVERY_INTENT] Failed to persist checkout intent context', {
          userId: user.id,
          sessionId: session.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    // 8. Return the session data
    return NextResponse.json({
      success: true,
      data: {
        url: session.url,
        sessionId: session.id,
        clientSecret: session.client_secret, // Required for embedded checkout
        engagementDiscountApplied: engagementDiscountPercent > 0,
        checkoutOfferApplied: checkoutOfferDiscountPercent > 0,
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
