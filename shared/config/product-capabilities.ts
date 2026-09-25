import {
  getFreeCreditsForTier,
  getRegionTier,
  type RegionTier,
} from '@/lib/anti-freeloader/region-classifier';
import { IMAGE_VALIDATION } from '@shared/validation/upscale.schema';
import { CREDIT_COSTS, MODEL_CREDIT_COSTS } from './credits.config';
import { MODEL_COSTS } from './model-costs.config';
import { SUBSCRIPTION_CONFIG } from './subscription.config';

const FORMAT_LABEL_BY_MIME = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'image/heic': 'HEIC',
} as const satisfies Record<(typeof IMAGE_VALIDATION.ALLOWED_TYPES)[number], string>;

const directUploadMimeTypes = IMAGE_VALIDATION.ALLOWED_TYPES;
const directUploadFormats = directUploadMimeTypes.map(mime => FORMAT_LABEL_BY_MIME[mime]);

/**
 * Public product facts used by acquisition surfaces.
 *
 * Values that already exist in a product/runtime config are referenced here rather than
 * retyped. This module is the bridge between those runtime facts and SEO/landing copy.
 */
export const PRODUCT_CAPABILITIES = {
  guestAccess: false,
  animatedGifSupported: false,
  directUploadMimeTypes,
  directUploadFormats,
  conversionOnlyFormats: [] as readonly string[],
  maxScalePerPass: MODEL_COSTS.MAX_SCALE_PREMIUM,
  batchLimits: {
    free: SUBSCRIPTION_CONFIG.freeUser.batchLimit,
    plans: Object.fromEntries(
      SUBSCRIPTION_CONFIG.plans.map(plan => [plan.key, plan.batchLimit] as const)
    ) as Readonly<Record<string, number | null>>,
  },
  creditCosts: {
    baseUpscale: CREDIT_COSTS.BASE_UPSCALE_COST,
    byModel: MODEL_CREDIT_COSTS,
  },
} as const;

export function welcomeCreditsForTier(tier: RegionTier): number {
  return getFreeCreditsForTier(tier);
}

export function welcomeCreditsFor(countryCode: string | null | undefined): number {
  return welcomeCreditsForTier(getRegionTier(countryCode ?? ''));
}

export function welcomeCreditCopy(credits: number | null | undefined): string {
  if (credits === null || credits === undefined) return 'Free credits on signup';
  if (credits <= 0) return 'Plans available in your region';
  return `${credits} free credits`;
}

/**
 * Localized counterpart of {@link welcomeCreditCopy}: the `homepage` message key
 * for the regional eligibility case. Callers render it with `{ credits }`.
 */
export function welcomeCreditOfferKey(
  credits: number | null | undefined
): 'creditOfferUnknown' | 'creditOfferNone' | 'creditOfferCount' {
  if (credits === null || credits === undefined) return 'creditOfferUnknown';
  if (credits <= 0) return 'creditOfferNone';
  return 'creditOfferCount';
}
