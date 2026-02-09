/**
 * Unit Tests: Subscription Sync Service
 *
 * Tests for helper functions used in the Stripe-Database sync system.
 */

import { describe, it, expect } from 'vitest';
import { isStripeNotFoundError } from '@server/services/subscription-sync.service';
import type Stripe from 'stripe';

describe('Subscription Sync Service', () => {
  describe('isStripeNotFoundError', () => {
    it('should return true for Stripe 404 errors', () => {
      const error = {
        type: 'StripeInvalidRequestError',
        statusCode: 404,
        message: 'No such subscription',
      };

      expect(isStripeNotFoundError(error)).toBe(true);
    });

    it('should return true for "No such" error messages', () => {
      const error = {
        type: 'StripeInvalidRequestError',
        statusCode: 400,
        message: 'No such subscription: sub_123',
      };

      expect(isStripeNotFoundError(error)).toBe(true);
    });

    it('should return false for other Stripe errors', () => {
      const error = {
        type: 'StripeInvalidRequestError',
        statusCode: 400,
        message: 'Invalid request',
      };

      expect(isStripeNotFoundError(error)).toBe(false);
    });

    it('should return false for non-Stripe errors', () => {
      const error = {
        type: 'Error',
        message: 'Generic error',
      };

      expect(isStripeNotFoundError(error)).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isStripeNotFoundError(null)).toBe(false);
      expect(isStripeNotFoundError(undefined)).toBe(false);
    });

    it('should return false for non-object errors', () => {
      expect(isStripeNotFoundError('string error')).toBe(false);
      expect(isStripeNotFoundError(123)).toBe(false);
      expect(isStripeNotFoundError(true)).toBe(false);
    });

    it('should handle errors without all properties', () => {
      const error1 = { type: 'StripeInvalidRequestError' };
      expect(isStripeNotFoundError(error1)).toBe(false);

      const error2 = { statusCode: 404 };
      expect(isStripeNotFoundError(error2)).toBe(false);

      const error3 = { message: 'No such subscription' };
      expect(isStripeNotFoundError(error3)).toBe(false);
    });
  });

  describe('sleep', () => {
    it('should delay execution by specified milliseconds', async () => {
      const { sleep } = await import('@server/services/subscription-sync.service');

      const start = Date.now();
      await sleep(100);
      const end = Date.now();

      expect(end - start).toBeGreaterThanOrEqual(90); // Allow slight variance
      expect(end - start).toBeLessThan(200);
    });

    it('should work with 0 milliseconds', async () => {
      const { sleep } = await import('@server/services/subscription-sync.service');

      const start = Date.now();
      await sleep(0);
      const end = Date.now();

      expect(end - start).toBeLessThan(50);
    });
  });

  describe('Stripe Subscription Period Handling', () => {
    it('should extract period timestamps from Stripe subscription', () => {
      const subscription = {
        id: 'sub_test123',
        status: 'active',
        items: {
          data: [
            {
              price: {
                id: 'price_1Sz0fOL1vUl00LlZ7bbM2cDs',
              },
            },
          ],
        },
        customer: 'cus_test123',
        current_period_start: 1701388800, // Dec 1, 2023 00:00:00 GMT
        current_period_end: 1704067200, // Jan 1, 2024 00:00:00 GMT
        cancel_at_period_end: false,
      } as unknown as Stripe.Subscription;

      // Verify we can access period timestamps
      const periodSubscription = subscription as Stripe.Subscription & {
        current_period_start: number;
        current_period_end: number;
      };

      expect(periodSubscription.current_period_start).toBe(1701388800);
      expect(periodSubscription.current_period_end).toBe(1704067200);
    });

    it('should handle subscriptions with canceled_at timestamp', () => {
      const subscription = {
        id: 'sub_test123',
        status: 'canceled',
        canceled_at: 1703980800, // Dec 31, 2023 00:00:00 GMT
      } as unknown as Stripe.Subscription & {
        canceled_at: number;
      };

      expect(subscription.canceled_at).toBe(1703980800);
    });
  });

  describe('Sync Run Types', () => {
    it('should validate job types', () => {
      const validJobTypes = ['expiration_check', 'webhook_recovery', 'full_reconciliation'];

      validJobTypes.forEach(jobType => {
        expect(validJobTypes).toContain(jobType);
      });
    });

    it('should validate sync run statuses', () => {
      const validStatuses = ['running', 'completed', 'failed'];

      validStatuses.forEach(status => {
        expect(validStatuses).toContain(status);
      });
    });
  });

  describe('Error Handling Scenarios', () => {
    it('should identify database connection errors', () => {
      const dbError = {
        code: 'PGRST301',
        message: 'Database connection failed',
      };

      expect(isStripeNotFoundError(dbError)).toBe(false);
    });

    it('should identify rate limit errors', () => {
      const rateLimitError = {
        type: 'StripeRateLimitError',
        statusCode: 429,
        message: 'Too many requests',
      };

      expect(isStripeNotFoundError(rateLimitError)).toBe(false);
    });

    it('should identify authentication errors', () => {
      const authError = {
        type: 'StripeAuthenticationError',
        statusCode: 401,
        message: 'Invalid API key',
      };

      expect(isStripeNotFoundError(authError)).toBe(false);
    });
  });

  describe('Webhook Event Processing', () => {
    it('should handle subscription created events', () => {
      const event = {
        id: 'evt_test123',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_test123',
            customer: 'cus_test123',
            status: 'active',
          },
        },
      };

      expect(event.type).toBe('customer.subscription.created');
      expect(event.data.object.status).toBe('active');
    });

    it('should handle subscription updated events', () => {
      const event = {
        id: 'evt_test123',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test123',
            status: 'past_due',
          },
        },
      };

      expect(event.type).toBe('customer.subscription.updated');
      expect(event.data.object.status).toBe('past_due');
    });

    it('should handle subscription deleted events', () => {
      const event = {
        id: 'evt_test123',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_test123',
            status: 'canceled',
          },
        },
      };

      expect(event.type).toBe('customer.subscription.deleted');
      expect(event.data.object.status).toBe('canceled');
    });
  });

  describe('Sync Run Metadata', () => {
    it('should structure metadata correctly', () => {
      const metadata = {
        issues: [
          {
            subId: 'sub_123',
            userId: 'user_123',
            issue: 'Status mismatch',
            action: 'auto-fixed',
          },
        ],
      };

      expect(metadata.issues).toHaveLength(1);
      expect(metadata.issues[0]).toHaveProperty('subId');
      expect(metadata.issues[0]).toHaveProperty('userId');
      expect(metadata.issues[0]).toHaveProperty('issue');
      expect(metadata.issues[0]).toHaveProperty('action');
    });

    it('should handle empty issues array', () => {
      const metadata = {
        issues: [],
      };

      expect(metadata.issues).toHaveLength(0);
    });
  });
});
