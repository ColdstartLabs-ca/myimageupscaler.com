const CHECKOUT_TRACKING_CONTEXT_KEY = 'miu_checkout_tracking_context';
const CHECKOUT_ORIGINATING_MODEL_KEY = 'checkout_originating_model';
const CONTEXT_EXPIRY_MS = 30 * 60 * 1000;
const ATTRIBUTION_CHAIN_MAX = 5;
const FIRST_TOUCH_UTM_STORAGE_KEY = 'miu_first_touch_utm';
const PSEO_FAMILIES = new Set([
  'tools',
  'formats',
  'scale',
  'guides',
  'free',
  'alternatives',
  'compare',
  'platforms',
  'use-cases',
  'device-use',
  'format-scale',
  'platform-format',
]);

interface IStoredCheckoutTrackingContext {
  funnelAttemptId?: string;
  entrySurface?: string;
  trigger?: string;
  originatingModel?: string;
  originatingTrigger?: string;
  attributionChain?: string[];
  experimentKey?: string;
  experimentContextKey?: string;
  experimentArmId?: number;
  experimentArmKey?: string;
  experimentAssignmentKey?: string;
  pricingRegion?: string;
  discountPercent?: number;
  timestamp: number;
}

export interface ICheckoutTrackingContext {
  funnelAttemptId?: string;
  entrySurface?: string;
  trigger?: string;
  originatingModel?: string;
  originatingTrigger?: string;
  attributionChain?: string[];
  experimentKey?: string;
  experimentContextKey?: string;
  experimentArmId?: number;
  experimentArmKey?: string;
  experimentAssignmentKey?: string;
  pricingRegion?: string;
  discountPercent?: number;
}

interface IFirstTouchAttribution {
  utmSource?: string;
  utmMedium?: string;
  landingPage?: string;
}

function getLandingPageFamily(path: string): string {
  return path.split('?')[0]?.split('/').filter(Boolean)[0] || 'home';
}

/** Builds the versioned, non-identity funnel contract sent with checkout creation. */
export function getCheckoutFunnelMetadata(): Record<string, string> {
  if (typeof window === 'undefined') return {};

  let firstTouch: IFirstTouchAttribution = {};
  try {
    const stored = window.localStorage.getItem(FIRST_TOUCH_UTM_STORAGE_KEY);
    if (stored) firstTouch = JSON.parse(stored) as IFirstTouchAttribution;
  } catch {
    // Missing/corrupt attribution must never block checkout.
  }

  const landingPage = firstTouch.landingPage || window.location.pathname;
  const landingPageFamily = getLandingPageFamily(landingPage);
  const width = window.innerWidth;
  const metadata: Record<string, string> = {
    funnel_schema_version: '1',
    first_touch_landing_page: landingPage,
    landing_page_family: landingPageFamily,
    device_type: width < 768 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop',
    is_pseo_landing: String(PSEO_FAMILIES.has(landingPageFamily)),
  };

  if (firstTouch.utmSource) metadata.first_touch_source = firstTouch.utmSource;
  if (firstTouch.utmMedium) metadata.first_touch_medium = firstTouch.utmMedium;
  return metadata;
}

function readStoredContext(): IStoredCheckoutTrackingContext | null {
  if (typeof window === 'undefined') return null;

  const raw = sessionStorage.getItem(CHECKOUT_TRACKING_CONTEXT_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as IStoredCheckoutTrackingContext;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.timestamp !== 'number' ||
      Date.now() - parsed.timestamp > CONTEXT_EXPIRY_MS
    ) {
      sessionStorage.removeItem(CHECKOUT_TRACKING_CONTEXT_KEY);
      return null;
    }

    return parsed;
  } catch {
    sessionStorage.removeItem(CHECKOUT_TRACKING_CONTEXT_KEY);
    return null;
  }
}

export function getCheckoutTrackingContext(): ICheckoutTrackingContext | null {
  if (typeof window === 'undefined') return null;

  const stored = readStoredContext();
  const legacyOriginatingModel =
    sessionStorage.getItem(CHECKOUT_ORIGINATING_MODEL_KEY) || undefined;
  const originatingModel = stored?.originatingModel || legacyOriginatingModel;

  if (
    !stored?.funnelAttemptId &&
    !stored?.entrySurface &&
    !stored?.trigger &&
    !originatingModel &&
    !stored?.originatingTrigger &&
    !stored?.experimentKey &&
    !stored?.pricingRegion &&
    stored?.discountPercent === undefined
  ) {
    return null;
  }

  return {
    funnelAttemptId: stored?.funnelAttemptId,
    entrySurface: stored?.entrySurface,
    trigger: stored?.trigger,
    originatingModel,
    originatingTrigger: stored?.originatingTrigger,
    attributionChain: stored?.attributionChain,
    experimentKey: stored?.experimentKey,
    experimentContextKey: stored?.experimentContextKey,
    experimentArmId: stored?.experimentArmId,
    experimentArmKey: stored?.experimentArmKey,
    experimentAssignmentKey: stored?.experimentAssignmentKey,
    pricingRegion: stored?.pricingRegion,
    discountPercent: stored?.discountPercent,
  };
}

function createFunnelAttemptId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `fa_${crypto.randomUUID().replaceAll('-', '')}`;
  }

  return `fa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export function setCheckoutTrackingContext(
  context: ICheckoutTrackingContext
): ICheckoutTrackingContext | null {
  if (typeof window === 'undefined') return null;

  const existing = readStoredContext();
  const funnelAttemptId =
    existing?.funnelAttemptId || context.funnelAttemptId || createFunnelAttemptId();
  const entrySurface =
    existing?.entrySurface ||
    context.entrySurface ||
    context.originatingTrigger ||
    context.trigger ||
    'unknown';
  const trigger = context.trigger || existing?.trigger;
  const originatingModel = context.originatingModel || existing?.originatingModel;
  const originatingTrigger = context.originatingTrigger || existing?.originatingTrigger;
  const hasExistingExperiment = Boolean(existing?.experimentKey);
  const experimentKey = hasExistingExperiment ? existing?.experimentKey : context.experimentKey;
  const experimentContextKey = hasExistingExperiment
    ? existing?.experimentContextKey
    : context.experimentContextKey;
  const experimentArmId = hasExistingExperiment
    ? existing?.experimentArmId
    : context.experimentArmId;
  const experimentArmKey = hasExistingExperiment
    ? existing?.experimentArmKey
    : context.experimentArmKey;
  const experimentAssignmentKey = hasExistingExperiment
    ? existing?.experimentAssignmentKey
    : context.experimentAssignmentKey;
  const pricingRegion = context.pricingRegion || existing?.pricingRegion;
  const discountPercent = context.discountPercent ?? existing?.discountPercent;

  if (
    !funnelAttemptId &&
    !entrySurface &&
    !trigger &&
    !originatingModel &&
    !originatingTrigger &&
    !experimentKey &&
    !pricingRegion &&
    discountPercent === undefined
  ) {
    clearCheckoutTrackingContext();
    return null;
  }

  const existingChain = existing?.attributionChain ?? [];
  const attributionChain =
    context.attributionChain ??
    (context.originatingTrigger
      ? [...existingChain, context.originatingTrigger].slice(-ATTRIBUTION_CHAIN_MAX)
      : existingChain);

  const next: IStoredCheckoutTrackingContext = {
    funnelAttemptId,
    entrySurface,
    timestamp: Date.now(),
  };

  if (trigger) {
    next.trigger = trigger;
  }

  if (originatingModel) {
    next.originatingModel = originatingModel;
    sessionStorage.setItem(CHECKOUT_ORIGINATING_MODEL_KEY, originatingModel);
  }

  if (originatingTrigger) {
    next.originatingTrigger = originatingTrigger;
  }

  if (attributionChain.length > 0) {
    next.attributionChain = attributionChain;
  }

  if (experimentKey) {
    next.experimentKey = experimentKey;
  }

  if (experimentContextKey) {
    next.experimentContextKey = experimentContextKey;
  }

  if (experimentArmId !== undefined) {
    next.experimentArmId = experimentArmId;
  }

  if (experimentArmKey) {
    next.experimentArmKey = experimentArmKey;
  }

  if (experimentAssignmentKey) {
    next.experimentAssignmentKey = experimentAssignmentKey;
  }

  if (pricingRegion) {
    next.pricingRegion = pricingRegion;
  }

  if (discountPercent !== undefined) {
    next.discountPercent = discountPercent;
  }

  sessionStorage.setItem(CHECKOUT_TRACKING_CONTEXT_KEY, JSON.stringify(next));
  return getCheckoutTrackingContext();
}

export function clearCheckoutTrackingContext(): void {
  if (typeof window === 'undefined') return;

  sessionStorage.removeItem(CHECKOUT_TRACKING_CONTEXT_KEY);
  sessionStorage.removeItem(CHECKOUT_ORIGINATING_MODEL_KEY);
}
