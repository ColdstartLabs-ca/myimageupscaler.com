/**
 * Unit Tests: Payment Telemetry Audit Fixes
 *
 * Verifies the fixes from the Amplitude payment telemetry audit:
 * - Session stitching: server events carry client amplitude_device_id / amplitude_session_id
 * - revenue property on purchase_confirmed and credit_pack_purchased
 * - credit_pack_purchased includes Stripe correlation IDs
 * - handleChargeFailed tracks payment_failed for non-invoice charge declines
 * - charge.failed is routed by the webhook event processor
 * - analyticsService passes session_id in the Amplitude event payload
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Codec helpers ────────────────────────────────────────────────────────────

/** Reads the raw source of a file so structural assertions are framework-free. */
async function source(path: string): Promise<string> {
  const fs = await import('fs');
  return fs.readFileSync(path, 'utf-8');
}

// ─── analyticsService ─────────────────────────────────────────────────────────

describe('analyticsService session stitching', () => {
  test('IServerTrackOptions exposes sessionId field', async () => {
    const src = await source('server/analytics/analyticsService.ts');
    expect(src).toMatch(/sessionId\?:\s*number/);
  });

  test('trackServerEvent includes session_id in event payload when provided', async () => {
    const src = await source('server/analytics/analyticsService.ts');
    expect(src).toContain('session_id: sessionId');
    expect(src).toMatch(/sessionId !== undefined.*session_id/s);
  });
});

// ─── analyticsClient ─────────────────────────────────────────────────────────

describe('analyticsClient email identity', () => {
  test('identify() sets plaintext email as user property', async () => {
    const src = await source('client/analytics/analyticsClient.ts');
    // Should set 'email' directly (not just the hash)
    expect(src).toMatch(/identifyEvent\.set\(\s*['"]email['"]\s*,\s*identity\.email\s*\)/);
  });

  test('identify() still sets email_hash for privacy-safe cross-referencing', async () => {
    const src = await source('client/analytics/analyticsClient.ts');
    expect(src).toMatch(/identifyEvent\.set\(\s*['"]email_hash['"]/);
  });

  test('getAmplitudeSessionId() method is exported on the analytics object', async () => {
    const src = await source('client/analytics/analyticsClient.ts');
    expect(src).toContain('getAmplitudeSessionId()');
    expect(src).toMatch(/amplitudeModule\.getSessionId\(\)/);
  });
});

// ─── useCheckoutSession ───────────────────────────────────────────────────────

describe('useCheckoutSession amplitude metadata', () => {
  test('passes amplitude_device_id and amplitude_session_id in checkout metadata', async () => {
    const src = await source('client/hooks/useCheckoutSession.ts');
    expect(src).toContain('amplitude_device_id');
    expect(src).toContain('amplitude_session_id');
    expect(src).toContain('analytics.getDeviceId()');
    expect(src).toContain('analytics.getAmplitudeSessionId()');
  });
});

// ─── payment.handler session stitching ───────────────────────────────────────

describe('payment.handler buildAmplitudeOpts', () => {
  test('buildAmplitudeOpts helper exists and reads amplitude metadata from session', async () => {
    const src = await source('app/api/webhooks/stripe/handlers/payment.handler.ts');
    expect(src).toContain('buildAmplitudeOpts');
    expect(src).toContain('amplitude_device_id');
    expect(src).toContain('amplitude_session_id');
  });

  test('handleCheckoutSessionCompleted uses buildAmplitudeOpts for all analytics calls', async () => {
    const src = await source('app/api/webhooks/stripe/handlers/payment.handler.ts');
    // buildAmplitudeOpts must be called from handleCheckoutSessionCompleted
    expect(src).toMatch(
      /handleCheckoutSessionCompleted[\s\S]*?this\.buildAmplitudeOpts\(session,\s*userId\)/
    );
  });
});

// ─── revenue property ─────────────────────────────────────────────────────────

describe('payment.handler revenue property', () => {
  test('purchase_confirmed includes revenue property (dollars, not cents)', async () => {
    const src = await source('app/api/webhooks/stripe/handlers/payment.handler.ts');
    // Should have revenue: amountCents / 100 on purchase_confirmed
    expect(src).toMatch(/['"]purchase_confirmed['"]\s*,[\s\S]*?revenue:\s*amountCents\s*\/\s*100/);
  });

  test('credit_pack_purchased includes revenue property', async () => {
    const src = await source('app/api/webhooks/stripe/handlers/payment.handler.ts');
    // Should have revenue on credit_pack_purchased
    expect(src).toMatch(
      /['"]credit_pack_purchased['"]\s*,[\s\S]*?revenue:\s*amountCents\s*\/\s*100/
    );
  });
});

// ─── credit_pack_purchased Stripe correlation IDs ────────────────────────────

describe('payment.handler credit_pack_purchased properties', () => {
  test('credit_pack_purchased includes stripePaymentIntentId', async () => {
    const src = await source('app/api/webhooks/stripe/handlers/payment.handler.ts');
    const packBlock = src.substring(
      src.indexOf("'credit_pack_purchased'"),
      src.indexOf("'credit_pack_purchased'") + 600
    );
    expect(packBlock).toContain('stripePaymentIntentId');
  });

  test('credit_pack_purchased includes currency', async () => {
    const src = await source('app/api/webhooks/stripe/handlers/payment.handler.ts');
    const packBlock = src.substring(
      src.indexOf("'credit_pack_purchased'"),
      src.indexOf("'credit_pack_purchased'") + 600
    );
    expect(packBlock).toContain('currency');
  });

  test('credit_pack_purchased includes pricingRegion', async () => {
    const src = await source('app/api/webhooks/stripe/handlers/payment.handler.ts');
    const packBlock = src.substring(
      src.indexOf("'credit_pack_purchased'"),
      src.indexOf("'credit_pack_purchased'") + 600
    );
    expect(packBlock).toContain('pricingRegion');
  });

  test('credit_pack_purchased includes stripeCustomerId', async () => {
    const src = await source('app/api/webhooks/stripe/handlers/payment.handler.ts');
    const packBlock = src.substring(
      src.indexOf("'credit_pack_purchased'"),
      src.indexOf("'credit_pack_purchased'") + 600
    );
    expect(packBlock).toContain('stripeCustomerId');
  });
});

// ─── handleChargeFailed ───────────────────────────────────────────────────────

describe('payment.handler handleChargeFailed', () => {
  test('handleChargeFailed exists as a static method', async () => {
    const src = await source('app/api/webhooks/stripe/handlers/payment.handler.ts');
    expect(src).toContain('static async handleChargeFailed');
  });

  test('handleChargeFailed fires payment_failed event', async () => {
    const src = await source('app/api/webhooks/stripe/handlers/payment.handler.ts');
    // payment_failed, stripePaymentIntentId, and decline_reason must all appear
    // co-located with handleChargeFailed within ~1500 chars
    expect(src).toMatch(/handleChargeFailed[\s\S]{0,1500}'payment_failed'/);
    expect(src).toMatch(/handleChargeFailed[\s\S]{0,1500}stripePaymentIntentId/);
    expect(src).toMatch(/handleChargeFailed[\s\S]{0,1500}decline_reason/);
  });

  test('handleChargeFailed skips invoice-attached charges (subscription handled by InvoiceHandler)', async () => {
    const src = await source('app/api/webhooks/stripe/handlers/payment.handler.ts');
    // The guard must be inside handleChargeFailed (co-located with the method definition)
    expect(src).toMatch(/handleChargeFailed[\s\S]{0,500}\.invoice\)\s*return/);
  });
});

// ─── webhook event processor ─────────────────────────────────────────────────

describe('stripe-webhook-event-processor charge.failed routing', () => {
  test('routes charge.failed to PaymentHandler.handleChargeFailed', async () => {
    const src = await source('server/services/stripe-webhook-event-processor.ts');
    expect(src).toContain("case 'charge.failed'");
    expect(src).toContain('PaymentHandler.handleChargeFailed');
  });

  test('charge.failed is in StripeWebhookEventType union', async () => {
    const src = await source('server/services/stripe-webhook-event-processor.ts');
    expect(src).toMatch(/'charge\.failed'/);
  });
});
