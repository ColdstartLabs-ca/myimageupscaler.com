import { createHmac, timingSafeEqual } from 'crypto';
import { serverEnv } from '@shared/config/env';
import {
  CHECKOUT_RESCUE_OFFER_CONFIG,
  isCheckoutRescueOfferEligiblePrice,
} from '@shared/config/checkout-rescue-offer';
import type { ICheckoutRescueOffer } from '@shared/types/checkout-offer';

interface ICheckoutRescueOfferClaims {
  userId: string;
  priceId: string;
  discountPercent: number;
  offerType: typeof CHECKOUT_RESCUE_OFFER_CONFIG.offerType;
  exp: number;
}

function getSigningSecret(): string {
  return (
    serverEnv.STRIPE_SECRET_KEY ||
    serverEnv.STRIPE_WEBHOOK_SECRET ||
    'checkout-rescue-offer-dev-secret'
  );
}

function signPayload(encodedPayload: string): string {
  return createHmac('sha256', getSigningSecret()).update(encodedPayload).digest('base64url');
}

function encodeClaims(claims: ICheckoutRescueOfferClaims): string {
  return Buffer.from(JSON.stringify(claims), 'utf-8').toString('base64url');
}

function decodeClaims(encodedPayload: string): ICheckoutRescueOfferClaims | null {
  try {
    return JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf-8'));
  } catch {
    return null;
  }
}

export function issueCheckoutRescueOffer(params: {
  userId: string;
  priceId: string;
}): ICheckoutRescueOffer {
  const expiresAt = new Date(
    Date.now() + CHECKOUT_RESCUE_OFFER_CONFIG.offerValidityMinutes * 60 * 1000
  );
  const claims: ICheckoutRescueOfferClaims = {
    userId: params.userId,
    priceId: params.priceId,
    discountPercent: CHECKOUT_RESCUE_OFFER_CONFIG.discountPercent,
    offerType: CHECKOUT_RESCUE_OFFER_CONFIG.offerType,
    exp: expiresAt.getTime(),
  };

  const encodedPayload = encodeClaims(claims);
  const signature = signPayload(encodedPayload);

  return {
    offerToken: `${encodedPayload}.${signature}`,
    priceId: params.priceId,
    discountPercent: claims.discountPercent,
    expiresAt: expiresAt.toISOString(),
  };
}

export function verifyCheckoutRescueOffer(params: {
  offerToken: string;
  userId: string;
  priceId: string;
}): { valid: boolean; discountPercent?: number; expiresAt?: string } {
  const [encodedPayload, providedSignature] = params.offerToken.split('.');

  if (!encodedPayload || !providedSignature) {
    return { valid: false };
  }

  const expectedSignature = signPayload(encodedPayload);

  if (expectedSignature.length !== providedSignature.length) {
    return { valid: false };
  }

  const signatureMatches = timingSafeEqual(
    Buffer.from(expectedSignature, 'utf-8'),
    Buffer.from(providedSignature, 'utf-8')
  );

  if (!signatureMatches) {
    return { valid: false };
  }

  const claims = decodeClaims(encodedPayload);

  if (!claims) {
    return { valid: false };
  }

  if (
    claims.offerType !== CHECKOUT_RESCUE_OFFER_CONFIG.offerType ||
    claims.userId !== params.userId ||
    claims.priceId !== params.priceId ||
    claims.exp <= Date.now() ||
    !isCheckoutRescueOfferEligiblePrice(claims.priceId)
  ) {
    return { valid: false };
  }

  return {
    valid: true,
    discountPercent: claims.discountPercent,
    expiresAt: new Date(claims.exp).toISOString(),
  };
}
