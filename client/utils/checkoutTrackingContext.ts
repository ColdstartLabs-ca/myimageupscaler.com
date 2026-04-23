const CHECKOUT_TRACKING_CONTEXT_KEY = 'miu_checkout_tracking_context';
const CHECKOUT_ORIGINATING_MODEL_KEY = 'checkout_originating_model';
const CONTEXT_EXPIRY_MS = 30 * 60 * 1000;
const ATTRIBUTION_CHAIN_MAX = 5;

interface IStoredCheckoutTrackingContext {
  trigger?: string;
  originatingModel?: string;
  originatingTrigger?: string;
  attributionChain?: string[];
  timestamp: number;
}

export interface ICheckoutTrackingContext {
  trigger?: string;
  originatingModel?: string;
  originatingTrigger?: string;
  attributionChain?: string[];
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

  if (!stored?.trigger && !originatingModel && !stored?.originatingTrigger) {
    return null;
  }

  return {
    trigger: stored?.trigger,
    originatingModel,
    originatingTrigger: stored?.originatingTrigger,
    attributionChain: stored?.attributionChain,
  };
}

export function setCheckoutTrackingContext(context: ICheckoutTrackingContext): void {
  if (typeof window === 'undefined') return;

  const existing = readStoredContext();
  const trigger = context.trigger || existing?.trigger;
  const originatingModel = context.originatingModel || existing?.originatingModel;
  const originatingTrigger = context.originatingTrigger || existing?.originatingTrigger;

  if (!trigger && !originatingModel && !originatingTrigger) {
    clearCheckoutTrackingContext();
    return;
  }

  const existingChain = existing?.attributionChain ?? [];
  const attributionChain =
    context.attributionChain ??
    (context.originatingTrigger
      ? [...existingChain, context.originatingTrigger].slice(-ATTRIBUTION_CHAIN_MAX)
      : existingChain);

  const next: IStoredCheckoutTrackingContext = {
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

  sessionStorage.setItem(CHECKOUT_TRACKING_CONTEXT_KEY, JSON.stringify(next));
}

export function clearCheckoutTrackingContext(): void {
  if (typeof window === 'undefined') return;

  sessionStorage.removeItem(CHECKOUT_TRACKING_CONTEXT_KEY);
  sessionStorage.removeItem(CHECKOUT_ORIGINATING_MODEL_KEY);
}
