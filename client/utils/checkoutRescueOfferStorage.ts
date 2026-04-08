'use client';

import { isOfferExpired } from '@shared/config/engagement-discount';
import type { ICheckoutRescueOffer } from '@shared/types/checkout-offer';

const STORAGE_PREFIX = 'checkout_rescue_offer:';

function getStorageKey(priceId: string): string {
  return `${STORAGE_PREFIX}${priceId}`;
}

export function getStoredCheckoutRescueOffer(priceId: string): ICheckoutRescueOffer | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = sessionStorage.getItem(getStorageKey(priceId));
    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored) as ICheckoutRescueOffer;
    if (
      !parsed?.offerToken ||
      parsed.priceId !== priceId ||
      typeof parsed.discountPercent !== 'number' ||
      typeof parsed.expiresAt !== 'string'
    ) {
      sessionStorage.removeItem(getStorageKey(priceId));
      return null;
    }

    if (isOfferExpired(parsed.expiresAt)) {
      sessionStorage.removeItem(getStorageKey(priceId));
      return null;
    }

    return parsed;
  } catch {
    sessionStorage.removeItem(getStorageKey(priceId));
    return null;
  }
}

export function storeCheckoutRescueOffer(offer: ICheckoutRescueOffer): void {
  if (typeof window === 'undefined') {
    return;
  }

  sessionStorage.setItem(getStorageKey(offer.priceId), JSON.stringify(offer));
}

export function clearStoredCheckoutRescueOffer(priceId: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  sessionStorage.removeItem(getStorageKey(priceId));
}
