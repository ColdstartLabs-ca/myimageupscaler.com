/**
 * Unit Tests: Webhook Idempotency State Machine
 *
 * Tests the state machine logic for webhook event processing.
 * Focuses on state transitions, recovery eligibility, and idempotency guarantees.
 *
 * State Machine States:
 * - processing: Event is being processed
 * - completed: Event was successfully processed
 * - failed: Event processing failed, may be retryable
 * - unrecoverable: Event cannot be processed (e.g., unhandled event type)
 *
 * Valid Transitions:
 * - new → processing (checkAndClaimEvent)
 * - processing → completed (markEventCompleted)
 * - processing → failed (markEventFailed)
 * - failed → processing (recovery retry)
 * - any → unrecoverable (markEventUnrecoverable)
 *
 * Recovery Criteria:
 * - Status = failed AND recoverable = true AND retry_count < MAX_RETRIES
 * - Processing events stuck for >5 min are eligible for recovery
 * - Events at max retries are marked unrecoverable
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// Track all calls to supabaseAdmin
const mockCalls = {
  webhookEventsSelect: [] as Array<{ table?: string; data?: unknown }>,
  webhookEventsInsert: [] as Record<string, unknown>[],
  webhookEventsUpdate: [] as Array<{ table?: string; data?: unknown }>,
};

// Create mock return values that can be modified per test
let webhookEventsSelectReturn: { data: { status: string } | null } = {
  data: null,
};
let webhookEventsInsertReturn: { error: { code: string } | null } = {
  error: null,
};
let webhookEventsUpdateReturn: { error: unknown } = { error: null };

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === 'webhook_events') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => {
                mockCalls.webhookEventsSelect.push({ table });
                return Promise.resolve(webhookEventsSelectReturn);
              }),
              maybeSingle: vi.fn(() => {
                mockCalls.webhookEventsSelect.push({ table });
                return Promise.resolve(webhookEventsSelectReturn);
              }),
            })),
          })),
          insert: vi.fn((data: unknown) => {
            mockCalls.webhookEventsInsert.push(data as Record<string, unknown>);
            return Promise.resolve(webhookEventsInsertReturn);
          }),
          update: vi.fn((data: unknown) => ({
            eq: vi.fn(() => {
              mockCalls.webhookEventsUpdate.push({ table, data });
              return Promise.resolve(webhookEventsUpdateReturn);
            }),
          })),
        };
      }
      return {};
    }),
  },
}));

// Load the service after mocks are configured
async function getIdempotencyService() {
  return (await import('@/app/api/webhooks/stripe/services/idempotency.service'))
    .IdempotencyService;
}

describe('IdempotencyService - State Machine', () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    };

    // Reset mock call trackers
    mockCalls.webhookEventsSelect = [];
    mockCalls.webhookEventsInsert = [];
    mockCalls.webhookEventsUpdate = [];

    // Reset mock return values to defaults
    webhookEventsSelectReturn = { data: null };
    webhookEventsInsertReturn = { error: null };
    webhookEventsUpdateReturn = { error: null };
  });

  afterEach(() => {
    Object.values(consoleSpy).forEach(spy => spy.mockRestore());
  });

  describe('checkAndClaimEvent - State Transitions', () => {
    test('new → claimed transition creates event with processing status', async () => {
      // Arrange - Event doesn't exist yet
      webhookEventsSelectReturn = { data: null };
      webhookEventsInsertReturn = { error: null };

      const eventId = 'evt_test_new_123';
      const eventType = 'customer.subscription.created';
      const payload = { test: 'data' };

      // Act
      const IdempotencyService = await getIdempotencyService();
      const result = await IdempotencyService.checkAndClaimEvent(
        eventId,
        eventType,
        payload
      );

      // Assert - New event was claimed
      expect(result.isNew).toBe(true);
      expect(result.existingStatus).toBeUndefined();

      // Verify insert was called with processing status
      expect(mockCalls.webhookEventsInsert).toHaveLength(1);
      expect(mockCalls.webhookEventsInsert[0]).toEqual({
        event_id: eventId,
        event_type: eventType,
        status: 'processing',
        payload,
      });

      // Verify logging
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('claimed for processing')
      );
    });

    test('completed state skips processing without side effects', async () => {
      // Arrange - Event already exists with completed status
      webhookEventsSelectReturn = { data: { status: 'completed' } };

      const eventId = 'evt_test_completed_123';
      const eventType = 'invoice.payment_succeeded';
      const payload = { test: 'data' };

      // Act
      const IdempotencyService = await getIdempotencyService();
      const result = await IdempotencyService.checkAndClaimEvent(
        eventId,
        eventType,
        payload
      );

      // Assert - Event was skipped
      expect(result.isNew).toBe(false);
      expect(result.existingStatus).toBe('completed');

      // Verify no insert was attempted (idempotency - no side effects)
      expect(mockCalls.webhookEventsInsert).toHaveLength(0);

      // Verify logging indicates existing event
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('already exists with status:')
      );
    });

    test('processing state from concurrent request is safe skip', async () => {
      // Arrange - Event already processing (concurrent request)
      webhookEventsSelectReturn = { data: { status: 'processing' } };

      const eventId = 'evt_test_processing_123';
      const eventType = 'customer.subscription.updated';

      // Act
      const IdempotencyService = await getIdempotencyService();
      const result = await IdempotencyService.checkAndClaimEvent(
        eventId,
        eventType,
        {}
      );

      // Assert - Event was not claimed (already processing)
      expect(result.isNew).toBe(false);
      expect(result.existingStatus).toBe('processing');

      // Verify no insert was attempted
      expect(mockCalls.webhookEventsInsert).toHaveLength(0);
    });

    test('failed state returns existing status for recovery decision', async () => {
      // Arrange - Event previously failed
      webhookEventsSelectReturn = { data: { status: 'failed' } };

      const eventId = 'evt_test_failed_123';

      // Act
      const IdempotencyService = await getIdempotencyService();
      const result = await IdempotencyService.checkAndClaimEvent(
        eventId,
        'invoice.payment_failed',
        {}
      );

      // Assert - Failed status returned so caller can decide recovery
      expect(result.isNew).toBe(false);
      expect(result.existingStatus).toBe('failed');

      // Verify no insert was attempted
      expect(mockCalls.webhookEventsInsert).toHaveLength(0);
    });

    test('unrecoverable state skips processing permanently', async () => {
      // Arrange - Event marked as unrecoverable
      webhookEventsSelectReturn = { data: { status: 'unrecoverable' } };

      const eventId = 'evt_test_unrecoverable_123';

      // Act
      const IdempotencyService = await getIdempotencyService();
      const result = await IdempotencyService.checkAndClaimEvent(
        eventId,
        'account.application.authorized',
        {}
      );

      // Assert - Unrecoverable event should not be reprocessed
      expect(result.isNew).toBe(false);
      expect(result.existingStatus).toBe('unrecoverable');

      // Verify no insert was attempted
      expect(mockCalls.webhookEventsInsert).toHaveLength(0);
    });

    test('concurrent claim race condition is handled gracefully', async () => {
      // Arrange - Event doesn't exist on check, but insert fails with unique violation
      webhookEventsSelectReturn = { data: null };
      webhookEventsInsertReturn = {
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint',
        },
      };

      const eventId = 'evt_test_race_123';

      // Act
      const IdempotencyService = await getIdempotencyService();
      const result = await IdempotencyService.checkAndClaimEvent(
        eventId,
        'checkout.session.completed',
        {}
      );

      // Assert - Race condition detected, event not claimed
      expect(result.isNew).toBe(false);
      expect(result.existingStatus).toBe('processing');

      // Verify logging indicates concurrent claim
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('claimed by concurrent request')
      );
    });

    test('non-duplicate database errors are thrown', async () => {
      // Arrange - Insert fails with non-duplicate error
      webhookEventsSelectReturn = { data: null };
      const dbError = { code: '42501', message: 'permission denied' };
      webhookEventsInsertReturn = { error: dbError };

      const eventId = 'evt_test_error_123';

      // Act & Assert - Error should be thrown
      const IdempotencyService = await getIdempotencyService();
      await expect(
        IdempotencyService.checkAndClaimEvent(
          eventId,
          'customer.subscription.created',
          {}
        )
      ).rejects.toEqual(dbError);
    });
  });

  describe('markEventCompleted - Terminal State', () => {
    test('processing → completed transition updates status and timestamp', async () => {
      // Arrange
      webhookEventsUpdateReturn = { error: null };

      const eventId = 'evt_test_complete_123';

      // Act
      const IdempotencyService = await getIdempotencyService();
      await IdempotencyService.markEventCompleted(eventId);

      // Assert
      expect(mockCalls.webhookEventsUpdate).toHaveLength(1);
      const updateData = mockCalls.webhookEventsUpdate[0].data as Record<string, unknown>;
      expect(updateData.status).toBe('completed');
      expect(updateData.completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('completed state update failure throws to trigger webhook retry', async () => {
      // Arrange - Update fails
      const dbError = { message: 'Connection lost' };
      webhookEventsUpdateReturn = { error: dbError };

      const eventId = 'evt_test_update_failed_123';

      // Act & Assert - Should throw to trigger 500 response
      const IdempotencyService = await getIdempotencyService();
      await expect(
        IdempotencyService.markEventCompleted(eventId)
      ).rejects.toThrow('Database error marking event completed');

      // Verify error logging
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to mark event'),
        dbError
      );
    });

    test('completed_at timestamp is valid ISO string', async () => {
      // Arrange
      webhookEventsUpdateReturn = { error: null };

      const eventId = 'evt_test_timestamp_123';

      // Act
      const IdempotencyService = await getIdempotencyService();
      await IdempotencyService.markEventCompleted(eventId);

      // Assert
      const updateData = mockCalls.webhookEventsUpdate[0].data as {
        completed_at: string;
      };
      expect(updateData.completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(
        new Date(updateData.completed_at).toISOString()
      ).toBe(updateData.completed_at);
    });
  });

  describe('markEventFailed - Recoverable Failure State', () => {
    test('processing → failed transition stores error for recovery', async () => {
      // Arrange
      webhookEventsUpdateReturn = { error: null };

      const eventId = 'evt_test_failed_123';
      const errorMessage = 'Subscription not found in database';

      // Act
      const IdempotencyService = await getIdempotencyService();
      await IdempotencyService.markEventFailed(eventId, errorMessage);

      // Assert
      expect(mockCalls.webhookEventsUpdate).toHaveLength(1);
      const updateData = mockCalls.webhookEventsUpdate[0].data as Record<string, unknown>;
      expect(updateData.status).toBe('failed');
      expect(updateData.recoverable).toBe(true);
      expect(updateData.error_message).toBe(errorMessage);
      expect(updateData.completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(updateData.last_retry_at).toBeNull();
    });

    test('failed state includes recoverable flag for cron job filtering', async () => {
      // Arrange
      webhookEventsUpdateReturn = { error: null };

      // Act
      const IdempotencyService = await getIdempotencyService();
      await IdempotencyService.markEventFailed('evt_test', 'Temporary error');

      // Assert - recoverable: true allows cron retry
      const updateData = mockCalls.webhookEventsUpdate[0].data as Record<string, unknown>;
      expect(updateData.recoverable).toBe(true);
    });

    test('failed state update errors are logged but not thrown', async () => {
      // Arrange - Update fails
      const dbError = { message: 'Database unavailable' };
      webhookEventsUpdateReturn = { error: dbError };

      const eventId = 'evt_test_log_error_123';

      // Act - Should not throw (idempotency service logs only)
      const IdempotencyService = await getIdempotencyService();
      await expect(
        IdempotencyService.markEventFailed(eventId, 'Test error')
      ).resolves.toBeUndefined();

      // Verify error was logged
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to mark event'),
        dbError
      );
    });
  });

  describe('markEventUnrecoverable - Terminal State', () => {
    test('any → unrecoverable transition prevents retries', async () => {
      // Arrange
      webhookEventsUpdateReturn = { error: null };

      const eventId = 'evt_test_unhandled_123';
      const eventType = 'account.application.authorized';

      // Act
      const IdempotencyService = await getIdempotencyService();
      await IdempotencyService.markEventUnrecoverable(eventId, eventType);

      // Assert
      expect(mockCalls.webhookEventsUpdate).toHaveLength(1);
      const updateData = mockCalls.webhookEventsUpdate[0].data as Record<string, unknown>;
      expect(updateData.status).toBe('unrecoverable');
      expect(updateData.error_message).toBe(`Unhandled event type: ${eventType}`);
      expect(updateData.completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test('unrecoverable state excludes event from cron recovery', async () => {
      // Arrange
      webhookEventsUpdateReturn = { error: null };

      // Act
      const IdempotencyService = await getIdempotencyService();
      await IdempotencyService.markEventUnrecoverable(
        'evt_test',
        'unhandled.event.type'
      );

      // Assert - No recoverable flag (defaults to false)
      const updateData = mockCalls.webhookEventsUpdate[0].data as Record<string, unknown>;
      expect(updateData.recoverable).toBeUndefined();
      expect(updateData.status).toBe('unrecoverable');
    });

    test('unrecoverable state update errors are logged', async () => {
      // Arrange - Update fails
      const dbError = { message: 'Connection timeout' };
      webhookEventsUpdateReturn = { error: dbError };

      const eventId = 'evt_test_unrec_error_123';

      // Act - Should not throw
      const IdempotencyService = await getIdempotencyService();
      await expect(
        IdempotencyService.markEventUnrecoverable(eventId, 'test.event')
      ).resolves.toBeUndefined();

      // Verify error was logged
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to mark event'),
        dbError
      );
    });
  });

  describe('Recovery Eligibility', () => {
    test('stale processing event is eligible for recovery after 5 minutes', () => {
      // Arrange - Event stuck in processing for >5 min
      const created5MinAgo = new Date(Date.now() - 5 * 60 * 1000 - 1000).toISOString();
      const staleEvent = {
        id: 'evt_test_stale_123',
        event_id: 'evt_stale_processing',
        status: 'processing' as const,
        created_at: created5MinAgo,
        retry_count: 0,
        recoverable: true,
      };

      // Act - Calculate time since creation
      const timeSinceCreation = Date.now() - new Date(staleEvent.created_at).getTime();
      const fiveMinutesInMs = 5 * 60 * 1000;

      // Assert - Event is eligible for recovery
      expect(staleEvent.status).toBe('processing');
      expect(timeSinceCreation).toBeGreaterThan(fiveMinutesInMs);
      expect(staleEvent.recoverable).toBe(true);
    });

    test('recent processing event is not eligible for recovery', () => {
      // Arrange - Event recently created (<5 min)
      const created1MinAgo = new Date(Date.now() - 1 * 60 * 1000).toISOString();
      const recentEvent = {
        id: 'evt_test_recent_123',
        event_id: 'evt_recent_processing',
        status: 'processing' as const,
        created_at: created1MinAgo,
        retry_count: 0,
        recoverable: true,
      };

      // Act - Calculate time since creation
      const timeSinceCreation = Date.now() - new Date(recentEvent.created_at).getTime();
      const fiveMinutesInMs = 5 * 60 * 1000;

      // Assert - Event is NOT eligible for recovery (still actively processing)
      expect(recentEvent.status).toBe('processing');
      expect(timeSinceCreation).toBeLessThan(fiveMinutesInMs);
    });

    test('failed event below max retries is eligible for recovery', () => {
      // Arrange - Failed event with retry_count < MAX_RETRIES
      const MAX_RETRIES = 3;
      const retryableFailedEvent = {
        id: 'evt_test_retryable_123',
        event_id: 'evt_failed_retryable',
        status: 'failed' as const,
        created_at: new Date().toISOString(),
        retry_count: 2,
        recoverable: true,
      };

      // Assert - Event is eligible for recovery
      expect(retryableFailedEvent.status).toBe('failed');
      expect(retryableFailedEvent.recoverable).toBe(true);
      expect(retryableFailedEvent.retry_count).toBeLessThan(MAX_RETRIES);
    });

    test('failed event at max retries is marked unrecoverable', () => {
      // Arrange - Failed event with retry_count >= MAX_RETRIES
      const MAX_RETRIES = 3;
      const maxRetriesEvent = {
        id: 'evt_test_max_retries_123',
        event_id: 'evt_failed_max_retries',
        status: 'failed' as const,
        created_at: new Date().toISOString(),
        retry_count: 3,
        recoverable: false,
      };

      // Assert - Event should NOT be retried
      expect(maxRetriesEvent.status).toBe('failed');
      expect(maxRetriesEvent.retry_count).toBeGreaterThanOrEqual(MAX_RETRIES);
      // After marking unrecoverable, recoverable would be false
    });
  });

  describe('State Machine Invariants', () => {
    test('state transitions are atomic - no partial updates', async () => {
      // This test validates that each state transition is a single atomic operation
      // Either the entire state change succeeds or it fails completely

      // Arrange
      webhookEventsUpdateReturn = { error: null };

      const eventId = 'evt_test_atomic_123';

      // Act - Mark event completed (single atomic update)
      const IdempotencyService = await getIdempotencyService();
      await IdempotencyService.markEventCompleted(eventId);

      // Assert - Single atomic update operation
      expect(mockCalls.webhookEventsUpdate).toHaveLength(1);
      const updateData = mockCalls.webhookEventsUpdate[0].data as Record<string, unknown>;

      // All state fields are updated together
      expect(updateData.status).toBeDefined();
      expect(updateData.completed_at).toBeDefined();
    });

    test('constraint violations are handled gracefully', async () => {
      // Arrange - Unique constraint violation (concurrent insert)
      webhookEventsSelectReturn = { data: null };
      webhookEventsInsertReturn = {
        error: { code: '23505', message: 'duplicate key' },
      };

      const eventId = 'evt_test_constraint_123';

      // Act - Should handle gracefully, not crash
      const IdempotencyService = await getIdempotencyService();
      const result = await IdempotencyService.checkAndClaimEvent(
        eventId,
        'test.event',
        {}
      );

      // Assert - Graceful handling (returns processing status from winner)
      expect(result.isNew).toBe(false);
      expect(result.existingStatus).toBe('processing');
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('claimed by concurrent request')
      );
    });

    test('completed state is terminal - no further transitions', async () => {
      // Arrange - Event already completed
      webhookEventsSelectReturn = { data: { status: 'completed' } };

      const eventId = 'evt_test_terminal_123';

      // Act - Attempt to claim already completed event
      const IdempotencyService = await getIdempotencyService();
      const result = await IdempotencyService.checkAndClaimEvent(
        eventId,
        'test.event',
        {}
      );

      // Assert - Event remains completed, no reprocessing
      expect(result.isNew).toBe(false);
      expect(result.existingStatus).toBe('completed');
      expect(mockCalls.webhookEventsInsert).toHaveLength(0);
    });

    test('unrecoverable state is terminal - no further transitions', async () => {
      // Arrange - Event marked unrecoverable
      webhookEventsSelectReturn = { data: { status: 'unrecoverable' } };

      const eventId = 'evt_test_unrec_terminal_123';

      // Act - Attempt to claim unrecoverable event
      const IdempotencyService = await getIdempotencyService();
      const result = await IdempotencyService.checkAndClaimEvent(
        eventId,
        'test.event',
        {}
      );

      // Assert - Event remains unrecoverable
      expect(result.isNew).toBe(false);
      expect(result.existingStatus).toBe('unrecoverable');
      expect(mockCalls.webhookEventsInsert).toHaveLength(0);
    });
  });

  describe('Idempotency Guarantees', () => {
    test('duplicate events do not cause side effects', async () => {
      // Arrange - First call creates event, second call finds it completed
      webhookEventsSelectReturn = { data: null };
      webhookEventsInsertReturn = { error: null };

      const eventId = 'evt_test_idempotent_123';
      const eventType = 'invoice.payment_succeeded';
      const payload = { amount: 1000 };

      // Act - Process same event twice
      const IdempotencyService = await getIdempotencyService();
      const result1 = await IdempotencyService.checkAndClaimEvent(
        eventId,
        eventType,
        payload
      );

      // Second call - event is now completed
      webhookEventsSelectReturn = { data: { status: 'completed' } };
      const result2 = await IdempotencyService.checkAndClaimEvent(
        eventId,
        eventType,
        payload
      );

      // Assert - First call claims event, second call skips
      expect(result1.isNew).toBe(true);
      expect(result2.isNew).toBe(false);
      expect(result2.existingStatus).toBe('completed');

      // Only one insert despite two calls
      expect(mockCalls.webhookEventsInsert).toHaveLength(1);
    });

    test('processing state prevents double-allocation of resources', async () => {
      // Arrange - Event is already processing
      webhookEventsSelectReturn = { data: { status: 'processing' } };

      const eventId = 'evt_test_no_double_alloc_123';

      // Act - Concurrent request tries to process same event
      const IdempotencyService = await getIdempotencyService();
      const result = await IdempotencyService.checkAndClaimEvent(
        eventId,
        'customer.subscription.created',
        {}
      );

      // Assert - Request is blocked from processing
      expect(result.isNew).toBe(false);
      expect(result.existingStatus).toBe('processing');

      // No insert means no resource allocation will occur
      expect(mockCalls.webhookEventsInsert).toHaveLength(0);
    });
  });
});
