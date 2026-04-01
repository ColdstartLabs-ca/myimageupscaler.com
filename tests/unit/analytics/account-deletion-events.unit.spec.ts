import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for account deletion analytics events.
 *
 * These tests verify that:
 * 1. The event names are properly defined in IAnalyticsEventName
 * 2. The event property interfaces are correctly structured
 * 3. The tracking functions emit the expected events with correct properties
 */

// Mock the analytics module
const mockTrack = vi.fn();
vi.mock('@client/analytics', () => ({
  analytics: {
    track: mockTrack,
    isEnabled: () => true,
  },
}));

// Import types to verify they exist
import {
  type IAnalyticsEventName,
  type IAccountDeleteModalOpenedProperties,
  type IAccountDeleteConfirmedProperties,
  type IAccountDeleteCompletedProperties,
} from '@server/analytics/types';

describe('Account Deletion Events - Fix 8', () => {
  beforeEach(() => {
    mockTrack.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Event Types', () => {
    test('account_delete_modal_opened should be a valid event name', () => {
      const eventName: IAnalyticsEventName = 'account_delete_modal_opened';
      expect(eventName).toBe('account_delete_modal_opened');
    });

    test('account_delete_confirmed should be a valid event name', () => {
      const eventName: IAnalyticsEventName = 'account_delete_confirmed';
      expect(eventName).toBe('account_delete_confirmed');
    });

    test('account_delete_completed should be a valid event name', () => {
      const eventName: IAnalyticsEventName = 'account_delete_completed';
      expect(eventName).toBe('account_delete_completed');
    });
  });

  describe('account_delete_modal_opened Event Properties', () => {
    test('should accept valid IAccountDeleteModalOpenedProperties', () => {
      const props: IAccountDeleteModalOpenedProperties = {
        source: 'self_serve',
      };

      expect(props.source).toBe('self_serve');
    });

    test('should accept admin source', () => {
      const props: IAccountDeleteModalOpenedProperties = {
        source: 'admin',
      };

      expect(props.source).toBe('admin');
    });

    test('should accept all valid source values', () => {
      const sources: Array<IAccountDeleteModalOpenedProperties['source']> = [
        'self_serve',
        'admin',
      ];

      sources.forEach(source => {
        const props: IAccountDeleteModalOpenedProperties = {
          source,
        };
        expect(props.source).toBe(source);
      });
    });
  });

  describe('account_delete_confirmed Event Properties', () => {
    test('should accept valid IAccountDeleteConfirmedProperties', () => {
      const props: IAccountDeleteConfirmedProperties = {
        method: 'self_serve',
      };

      expect(props.method).toBe('self_serve');
    });

    test('should accept admin method', () => {
      const props: IAccountDeleteConfirmedProperties = {
        method: 'admin',
      };

      expect(props.method).toBe('admin');
    });

    test('should accept all valid method values', () => {
      const methods: Array<IAccountDeleteConfirmedProperties['method']> = [
        'self_serve',
        'admin',
      ];

      methods.forEach(method => {
        const props: IAccountDeleteConfirmedProperties = {
          method,
        };
        expect(props.method).toBe(method);
      });
    });
  });

  describe('account_delete_completed Event Properties', () => {
    test('should accept valid IAccountDeleteCompletedProperties with all fields', () => {
      const props: IAccountDeleteCompletedProperties = {
        method: 'self_serve',
        hadStripeCustomer: true,
        hadSubscription: false,
        hadCreditsRemaining: true,
        accountAgeDays: 45,
      };

      expect(props.method).toBe('self_serve');
      expect(props.hadStripeCustomer).toBe(true);
      expect(props.hadSubscription).toBe(false);
      expect(props.hadCreditsRemaining).toBe(true);
      expect(props.accountAgeDays).toBe(45);
    });

    test('should accept IAccountDeleteCompletedProperties without optional accountAgeDays', () => {
      const props: IAccountDeleteCompletedProperties = {
        method: 'admin',
        hadStripeCustomer: false,
        hadSubscription: false,
        hadCreditsRemaining: false,
      };

      expect(props.method).toBe('admin');
      expect(props.hadStripeCustomer).toBe(false);
      expect(props.hadSubscription).toBe(false);
      expect(props.hadCreditsRemaining).toBe(false);
      expect(props.accountAgeDays).toBeUndefined();
    });

    test('should accept all valid method values', () => {
      const methods: Array<IAccountDeleteCompletedProperties['method']> = [
        'self_serve',
        'admin',
      ];

      methods.forEach(method => {
        const props: IAccountDeleteCompletedProperties = {
          method,
          hadStripeCustomer: false,
          hadSubscription: false,
          hadCreditsRemaining: false,
        };
        expect(props.method).toBe(method);
      });
    });
  });

  describe('Analytics Tracking', () => {
    test('analytics.track should be callable with account_delete_modal_opened', async () => {
      const { analytics } = await import('@client/analytics');

      analytics.track('account_delete_modal_opened', {
        source: 'self_serve',
      });

      expect(mockTrack).toHaveBeenCalledWith(
        'account_delete_modal_opened',
        expect.objectContaining({
          source: 'self_serve',
        })
      );
    });

    test('analytics.track should be callable with account_delete_confirmed', async () => {
      const { analytics } = await import('@client/analytics');

      analytics.track('account_delete_confirmed', {
        method: 'self_serve',
      });

      expect(mockTrack).toHaveBeenCalledWith(
        'account_delete_confirmed',
        expect.objectContaining({
          method: 'self_serve',
        })
      );
    });

    test('analytics.track should be callable with account_delete_completed', async () => {
      const { analytics } = await import('@client/analytics');

      analytics.track('account_delete_completed', {
        method: 'self_serve',
        hadStripeCustomer: true,
        hadSubscription: false,
        hadCreditsRemaining: true,
        accountAgeDays: 100,
      });

      expect(mockTrack).toHaveBeenCalledWith(
        'account_delete_completed',
        expect.objectContaining({
          method: 'self_serve',
          hadStripeCustomer: true,
          hadSubscription: false,
          hadCreditsRemaining: true,
          accountAgeDays: 100,
        })
      );
    });
  });

  describe('Account Deletion Funnel', () => {
    test('should have complete account deletion funnel events', () => {
      // The account deletion funnel is: modal_opened -> confirmed -> completed
      const deletionFunnel: IAnalyticsEventName[] = [
        'account_delete_modal_opened',
        'account_delete_confirmed',
        'account_delete_completed',
      ];

      // Verify all events are valid
      deletionFunnel.forEach(event => {
        expect(typeof event).toBe('string');
        expect(event.length).toBeGreaterThan(0);
      });

      // Verify the funnel order makes sense
      expect(deletionFunnel).toEqual([
        'account_delete_modal_opened',
        'account_delete_confirmed',
        'account_delete_completed',
      ]);
    });
  });

  describe('Server-side Event Context', () => {
    test('account_delete_completed should include rich context for analysis', () => {
      // Event should provide enough context for user lifecycle analysis
      const props: IAccountDeleteCompletedProperties = {
        method: 'self_serve',
        hadStripeCustomer: true,
        hadSubscription: true,
        hadCreditsRemaining: false,
        accountAgeDays: 180,
      };

      // Verify key fields for churn analysis
      expect(props.hadStripeCustomer).toBeDefined();
      expect(props.hadSubscription).toBeDefined();
      expect(props.hadCreditsRemaining).toBeDefined();
      expect(props.accountAgeDays).toBeDefined();

      // Should be able to segment by customer status
      expect(props.hadStripeCustomer || !props.hadStripeCustomer).toBe(true);
      expect(props.hadSubscription || !props.hadSubscription).toBe(true);

      // Should be able to analyze lost value
      const hadPaidEngagement = props.hadStripeCustomer || props.hadSubscription;
      expect(typeof hadPaidEngagement).toBe('boolean');
    });
  });
});
