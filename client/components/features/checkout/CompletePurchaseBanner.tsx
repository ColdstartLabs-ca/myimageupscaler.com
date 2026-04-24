'use client';

import { ShoppingCart, X, ArrowRight } from 'lucide-react';
import { ICheckoutLocalStorage } from '@shared/types/cart.types';
import { getPlanDisplayName, getPlanByKey, resolvePriceId } from '@shared/config/stripe';

export interface ICompletePurchaseBannerProps {
  /** The pending checkout data from localStorage */
  checkout: ICheckoutLocalStorage;
  /** Callback when user clicks complete purchase */
  onRestore: () => void;
  /** Callback when user dismisses the banner */
  onDismiss: () => void;
}

/**
 * Helper to get a readable item name from checkout data
 */
function getCheckoutItemName(checkout: ICheckoutLocalStorage): string {
  // First try planKey for subscriptions
  if (checkout.planKey) {
    const plan = getPlanByKey(checkout.planKey);
    if (plan) {
      return `${plan.name} Plan`;
    }
    // Fallback to getPlanDisplayName
    return getPlanDisplayName(checkout.planKey);
  }

  // Try packKey for credit packs
  if (checkout.packKey) {
    const resolved = resolvePriceId(checkout.priceId);
    if (resolved && resolved.type === 'pack') {
      return resolved.name;
    }
    // Fallback formatting
    const formattedKey = checkout.packKey.charAt(0).toUpperCase() + checkout.packKey.slice(1);
    return `${formattedKey} Credits`;
  }

  // Try to resolve from priceId
  if (checkout.priceId) {
    const resolved = resolvePriceId(checkout.priceId);
    if (resolved) {
      if (resolved.type === 'plan') {
        return `${resolved.name} Plan`;
      }
      return resolved.name;
    }
  }

  return 'your selected plan';
}

/**
 * Helper to format price message with discount info
 */
function formatPriceMessage(checkout: ICheckoutLocalStorage): string {
  // If there's a recovery code, mention the discount
  if (checkout.recoveryCode) {
    return 'Complete your purchase with your exclusive 10% discount.';
  }

  // If there's a regional discount, mention it
  if (checkout.discountPercent > 0) {
    return `Complete your purchase with ${checkout.discountPercent}% regional pricing.`;
  }

  return 'Pick up where you left off.';
}

/**
 * Banner component shown to returning users who have a pending checkout.
 * Displays the plan/pack they were looking at and provides a quick way to resume.
 *
 * @example
 * ```tsx
 * const { showRestoreBanner, pendingCart, handleRestore, handleDismiss } = useRestoreCart();
 *
 * if (showRestoreBanner && pendingCart) {
 *   return (
 *     <CompletePurchaseBanner
 *       checkout={pendingCart}
 *       onRestore={handleRestore}
 *       onDismiss={handleDismiss}
 *     />
 *   );
 * }
 * ```
 */
export function CompletePurchaseBanner({
  checkout,
  onRestore,
  onDismiss,
}: ICompletePurchaseBannerProps): JSX.Element {
  const itemName = getCheckoutItemName(checkout);
  const priceMessage = formatPriceMessage(checkout);

  return (
    <div className="relative overflow-hidden rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 flex items-center gap-3 animate-fade-in">
      <ShoppingCart className="w-5 h-5 text-accent shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text-primary">Complete Your Purchase</p>
        <p className="text-sm text-text-secondary truncate">
          You were looking at <span className="font-medium text-text-primary">{itemName}</span>.{' '}
          {priceMessage}
        </p>
      </div>
      <button
        onClick={onRestore}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors shrink-0"
      >
        Complete Purchase
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={onDismiss}
        className="text-text-muted hover:text-white transition-colors p-1.5 rounded-full hover:bg-white/5 shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
