import { describe, test, expect } from 'vitest';

/**
 * Tests verifying that purchase_confirmed is tracked for ALL payment types:
 * 1. Checkout session completed (subscriptions + credit packs) — even when price resolution fails
 * 2. Invoice payment succeeded — renewals AND first-invoice fallback
 * 3. Subscription plan changes — upgrades/downgrades
 *
 * These are structural/source-code checks that verify the tracking code exists
 * in the right places, without requiring full module mocking.
 */

describe('purchase_confirmed tracking coverage', () => {
  describe('Fix: payment.handler.ts must not return early before analytics', () => {
    test('checkout handler should NOT return when price resolution fails', async () => {
      const fs = await import('fs');
      const source = fs.readFileSync(
        'app/api/webhooks/stripe/handlers/payment.handler.ts',
        'utf-8'
      );

      // Find the catch block for plan resolution failure
      const catchBlock = source.match(
        /catch\s*\([^)]*\)\s*\{[\s\S]*?WEBHOOK_ERROR.*?Checkout session plan resolution failed[\s\S]*?\n\s*\}/
      );
      expect(catchBlock).toBeTruthy();

      // The catch block should NOT contain a bare `return;`
      // (It used to have `return;` which skipped all analytics)
      const catchContent = catchBlock![0];
      expect(catchContent).not.toMatch(/^\s*return;\s*$/m);
      expect(catchContent).not.toContain('return;\n');
    });

    test('purchase_confirmed is tracked in handleCheckoutSessionCompleted', async () => {
      const fs = await import('fs');
      const source = fs.readFileSync(
        'app/api/webhooks/stripe/handlers/payment.handler.ts',
        'utf-8'
      );

      // Verify purchase_confirmed is tracked in the analytics block
      expect(source).toContain("'purchase_confirmed'");
      // Verify it's tracked outside the subscription/payment if-else blocks
      // (i.e., in the shared analytics section at the bottom)
      const analyticsBlock = source.match(
        /\/\/ Track checkout completed event[\s\S]*?if \(purchaseType\)/
      );
      expect(analyticsBlock).toBeTruthy();
    });
  });

  describe('Fix: invoice.handler.ts must track purchase_confirmed for renewals', () => {
    test('invoice handler should track purchase_confirmed for subscription_cycle renewals', async () => {
      const fs = await import('fs');
      const source = fs.readFileSync(
        'app/api/webhooks/stripe/handlers/invoice.handler.ts',
        'utf-8'
      );

      // Verify the code has both subscription_cycle check AND purchase_confirmed with subscription_renewal
      expect(source).toMatch(/billingReason\s*===\s*['"]subscription_cycle['"]/);
      expect(source).toContain("'subscription_renewal'");

      // The trackPurchaseConfirmed helper should be called for renewals
      const renewalCall = source.match(
        /trackPurchaseConfirmed\(\{[\s\S]*?purchaseType:\s*['"]subscription_renewal['"]/
      );
      expect(renewalCall).toBeTruthy();
    });

    test('invoice handler should track purchase_confirmed as fallback for subscription_create', async () => {
      const fs = await import('fs');
      const source = fs.readFileSync(
        'app/api/webhooks/stripe/handlers/invoice.handler.ts',
        'utf-8'
      );

      // Should have a subscription_create billing reason branch that also fires purchase_confirmed
      expect(source).toContain("'subscription_create'");
      expect(source).toContain('subscription_new');

      // Verify the first-invoice early return (INVOICE_SKIP) also fires purchase_confirmed
      const skipBlock = source.match(
        /INVOICE_SKIP[\s\S]*?Credits already added[\s\S]*?trackPurchaseConfirmed/
      );
      expect(skipBlock).toBeTruthy();
    });

    test('trackPurchaseConfirmed helper exists and is fire-and-forget', async () => {
      const fs = await import('fs');
      const source = fs.readFileSync(
        'app/api/webhooks/stripe/handlers/invoice.handler.ts',
        'utf-8'
      );

      // Helper should exist
      expect(source).toContain('function trackPurchaseConfirmed');

      // Should be fire-and-forget — analytics failures must never block the webhook
      expect(source).toContain('.catch(');
      // Stripe IDs must be included for reconciliation
      expect(source).toContain('stripeInvoiceId');
      expect(source).toContain('stripeSubscriptionId');
    });
  });

  describe('Fix: subscription.handler.ts must track purchase_confirmed for plan changes', () => {
    test('subscription handler should track purchase_confirmed for plan changes', async () => {
      const fs = await import('fs');
      const source = fs.readFileSync(
        'app/api/webhooks/stripe/handlers/subscription.handler.ts',
        'utf-8'
      );

      // Should detect plan changes
      expect(source).toContain('isPlanChange');

      // Should fire purchase_confirmed for plan changes
      expect(source).toContain('subscription_plan_change');

      // Should be fire-and-forget — analytics failures must never block the webhook
      expect(source).toContain('.catch(');
      // Stripe IDs must be included for reconciliation
      expect(source).toContain('stripeSubscriptionId');
    });
  });

  describe('Fix: analyticsService.ts must log Amplitude API errors', () => {
    test('analytics service should log response status and body on failure', async () => {
      const fs = await import('fs');
      const source = fs.readFileSync('server/analytics/analyticsService.ts', 'utf-8');

      // Should check response.ok and log details on failure
      expect(source).toContain('!response.ok');
      expect(source).toContain('response.status');
      expect(source).toContain('[Analytics] Amplitude API error:');
    });
  });

  describe('Coverage: every payment path sends purchase_confirmed', () => {
    test('all three webhook handlers track purchase_confirmed', async () => {
      const fs = await import('fs');

      const handlers = [
        'app/api/webhooks/stripe/handlers/payment.handler.ts',
        'app/api/webhooks/stripe/handlers/invoice.handler.ts',
        'app/api/webhooks/stripe/handlers/subscription.handler.ts',
      ];

      for (const handlerPath of handlers) {
        const source = fs.readFileSync(handlerPath, 'utf-8');
        expect(source, `${handlerPath} should track purchase_confirmed`).toContain(
          'purchase_confirmed'
        );
      }
    });
  });
});
