/**
 * Unit Tests: Webhook Route - Unhandled Event Marking (MEDIUM-2 Fix)
 *
 * Tests for the MEDIUM-2 fix that marks unhandled webhook events as unrecoverable
 * instead of completed. This prevents unhandled events from being silently ignored
 * and ensures they are tracked for investigation.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '../../../app/api/webhooks/stripe/route';
import { NextRequest } from 'next/server';
import Stripe from 'stripe';

// Mock dependencies
vi.mock('../../../app/api/webhooks/stripe/services/webhook-verification.service', () => ({
  WebhookVerificationService: {
    verifyWebhook: vi.fn(),
  },
}));

vi.mock('../../../app/api/webhooks/stripe/services/idempotency.service', () => ({
  IdempotencyService: {
    checkAndClaimEvent: vi.fn(),
    markEventCompleted: vi.fn(),
    markEventFailed: vi.fn(),
    markEventUnrecoverable: vi.fn(),
  },
}));

vi.mock('@server/services/stripe-webhook-event-processor', () => ({
  extractPreviousPriceId: vi.fn(),
  processStripeWebhookEvent: vi.fn(),
}));

import { WebhookVerificationService } from '../../../app/api/webhooks/stripe/services/webhook-verification.service';
import { IdempotencyService } from '../../../app/api/webhooks/stripe/services/idempotency.service';
import {
  extractPreviousPriceId,
  processStripeWebhookEvent,
} from '@server/services/stripe-webhook-event-processor';

// Cast mocks to proper types
const MockedWebhookVerificationService = WebhookVerificationService as {
  verifyWebhook: ReturnType<typeof vi.fn>;
};
const MockedIdempotencyService = IdempotencyService as {
  checkAndClaimEvent: ReturnType<typeof vi.fn>;
  markEventCompleted: ReturnType<typeof vi.fn>;
  markEventFailed: ReturnType<typeof vi.fn>;
  markEventUnrecoverable: ReturnType<typeof vi.fn>;
};
const MockedProcessStripeWebhookEvent = processStripeWebhookEvent as ReturnType<typeof vi.fn>;
const MockedExtractPreviousPriceId = extractPreviousPriceId as ReturnType<typeof vi.fn>;

describe('Webhook Route - MEDIUM-2 Fix: Unhandled Event Marking', () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
  };

  const mockEventId = 'evt_test_unhandled_123';
  const mockUnhandledEventType = 'account.application.authorized';
  const mockStripeEvent = {
    id: mockEventId,
    type: mockUnhandledEventType,
    data: {
      object: {
        id: 'test_object',
      },
      previous_attributes: null,
    },
  } as Stripe.Event;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    };

    // Setup default mocks
    MockedWebhookVerificationService.verifyWebhook.mockResolvedValue({
      event: mockStripeEvent,
    });

    MockedIdempotencyService.checkAndClaimEvent.mockResolvedValue({
      isNew: true,
      existingStatus: undefined,
    });

    MockedExtractPreviousPriceId.mockReturnValue(null);

    // Event is unhandled
    MockedProcessStripeWebhookEvent.mockResolvedValue({
      handled: false,
    });
  });

  afterEach(() => {
    Object.values(consoleSpy).forEach(spy => spy.mockRestore());
  });

  describe('MEDIUM-2 Fix: Mark unhandled events as unrecoverable', () => {
    test('should mark unhandled events as unrecoverable instead of completed', async () => {
      // Arrange
      const mockRequest = new NextRequest('https://example.com/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'sig_test',
        },
      });

      // Act
      const response = await POST(mockRequest);
      const responseData = await response.json();

      // Assert - Event marked as unrecoverable
      expect(MockedIdempotencyService.markEventUnrecoverable).toHaveBeenCalledWith(
        mockEventId,
        mockUnhandledEventType
      );

      // Assert - Response includes warning
      expect(responseData).toEqual({
        received: true,
        warning: `Unhandled event type: ${mockUnhandledEventType}`,
      });

      // Assert - Logging indicates unhandled event
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining('UNHANDLED WEBHOOK TYPE')
      );
    });

    test('should not mark event as completed when unhandled', async () => {
      // Arrange
      const mockRequest = new NextRequest('https://example.com/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'sig_test',
        },
      });

      // Act
      await POST(mockRequest);

      // Assert - markEventCompleted was NOT called
      expect(MockedIdempotencyService.markEventCompleted).not.toHaveBeenCalled();
    });

    test('should return 200 success for unhandled events (prevent Stripe retry)', async () => {
      // Arrange
      const mockRequest = new NextRequest('https://example.com/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'sig_test',
        },
      });

      // Act
      const response = await POST(mockRequest);

      // Assert - Returns 200 to prevent Stripe from retrying unhandled events
      expect(response.status).toBe(200);
    });

    test('should include warning message in response for unhandled events', async () => {
      // Arrange
      const mockRequest = new NextRequest('https://example.com/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'sig_test',
        },
      });

      // Act
      const response = await POST(mockRequest);
      const responseData = await response.json();

      // Assert
      expect(responseData.warning).toContain('Unhandled event type');
      expect(responseData.received).toBe(true);
    });
  });

  describe('Handled events still work correctly', () => {
    beforeEach(() => {
      // Override mock for handled events
      MockedProcessStripeWebhookEvent.mockResolvedValue({
        handled: true,
      });
    });

    test('should mark handled events as completed', async () => {
      // Arrange
      const mockRequest = new NextRequest('https://example.com/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'sig_test',
        },
      });

      // Act
      await POST(mockRequest);

      // Assert - Handled event marked as completed
      expect(MockedIdempotencyService.markEventCompleted).toHaveBeenCalledWith(mockEventId);
      expect(MockedIdempotencyService.markEventUnrecoverable).not.toHaveBeenCalled();
    });

    test('should return success response for handled events', async () => {
      // Arrange
      const mockRequest = new NextRequest('https://example.com/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'sig_test',
        },
      });

      // Act
      const response = await POST(mockRequest);
      const responseData = await response.json();

      // Assert
      expect(response.status).toBe(200);
      expect(responseData).toEqual({
        received: true,
      });
    });
  });

  describe('Idempotency disabled scenarios', () => {
    beforeEach(() => {
      // Idempotency check throws - service unavailable
      MockedIdempotencyService.checkAndClaimEvent.mockRejectedValue(
        new Error('Database unavailable')
      );
    });

    test('should skip marking unrecoverable when idempotency is disabled', async () => {
      // Arrange
      const mockRequest = new NextRequest('https://example.com/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'sig_test',
        },
      });

      // Act
      const response = await POST(mockRequest);
      const responseData = await response.json();

      // Assert - Should not call markEventUnrecoverable
      expect(MockedIdempotencyService.markEventUnrecoverable).not.toHaveBeenCalled();

      // Assert - Should log warning about skipping
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining('Skipping webhook_events logging because idempotency is disabled')
      );

      // Assert - Still returns success
      expect(response.status).toBe(200);
      expect(responseData.received).toBe(true);
      expect(responseData.warning).toContain('Unhandled event type');
    });
  });

  describe('Failed event processing', () => {
    beforeEach(() => {
      // Handler throws error
      MockedProcessStripeWebhookEvent.mockRejectedValue(
        new Error('Temporary processing error')
      );
    });

    test('should mark event as failed when handler throws', async () => {
      // Arrange
      const mockRequest = new NextRequest('https://example.com/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'sig_test',
        },
      });

      // Act
      await POST(mockRequest);

      // Assert - Event marked as failed, not unrecoverable
      expect(MockedIdempotencyService.markEventFailed).toHaveBeenCalledWith(
        mockEventId,
        'Temporary processing error'
      );
      expect(MockedIdempotencyService.markEventUnrecoverable).not.toHaveBeenCalled();
    });

    test('should re-throw error after marking as failed', async () => {
      // Arrange
      const mockRequest = new NextRequest('https://example.com/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'sig_test',
        },
      });

      // Act
      const response = await POST(mockRequest);

      // Assert - Returns 500 to trigger Stripe retry
      expect(response.status).toBe(500);
      const responseData = await response.json();
      expect(responseData.error).toBeTruthy();
    });
  });

  describe('Duplicate event handling', () => {
    beforeEach(() => {
      // Event already completed
      MockedIdempotencyService.checkAndClaimEvent.mockResolvedValue({
        isNew: false,
        existingStatus: 'completed',
      });
    });

    test('should skip processing of duplicate completed events', async () => {
      // Arrange
      const mockRequest = new NextRequest('https://example.com/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'sig_test',
        },
      });

      // Act
      const response = await POST(mockRequest);
      const responseData = await response.json();

      // Assert - Event handler not called
      expect(MockedProcessStripeWebhookEvent).not.toHaveBeenCalled();

      // Assert - Returns success with skipped indicator
      expect(response.status).toBe(200);
      expect(responseData).toEqual({
        received: true,
        skipped: true,
        reason: expect.stringContaining('already completed'),
      });
    });
  });

  describe('Console logging behavior', () => {
    test('should log warning with event type for unhandled events', async () => {
      // Arrange
      const mockRequest = new NextRequest('https://example.com/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'sig_test',
        },
      });

      // Act
      await POST(mockRequest);

      // Assert - Warning logged with event type
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        `UNHANDLED WEBHOOK TYPE: ${mockUnhandledEventType} - this may require code update`
      );
    });

    test('should extract previous_price_id for logging', async () => {
      // Arrange
      MockedExtractPreviousPriceId.mockReturnValue('price_old_123');
      const mockRequest = new NextRequest('https://example.com/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'sig_test',
        },
      });

      // Act
      await POST(mockRequest);

      // Assert - Previous price ID extracted and logged
      expect(MockedExtractPreviousPriceId).toHaveBeenCalledWith(null);
      expect(consoleSpy.log).toHaveBeenCalledTimes(2); // WEBHOOK_POST_HANDLER_CALLED and WEBHOOK_EVENT_RECEIVED
    });
  });

  describe('Edge cases', () => {
    test('should handle unhandled event with idempotency unavailable', async () => {
      // Arrange - Idempotency check fails
      MockedIdempotencyService.checkAndClaimEvent.mockRejectedValue(
        new Error('Idempotency DB unavailable')
      );
      const mockRequest = new NextRequest('https://example.com/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'sig_test',
        },
      });

      // Act
      const response = await POST(mockRequest);

      // Assert - Returns success even without idempotency
      expect(response.status).toBe(200);
      expect(MockedIdempotencyService.markEventUnrecoverable).not.toHaveBeenCalled();
    });

    test('should handle verification errors', async () => {
      // Arrange - Verification fails with signature error
      MockedWebhookVerificationService.verifyWebhook.mockRejectedValue(
        new Error('Invalid signature')
      );
      const mockRequest = new NextRequest('https://example.com/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'invalid_sig',
        },
      });

      // Act
      const response = await POST(mockRequest);
      const responseData = await response.json();

      // Assert - Returns 400 for client errors (no retry)
      expect(response.status).toBe(400);
      expect(responseData.error).toContain('signature');
    });

    test('should handle server errors with 500 status', async () => {
      // Arrange - Verification fails with server error
      MockedWebhookVerificationService.verifyWebhook.mockRejectedValue(
        new Error('Internal server error')
      );
      const mockRequest = new NextRequest('https://example.com/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': 'sig_test',
        },
      });

      // Act
      const response = await POST(mockRequest);

      // Assert - Returns 500 for server errors (triggers retry)
      expect(response.status).toBe(500);
    });
  });
});
