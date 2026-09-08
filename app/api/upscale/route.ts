import { createHmac } from 'node:crypto';
import type { ModelId, QualityTier } from '@/shared/types/coreflow.types';
import {
  BoundedJsonBodyTooLargeError,
  readBoundedJsonBody,
} from '@server/http/read-bounded-json-body';
import { trackServerEvent } from '@server/analytics';
import { createLogger } from '@server/monitoring/logger';
import { upscaleRateLimit } from '@server/rateLimit';
import { ensureAntiFreeloaderProfile } from '@server/services/anti-freeloader.service';
import {
  getAutoEligibleModels,
  isAutoModelCompatible,
} from '@server/services/auto-model-selection';
import { ModelRegistry } from '@server/services/model-registry';
import type { SubscriptionTier } from '@server/services/model-registry.types';
import { providerHealthService } from '@server/services/provider-health.service';
import { resolveUpscaleInput } from '@server/services/upscale-input-storage.service';
import {
  getScalePreservingFallbackCandidates,
  resolveScalePreservingModel,
} from '@server/services/scale-preserving-model';
import {
  createUpscaleRequestFingerprint,
  UpscaleJobError,
  upscaleJobService,
  type IUpscaleAdmissionResult,
} from '@server/services/upscale-job.service';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { serverEnv, isProduction } from '@shared/config/env';
import { MODEL_COSTS } from '@shared/config/model-costs.config';
import {
  AUTO_UPSCALE_MAX_RESERVATION_CREDITS,
  calculateFinalProviderAwareCredits,
  getHourlyProcessingLimit,
  getModelForTier,
  modelIdToTier,
  resolveEffectiveResolution,
} from '@shared/config/subscription.utils';
import { isAccountSetupPending, isFreeleaderBlocked } from '@/lib/anti-freeloader/check-freeloader';
import { ErrorCodes, createErrorResponse } from '@shared/utils/errors';
import {
  decodeImageDimensions,
  IMAGE_VALIDATION,
  upscaleSchema,
  validateImageDimensions,
  validateMagicBytes,
} from '@shared/validation/upscale.schema';
import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';

const TEMPORARY_PROCESSING_UNAVAILABLE_MESSAGE =
  'Image processing is temporarily unavailable. Your credits have not been charged. Please try again shortly.';
function isPaidSubscriptionStatus(status: string | null | undefined): boolean {
  return status === 'active' || status === 'trialing';
}

function normalizePaidTier(tier: string | null | undefined): SubscriptionTier {
  // 'starter' is an alias for 'hobby' (the lowest paid tier)
  if (tier === 'starter' || tier === 'hobby' || tier === 'pro' || tier === 'business') {
    return tier === 'starter' ? 'hobby' : tier;
  }
  return 'hobby';
}

function isDurableUpscaleCohort(userId: string): boolean {
  if (!serverEnv.UPSCALE_DURABLE_EXECUTION_ENABLED) return false;
  const percent = serverEnv.UPSCALE_DURABLE_COHORT_PERCENT;
  if (percent <= 0) return false;
  if (percent >= 100) return true;

  let hash = 2166136261;
  for (const character of userId) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100 < percent;
}

async function wakeDurableExecutor(): Promise<void> {
  const baseUrl = serverEnv.UPSCALE_EXECUTOR_BASE_URL;
  const secret = serverEnv.UPSCALE_EXECUTOR_WAKE_SECRET ?? serverEnv.UPSCALE_EXECUTOR_SHARED_SECRET;
  if (!baseUrl || !secret) return;

  const body = JSON.stringify({ limit: 50 });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1_500);
  try {
    await fetch(`${baseUrl.replace(/\/$/, '')}/wake`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Executor-Timestamp': timestamp,
        'X-Executor-Signature': `sha256=${signature}`,
      },
      body,
      signal: controller.signal,
    });
  } catch {
    // Admission is durable and the scheduler is authoritative; a best-effort
    // wake must never turn a committed job into a failed request.
  } finally {
    clearTimeout(timeout);
  }
}

function admissionResponse(admission: IUpscaleAdmissionResult): NextResponse {
  return NextResponse.json(
    {
      success: true,
      accepted: true,
      jobId: admission.jobId,
      status: admission.stage,
      statusUrl: admission.statusUrl,
      retryAfterMs: admission.retryAfterMs,
      processing: {
        reservationJobId: admission.jobId,
        creditsUsed: admission.exactCharge,
        creditsRemaining: admission.creditsRemaining,
      },
    },
    {
      status: admission.httpStatus,
      headers: {
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Upscale-Protocol': '2',
        ...(admission.retryAfterMs > 0
          ? { 'Retry-After': String(Math.ceil(admission.retryAfterMs / 1000)) }
          : {}),
      },
    }
  );
}

async function trackCreditWallShown(
  userId: string,
  requiredCredits: number,
  currentBalance: number
): Promise<void> {
  await trackServerEvent(
    'credit_wall_shown',
    {
      source: 'server_402',
      requiredCredits,
      currentBalance,
      deficit: Math.max(0, requiredCredits - currentBalance),
    },
    { apiKey: serverEnv.AMPLITUDE_API_KEY, userId }
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const logger = createLogger(req, 'upscale-api');
  let userId: string | undefined;
  let jobId: string | undefined;
  let creditCost = 1;
  let effectiveTotalCredits: number | undefined;
  let isPaidUser = false;
  let requestedQualityTier: QualityTier | undefined;
  let requestedScale: 2 | 4 | 8 | undefined;
  let resolvedTier: QualityTier | undefined;
  let resolvedModelId: ModelId | undefined;
  let inputDimensions: { width: number; height: number } | null = null;
  let admissionAttempted = false;
  const logFailure = (
    reason: string,
    details: Record<string, unknown> = {},
    level: 'warn' | 'error' = 'warn'
  ) => {
    logger[level]('Upscale admission rejected', {
      reason,
      jobId,
      userId,
      requestedQualityTier,
      requestedScale,
      ...details,
    });
  };
  try {
    userId = req.headers.get('X-User-Id') || undefined;
    if (!userId)
      return NextResponse.json(
        createErrorResponse(ErrorCodes.UNAUTHORIZED, 'Authentication required', 401).body,
        { status: 401 }
      );

    // Metadata is bounded before any database or provider-related work.
    const validatedInput = upscaleSchema.parse(
      await readBoundedJsonBody(req, IMAGE_VALIDATION.MAX_REQUEST_BYTES)
    );
    jobId = validatedInput.jobId;
    if (req.headers.get('X-Upscale-Protocol') !== '2') {
      return NextResponse.json(
        createErrorResponse(
          'UPDATE_REQUIRED',
          'Refresh this page to continue processing images.',
          426
        ).body,
        { status: 426 }
      );
    }
    const tailJobId = req.headers.get('x-upscale-job-id');
    if (tailJobId && tailJobId !== jobId) {
      return NextResponse.json(
        createErrorResponse(
          ErrorCodes.VALIDATION_ERROR,
          'Invalid processing reservation correlation',
          400
        ).body,
        { status: 400 }
      );
    }
    const requestFingerprint = createUpscaleRequestFingerprint(validatedInput);
    // Replay uses the original immutable plan, even if balance, model settings,
    // admission limits, or the rollout gate have changed since the first POST.
    const replay = await upscaleJobService.getReplay(userId, jobId, requestFingerprint);
    if (replay) return admissionResponse(replay);
    if (!isDurableUpscaleCohort(userId) || !serverEnv.UPSCALE_EXECUTOR_BASE_URL) {
      return NextResponse.json(
        createErrorResponse(
          ErrorCodes.AI_UNAVAILABLE,
          TEMPORARY_PROCESSING_UNAVAILABLE_MESSAGE,
          503,
          { retryable: true, admissionPaused: true, noDebit: true, jobId }
        ).body,
        { status: 503, headers: { 'Retry-After': '10', 'Cache-Control': 'no-store' } }
      );
    }
    // Read the durable grant decision first. If setup commits concurrently, the
    // following profile read will see either the granted balance or remain pending.
    const { data: grantDecision, error: grantDecisionError } = await supabaseAdmin
      .from('free_credit_grants')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (grantDecisionError && !(serverEnv.ENV === 'test' && userId.startsWith('mock_user_'))) {
      logFailure('account_setup_decision_lookup_failed', {}, 'error');
      const { body, status } = createErrorResponse(
        ErrorCodes.INTERNAL_ERROR,
        'Unable to verify account setup. Please try again shortly.',
        503
      );
      return NextResponse.json(body, { status });
    }

    // 3. Get user's subscription status and tier to determine limits.
    // Also check purchased_credits_balance to grant paid model access to credit purchasers.
    const { data: rawProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select(
        'subscription_status, subscription_tier, subscription_credits_balance, purchased_credits_balance, is_flagged_freeloader, region_tier, signup_country, created_at'
      )
      .eq('id', userId)
      .single();

    if (profileError && !(serverEnv.ENV === 'test' && userId.startsWith('mock_user_'))) {
      logFailure('account_profile_lookup_failed', {}, 'error');
      const { body, status } = createErrorResponse(
        ErrorCodes.INTERNAL_ERROR,
        'Unable to verify account setup. Please try again shortly.',
        503
      );
      return NextResponse.json(body, { status });
    }

    // In test mode, mock users don't exist in the database.
    // Build a synthetic profile so that tests don't get 402 due to missing credits.
    // Subscription info is encoded in the userId as: mock_user_{uuid}_sub_{status}_{tier}
    const effectiveRawProfile = (() => {
      if (serverEnv.ENV !== 'test') return rawProfile;
      if (rawProfile !== null) return rawProfile;
      if (!userId.startsWith('mock_user_')) return rawProfile;

      let subscriptionStatus: string | null = null;
      let subscriptionTier: string | null = null;

      const subMatch = userId.match(/_sub_([^_]+)_([^_]+)$/);
      if (subMatch) {
        subscriptionStatus = subMatch[1];
        subscriptionTier = subMatch[2];
      }

      const isActiveSub = subscriptionStatus === 'active' || subscriptionStatus === 'trialing';

      return {
        subscription_status: subscriptionStatus,
        subscription_tier: subscriptionTier,
        // Subscription users get credits in subscription_credits_balance;
        // free mock users get a generous purchased_credits_balance so they can process images.
        subscription_credits_balance: isActiveSub ? 1000 : 0,
        purchased_credits_balance: isActiveSub ? 0 : 1000,
        is_flagged_freeloader: false,
        region_tier: null,
        signup_country: null,
        created_at: new Date().toISOString(),
      };
    })();

    const profile = await ensureAntiFreeloaderProfile(req, userId, effectiveRawProfile, {
      persist: false,
    });

    if (isAccountSetupPending(profile, Boolean(grantDecision))) {
      logFailure('account_setup_pending');
      const { body, status } = createErrorResponse(
        ErrorCodes.ACCOUNT_SETUP_PENDING,
        'Your account setup is still completing. Please try again shortly.',
        409
      );
      return NextResponse.json(body, { status });
    }

    // Apply rate limits only after setup has reached a terminal decision.
    const { success: rateLimitOk, remaining, reset } = await upscaleRateLimit.limit(userId);
    if (!rateLimitOk) {
      logFailure('rate_limited', {
        remaining,
        resetAt: new Date(reset).toISOString(),
      });

      await trackServerEvent(
        'rate_limit_exceeded',
        {
          errorType: 'rate_limited',
          limit: 5,
          windowMs: 60000,
          retryAfter: Math.ceil((reset - Date.now()) / 1000),
        },
        { apiKey: serverEnv.AMPLITUDE_API_KEY, userId }
      );

      const retryAfter = Math.ceil((reset - Date.now()) / 1000);
      const { body, status } = createErrorResponse(
        ErrorCodes.RATE_LIMITED,
        'Too many image processing requests. Please wait before trying again.',
        429,
        { retryAfter }
      );
      return NextResponse.json(body, {
        status,
        headers: {
          'X-RateLimit-Limit': '5',
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': new Date(reset).toISOString(),
          'Retry-After': retryAfter.toString(),
        },
      });
    }

    // 3a. Block flagged free-tier users before any credit-consuming work
    // Dev bypass: fingerprint detection fires on localhost/dev where IPs are shared,
    // so skip the block outside production to allow free-user testing.
    if (isProduction() && isFreeleaderBlocked(profile)) {
      logFailure('account_restricted_freeloader');
      return NextResponse.json(
        {
          error: {
            code: 'ACCOUNT_RESTRICTED',
            message:
              'Multiple accounts detected on your device. Upgrade to a paid plan to continue.',
          },
        },
        { status: 403 }
      );
    }

    const subscriptionStatus = profile?.subscription_status ?? null;
    const hasActiveSubscription = isPaidSubscriptionStatus(subscriptionStatus);
    const hasPurchasedCredits = (profile?.purchased_credits_balance ?? 0) > 0;
    const hasPaidPlanHistory =
      profile?.subscription_tier !== null &&
      profile?.subscription_tier !== undefined &&
      profile.subscription_tier !== 'free';

    // Current or former paid users retain paid model-access classification.
    isPaidUser = hasActiveSubscription || hasPurchasedCredits || hasPaidPlanHistory;

    // Determine tier: subscription tier takes precedence, otherwise 'hobby' for credit purchasers
    const userTier = hasActiveSubscription
      ? normalizePaidTier(profile?.subscription_tier)
      : hasPurchasedCredits
        ? 'hobby'
        : null;

    const providerAvailability = await providerHealthService.getAvailability();
    if (!providerAvailability.available) {
      logFailure('provider_circuit_open', {
        circuitStatus: providerAvailability.status,
        retryAt: providerAvailability.retryAt?.toISOString(),
      });
      const { body, status } = createErrorResponse(
        ErrorCodes.AI_UNAVAILABLE,
        TEMPORARY_PROCESSING_UNAVAILABLE_MESSAGE,
        503,
        {
          providerUnavailable: true,
          suppressPurchaseCtas: true,
          retryAt: providerAvailability.retryAt?.toISOString(),
        }
      );
      return NextResponse.json(body, { status });
    }

    const configuredBatchLimit = getHourlyProcessingLimit(userTier);
    const batchLimit = Number.isFinite(configuredBatchLimit) ? configuredBatchLimit : 1_000_000;
    requestedQualityTier = validatedInput.config.qualityTier;
    requestedScale = validatedInput.config.scale;
    const storedInput = await resolveUpscaleInput({
      userId,
      storagePath: validatedInput.storagePath,
      claimedMimeType: validatedInput.mimeType,
      isPaidUser,
    });
    const validationImageData = storedInput.validationImageData;
    const inputFileSizeBytes = storedInput.sizeBytes;

    // Note: User tier validation now happens in the 3-branch logic section

    // 8a. Resolve the real image format from magic bytes. The client-supplied MIME is
    // only a hint — the detected type is what we validate against and use downstream.
    const magicValidation = validateMagicBytes(validationImageData, validatedInput.mimeType);
    if (!magicValidation.valid) {
      logFailure('magic_bytes_validation_failed', {
        claimedMime: validatedInput.mimeType,
        detectedMime: magicValidation.detectedMimeType,
      });
      const { body: errorBody, status } = createErrorResponse(
        ErrorCodes.VALIDATION_ERROR,
        magicValidation.error || 'Invalid image format',
        400
      );
      return NextResponse.json(errorBody, { status });
    }

    // 8a-ii. Enforce the allowlist against the detected format, not the claimed one.
    const detectedMimeType = magicValidation.detectedMimeType ?? validatedInput.mimeType;
    if (!(IMAGE_VALIDATION.ALLOWED_TYPES as readonly string[]).includes(detectedMimeType)) {
      logFailure('unsupported_image_format', {
        claimedMime: validatedInput.mimeType,
        detectedMime: detectedMimeType,
      });
      const { body: errorBody, status } = createErrorResponse(
        ErrorCodes.VALIDATION_ERROR,
        `Unsupported image format: ${detectedMimeType}`,
        400
      );
      return NextResponse.json(errorBody, { status });
    }

    // Downstream consumers must see the true format, not what the browser guessed.
    const effectiveMimeType = detectedMimeType as typeof validatedInput.mimeType;

    // 8b. Decode and validate input dimensions
    inputDimensions = decodeImageDimensions(validationImageData);
    if (inputDimensions) {
      const dimValidation = validateImageDimensions(inputDimensions.width, inputDimensions.height);
      if (!dimValidation.valid) {
        logFailure('dimension_validation_failed', {
          width: inputDimensions.width,
          height: inputDimensions.height,
          validationError: dimValidation.error,
        });
        const { body: errorBody, status } = createErrorResponse(
          ErrorCodes.VALIDATION_ERROR,
          dimValidation.error || 'Image dimensions out of range',
          400
        );
        return NextResponse.json(errorBody, { status });
      }
    } else {
      throw new UpscaleJobError(
        ErrorCodes.INVALID_DIMENSIONS,
        'Image dimensions could not be verified. Please upload a PNG, JPEG, or WebP image.',
        400
      );
    }

    // 9. Validate premium tier restrictions for free users
    const config = validatedInput.config;
    const premiumTiers = MODEL_COSTS.PREMIUM_QUALITY_TIERS as readonly QualityTier[];

    // Block free users from premium tiers
    if (!isPaidUser && config.qualityTier !== 'auto' && premiumTiers.includes(config.qualityTier)) {
      logFailure('premium_tier_requires_paid', {
        tier: config.qualityTier,
      });
      const { body: errorBody, status } = createErrorResponse(
        ErrorCodes.FORBIDDEN,
        `Quality tier "${config.qualityTier}" requires a paid subscription. Please upgrade or select Quick or Face Restore tier.`,
        403
      );
      return NextResponse.json(errorBody, { status });
    }

    // Block free users from Smart AI Analysis
    if (
      !isPaidUser &&
      MODEL_COSTS.SMART_ANALYSIS_REQUIRES_PAID &&
      config.qualityTier !== 'auto' &&
      config.additionalOptions.smartAnalysis
    ) {
      logFailure('smart_analysis_requires_paid');
      const { body: errorBody, status } = createErrorResponse(
        ErrorCodes.FORBIDDEN,
        'Smart AI Analysis requires a paid subscription. Please upgrade or disable this feature.',
        403
      );
      return NextResponse.json(errorBody, { status });
    }

    const modelRegistry = ModelRegistry.getInstance();
    const eligibleModels = getAutoEligibleModels(
      modelRegistry.getModelsByTier(userTier || 'free'),
      config.scale
    );
    const deferredAnalysis =
      config.qualityTier === 'auto' || config.additionalOptions.smartAnalysis;
    if (config.qualityTier === 'auto') {
      const candidate = [...eligibleModels].sort(
        (a, b) => a.creditMultiplier - b.creditMultiplier
      )[0];
      if (!candidate)
        throw new UpscaleJobError(
          ErrorCodes.MODEL_NOT_SUPPORTED,
          'No model is available for this scale.',
          400
        );
      resolvedModelId = candidate.id as ModelId;
      resolvedTier = modelIdToTier(resolvedModelId);
    } else {
      resolvedTier = config.qualityTier;
      resolvedModelId = (getModelForTier(resolvedTier) || 'real-esrgan') as ModelId;
    }
    // Preserve the billing promise from the user's selected tier. If the default
    // Quick model cannot fit a 2x source at its provider GPU limit, route the
    // processing internally to the tiled model without charging a premium-tier cost.
    const billingModelId = resolvedModelId;
    if (inputDimensions) {
      const scaleSafeModel = resolveScalePreservingModel({
        modelId: resolvedModelId,
        width: inputDimensions.width,
        height: inputDimensions.height,
        scale: config.scale,
      });
      // Preserve the better historical output for customers who have paid;
      // free requests retain the economical fallback order.
      const fallbackCandidates = getScalePreservingFallbackCandidates(isPaidUser);
      const availableFallbackId = scaleSafeModel.usedFallback
        ? fallbackCandidates.find(candidateId => modelRegistry.getModel(candidateId)?.isEnabled)
        : undefined;

      if (availableFallbackId) {
        logger.info('Using scale-preserving model fallback', {
          userId,
          requestedModelId: resolvedModelId,
          processingModelId: availableFallbackId,
          inputWidth: inputDimensions.width,
          inputHeight: inputDimensions.height,
          requestedScale: config.scale,
        });
        resolvedModelId = availableFallbackId;
      } else if (scaleSafeModel.usedFallback) {
        logger.warn('Scale-preserving model fallback unavailable', {
          userId,
          requestedModelId: resolvedModelId,
          fallbackModelId: scaleSafeModel.modelId,
        });
      }
    }

    // Validate model is available for user's subscription tier
    const selectedModel = modelRegistry.getModel(resolvedModelId);
    const isInternalScaleFallback = resolvedModelId !== billingModelId;
    if (!selectedModel || !selectedModel.isEnabled) {
      logFailure(
        'resolved_model_unavailable',
        { modelId: resolvedModelId, requestedQualityTier },
        'error'
      );
      const { body: errorBody, status } = createErrorResponse(
        ErrorCodes.INTERNAL_ERROR,
        'Unable to process image with selected quality tier. Please try again.',
        500
      );
      return NextResponse.json(errorBody, { status });
    }

    // Check if model requires higher subscription tier
    if (selectedModel.tierRestriction && !isInternalScaleFallback) {
      const minRequiredTier = normalizePaidTier(selectedModel.tierRestriction);
      const userTierForModels = isPaidUser ? userTier : 'free';

      // Tier hierarchy: free < hobby < pro < business
      const tierLevels: Record<string, number> = { free: 0, hobby: 1, pro: 2, business: 3 };
      const userLevel = tierLevels[userTierForModels || 'free'] ?? 0;
      const requiredLevel = tierLevels[minRequiredTier] ?? 0;

      if (userLevel < requiredLevel) {
        logFailure('model_tier_restricted', {
          modelId: resolvedModelId,
          userTier: userTierForModels,
          requiredTier: minRequiredTier,
        });
        const { body: errorBody, status } = createErrorResponse(
          ErrorCodes.FORBIDDEN,
          `Quality tier "${resolvedTier}" requires ${minRequiredTier} subscription or higher. Please upgrade your subscription or select a different tier.`,
          403
        );
        return NextResponse.json(errorBody, { status });
      }
    }

    // Enhancement-only models accept the neutral 2x request value only. Although
    // they do not perform scaling, rejecting 4x/8x prevents those values from
    // leaking into provider output-size parameters.
    if (!isAutoModelCompatible(selectedModel, config.scale)) {
      logFailure('scale_not_supported', {
        tier: resolvedTier,
        modelId: resolvedModelId,
        requestedScale: config.scale,
        supportedScales: selectedModel.supportedScales,
      });

      const is8xRequest = config.scale === 8;
      const supports8x = selectedModel.supportedScales.includes(8);

      let errorMessage = `Scale ${config.scale}x is not available for ${resolvedTier} tier.`;
      if (is8xRequest && !supports8x) {
        errorMessage += ' Use HD Upscale tier for 8x upscaling.';
      } else if (selectedModel.supportedScales.length > 0) {
        errorMessage += ` Supported scales: ${selectedModel.supportedScales.join('x, ')}x.`;
      } else {
        errorMessage += ' This enhancement-only tier requires the default 2x request setting.';
      }

      const { body: errorBody, status } = createErrorResponse(
        ErrorCodes.VALIDATION_ERROR,
        errorMessage,
        400
      );
      return NextResponse.json(errorBody, { status });
    }

    // 10a. Validate per-model pixel limits (defense in depth)
    // Even if client-side validation is bypassed, server should reject oversized images
    if (inputDimensions) {
      const pixels = inputDimensions.width * inputDimensions.height;
      const maxPixels = modelRegistry.getMaxInputPixels(resolvedModelId);

      if (pixels > maxPixels) {
        logFailure('image_exceeds_model_pixel_limit', {
          width: inputDimensions.width,
          height: inputDimensions.height,
          pixels,
          modelId: resolvedModelId,
          maxPixels,
        });

        const twoXAlternative = resolveScalePreservingModel({
          modelId: billingModelId,
          width: inputDimensions.width,
          height: inputDimensions.height,
          scale: 2,
        });
        const canChooseTwoX =
          config.scale !== 2 &&
          twoXAlternative.usedFallback &&
          modelRegistry.getModel(twoXAlternative.modelId)?.isEnabled;
        const nextStep = canChooseTwoX
          ? 'Choose 2x for this original image.'
          : 'Upload a smaller original for this processing mode.';

        const { body: errorBody, status } = createErrorResponse(
          ErrorCodes.IMAGE_TOO_LARGE,
          `The selected ${config.scale}x scale cannot process the original image dimensions (${inputDimensions.width}×${inputDimensions.height}) without shrinking the source. ${nextStep}`,
          422,
          {
            width: inputDimensions.width,
            height: inputDimensions.height,
            pixels,
            maxPixels,
          }
        );
        return NextResponse.json(errorBody, { status });
      }
    }

    // Calculate credit cost using provider-aware pricing for new models,
    // falling back to tier-based scale multiplier for legacy models.
    const effectiveResolution = resolveEffectiveResolution(
      billingModelId,
      config.scale,
      config.nanoBananaProConfig?.resolution
    );
    const smartAnalysisEnabledForBilling =
      config.qualityTier !== 'auto' && config.additionalOptions.smartAnalysis;
    const providerAware = calculateFinalProviderAwareCredits({
      modelId: billingModelId,
      qualityTier: resolvedTier,
      scale: config.scale,
      inputWidth: inputDimensions?.width,
      inputHeight: inputDimensions?.height,
      smartAnalysis: smartAnalysisEnabledForBilling,
      targetResolution: config.targetResolution,
      effectiveResolution,
    });
    // The shared provider-aware calculator includes model-specific multipliers
    // for models that do not own a dedicated quality tier.
    creditCost =
      config.qualityTier === 'auto'
        ? AUTO_UPSCALE_MAX_RESERVATION_CREDITS
        : providerAware.finalCredits;

    effectiveTotalCredits =
      (profile?.subscription_credits_balance ?? 0) + (profile?.purchased_credits_balance ?? 0);
    if (effectiveTotalCredits < creditCost) {
      logFailure('insufficient_effective_credits', {
        requiredCredits: creditCost,
        effectiveTotalCredits,
      });
      await trackCreditWallShown(userId, creditCost, effectiveTotalCredits);
      const { body, status } = createErrorResponse(
        ErrorCodes.INSUFFICIENT_CREDITS,
        `You have insufficient credits. This operation requires ${creditCost} credit${creditCost > 1 ? 's' : ''}.`,
        402,
        { required: creditCost, available: effectiveTotalCredits }
      );
      return NextResponse.json(body, { status });
    }

    const requestConfig = {
      ...config,
      enhancementPrompt: validatedInput.enhancementPrompt,
      requestedQualityTier: config.qualityTier,
      executionPlan: {
        deferredAnalysis,
        userTier: userTier || 'free',
        isPaidUser,
        allowedModelIds: eligibleModels.map(model => model.id),
        reservedMaximumCredits: creditCost,
      },
    };
    admissionAttempted = true;
    const admission = await upscaleJobService.admit({
      userId,
      jobId,
      requestFingerprint,
      requestConfig,
      inputObjectPath: validatedInput.storagePath,
      inputMimeType: effectiveMimeType,
      inputSizeBytes: inputFileSizeBytes,
      inputWidth: inputDimensions?.width ?? null,
      inputHeight: inputDimensions?.height ?? null,
      scale: config.scale,
      selectionMode: config.qualityTier === 'auto' ? 'auto' : 'explicit',
      requestedQualityTier: config.qualityTier,
      resolvedQualityTier: resolvedTier,
      billingModelId,
      resolvedModelId,
      resolvedProvider: deferredAnalysis ? 'deferred' : selectedModel.provider,
      resolvedModelVersion: selectedModel.modelVersion,
      exactCharge: creditCost,
      batchLimit,
      deadlineAt: new Date(Date.now() + serverEnv.UPSCALE_EXECUTION_DEADLINE_SECONDS * 1000),
      submissionDeadlineAt: new Date(
        Date.now() + serverEnv.UPSCALE_SUBMISSION_DEADLINE_SECONDS * 1000
      ),
      buildId: serverEnv.UPSCALE_BUILD_ID,
    });
    logger.info('admitted', {
      jobId,
      userId,
      model: resolvedModelId,
      provider: selectedModel.provider,
      edgeVersion: serverEnv.UPSCALE_BUILD_ID,
    });
    // These are advisory. The transaction/outbox owns all post-commit recovery.
    void wakeDurableExecutor();
    return admissionResponse(admission);
  } catch (error) {
    if (error instanceof UpscaleJobError) {
      return NextResponse.json(
        createErrorResponse(error.code, error.message, error.statusCode, error.details).body,
        { status: error.statusCode, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    if (error instanceof BoundedJsonBodyTooLargeError) {
      return NextResponse.json(
        createErrorResponse(
          ErrorCodes.VALIDATION_ERROR,
          'This request is too large to process. Please retry with metadata only.',
          413
        ).body,
        { status: 413 }
      );
    }
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return NextResponse.json(
        createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid request data', 400).body,
        { status: 400 }
      );
    }
    logger.error('Upscale admission unavailable', {
      jobId,
      admissionAttempted,
      exception: error instanceof Error ? error.name : typeof error,
      frames:
        error instanceof Error
          ? error.stack
              ?.split('\n')
              .slice(1, 4)
              .map(frame => frame.trim().replace(/\?.*$/, ''))
          : undefined,
    });
    // A lost database response may follow a committed transaction. Do not
    // refund or delete the input; the browser recovers this exact job ID.
    return NextResponse.json(
      createErrorResponse(
        ErrorCodes.INTERNAL_ERROR,
        'Unable to confirm image processing. Reconnecting to your job.',
        503,
        { jobId, retryable: true }
      ).body,
      { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '2' } }
    );
  } finally {
    await logger.flush();
  }
}
