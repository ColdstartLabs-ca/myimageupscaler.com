import { describe, test, expect, beforeEach, vi } from 'vitest';
import { WebhookSequencer } from '../../helpers/webhook-sequencer';
import type { IStripeEventMock } from '../../helpers/stripe-webhook-mocks';

// Mock event factory
const createMockEvent = (
  eventType: string,
  eventId: string = `evt_test_${Date.now()}`
): IStripeEventMock => ({
  id: eventId,
  object: 'event',
  api_version: '2023-10-16',
  created: Math.floor(Date.now() / 1000),
  data: { object: {} },
  livemode: false,
  pending_webhooks: 1,
  request: null,
  type: eventType,
});

// Mock handler
const createMockHandler = (status: number = 200, response: any = { success: true }) => {
  return vi.fn(async () => ({
    status,
    data: response,
  }));
};

describe('webhook-sequencer', () => {
  let mockSupabase: any;
  let mockHandler: any;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn(),
    };
    mockHandler = createMockHandler(200, { success: true });
  });

  describe('sequential execution', () => {
    test('should fire events in configured order', async () => {
      const sequencer = new WebhookSequencer(mockSupabase, () => mockHandler);

      const events = [
        () => createMockEvent('event.first'),
        () => createMockEvent('event.second'),
        () => createMockEvent('event.third'),
      ];

      const results = await sequencer.sequence(events);

      expect(results).toHaveLength(3);
      expect(results[0].eventType).toBe('event.first');
      expect(results[1].eventType).toBe('event.second');
      expect(results[2].eventType).toBe('event.third');
    });

    test('should return all responses', async () => {
      const sequencer = new WebhookSequencer(mockSupabase, () => mockHandler);

      const events = [
        () => createMockEvent('event.one'),
        () => createMockEvent('event.two'),
      ];

      const results = await sequencer.sequence(events);

      expect(results).toHaveLength(2);
      expect(results[0].response).toBeDefined();
      expect(results[0].status).toBe(200);
      expect(results[1].response).toBeDefined();
      expect(results[1].status).toBe(200);
    });

    test('should include event IDs in results', async () => {
      const sequencer = new WebhookSequencer(mockSupabase, () => mockHandler);

      const events = [
        () => createMockEvent('event.test', 'evt_test_001'),
        () => createMockEvent('event.test', 'evt_test_002'),
      ];

      const results = await sequencer.sequence(events);

      expect(results[0].eventId).toBe('evt_test_001');
      expect(results[1].eventId).toBe('evt_test_002');
    });
  });

  describe('delay support', () => {
    test('should add delay between events when specified', async () => {
      const sequencer = new WebhookSequencer(mockSupabase, () => mockHandler);

      const events = [
        () => createMockEvent('event.first'),
        () => createMockEvent('event.second'),
      ];

      const startTime = Date.now();
      await sequencer.sequence(events, { delay: 100 });
      const elapsedTime = Date.now() - startTime;

      // Should take at least 100ms for the delay
      expect(elapsedTime).toBeGreaterThanOrEqual(100);
    });

    test('should not add delay after last event', async () => {
      const sequencer = new WebhookSequencer(mockSupabase, () => mockHandler);

      const events = [() => createMockEvent('event.single')];

      const startTime = Date.now();
      await sequencer.sequence(events, { delay: 100 });
      const elapsedTime = Date.now() - startTime;

      // Should complete quickly (no delay after last event)
      expect(elapsedTime).toBeLessThan(100);
    });
  });

  describe('error handling', () => {
    test('should handle errors in individual events', async () => {
      const errorHandler = vi.fn(async () => {
        throw new Error('Handler failed');
      });
      const sequencer = new WebhookSequencer(mockSupabase, () => errorHandler);

      const events = [() => createMockEvent('event.error')];

      const results = await sequencer.sequence(events);

      expect(results).toHaveLength(1);
      expect(results[0].error).toBeDefined();
      expect(results[0].error?.message).toBe('Handler failed');
    });

    test('should stop on error when stopOnError is true', async () => {
      let callCount = 0;
      const conditionalHandler = vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('First event failed');
        }
        return { status: 200 };
      });
      const sequencer = new WebhookSequencer(mockSupabase, () => conditionalHandler);

      const events = [
        () => createMockEvent('event.first'),
        () => createMockEvent('event.second'),
        () => createMockEvent('event.third'),
      ];

      const results = await sequencer.sequence(events, { stopOnError: true });

      // Should only process first event before stopping
      expect(callCount).toBe(1);
      expect(results).toHaveLength(1);
    });

    test('should continue on error when stopOnError is false', async () => {
      let callCount = 0;
      const conditionalHandler = vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('First event failed');
        }
        return { status: 200 };
      });
      const sequencer = new WebhookSequencer(mockSupabase, () => conditionalHandler);

      const events = [
        () => createMockEvent('event.first'),
        () => createMockEvent('event.second'),
        () => createMockEvent('event.third'),
      ];

      const results = await sequencer.sequence(events, { stopOnError: false });

      // Should process all events
      expect(callCount).toBe(3);
      expect(results).toHaveLength(3);
    });

    test('should return error status for failed handlers', async () => {
      const errorHandler = vi.fn(async () => {
        throw new Error('Handler error');
      });
      const sequencer = new WebhookSequencer(mockSupabase, () => errorHandler);

      const events = [() => createMockEvent('event.error')];

      const results = await sequencer.sequence(events);

      expect(results[0].status).toBe(500);
      expect(results[0].error).toBeDefined();
    });

    test('should handle missing handler gracefully', async () => {
      const sequencer = new WebhookSequencer(mockSupabase, () => null);

      const events = [() => createMockEvent('event.unknown')];

      const results = await sequencer.sequence(events);

      expect(results[0].status).toBe(404);
      expect(results[0].error).toBeDefined();
      expect(results[0].error?.message).toContain('No handler found');
    });
  });

  describe('concurrent execution', () => {
    test('should fire events concurrently when enabled', async () => {
      let executionOrder: string[] = [];
      const trackingHandler = vi.fn(async (event: IStripeEventMock) => {
        executionOrder.push(event.type);
        await new Promise(resolve => setTimeout(resolve, 10));
        return { status: 200 };
      });
      const sequencer = new WebhookSequencer(mockSupabase, () => trackingHandler);

      const events = [
        () => createMockEvent('event.first'),
        () => createMockEvent('event.second'),
        () => createMockEvent('event.third'),
      ];

      const startTime = Date.now();
      await sequencer.sequence(events, { concurrent: true });
      const elapsedTime = Date.now() - startTime;

      // With concurrency, should take ~10ms (not ~30ms sequential)
      expect(elapsedTime).toBeLessThan(25);
    });

    test('should return all results from concurrent execution', async () => {
      const trackingHandler = vi.fn(async () => ({ status: 200 }));
      const sequencer = new WebhookSequencer(mockSupabase, () => trackingHandler);

      const events = [
        () => createMockEvent('event.one'),
        () => createMockEvent('event.two'),
        () => createMockEvent('event.three'),
      ];

      const results = await sequencer.sequence(events, { concurrent: true });

      expect(results).toHaveLength(3);
      expect(results.every(r => r.status === 200)).toBe(true);
    });
  });

  describe('async event generators', () => {
    test('should handle async event generators', async () => {
      const asyncHandler = vi.fn(async () => ({ status: 200 }));
      const sequencer = new WebhookSequencer(mockSupabase, () => asyncHandler);

      const events = [
        async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return createMockEvent('event.async');
        },
      ];

      const results = await sequencer.sequence(events);

      expect(results).toHaveLength(1);
      expect(results[0].eventType).toBe('event.async');
    });
  });

  describe('static helpers', () => {
    describe('assertAllSuccess', () => {
      test('should pass when all events succeed', () => {
        const results = [
          { eventType: 'event.one', eventId: 'evt_1', status: 200, response: {} },
          { eventType: 'event.two', eventId: 'evt_2', status: 200, response: {} },
        ];

        expect(() => WebhookSequencer.assertAllSuccess(results)).not.toThrow();
      });

      test('should throw when any event fails with error', () => {
        const results = [
          { eventType: 'event.one', eventId: 'evt_1', status: 200, response: {} },
          {
            eventType: 'event.two',
            eventId: 'evt_2',
            status: 500,
            response: null,
            error: new Error('Failed'),
          },
        ];

        expect(() => WebhookSequencer.assertAllSuccess(results)).toThrow('1 webhook event(s) failed');
      });

      test('should throw when any event returns 4xx status', () => {
        const results = [
          { eventType: 'event.one', eventId: 'evt_1', status: 200, response: {} },
          { eventType: 'event.two', eventId: 'evt_2', status: 404, response: null },
        ];

        expect(() => WebhookSequencer.assertAllSuccess(results)).toThrow('1 webhook event(s) failed');
      });

      test('should report all failures in error message', () => {
        const results = [
          { eventType: 'event.one', eventId: 'evt_1', status: 200, response: {} },
          {
            eventType: 'event.two',
            eventId: 'evt_2',
            status: 500,
            response: null,
            error: new Error('Error 2'),
          },
          {
            eventType: 'event.three',
            eventId: 'evt_3',
            status: 400,
            response: null,
            error: new Error('Error 3'),
          },
        ];

        expect(() => WebhookSequencer.assertAllSuccess(results)).toThrow('2 webhook event(s) failed');
      });
    });

    describe('assertOrdered', () => {
      test('should pass when events are in chronological order', () => {
        const results = [
          { eventType: 'event.one', eventId: 'evt_11700000001', status: 200, response: {} },
          { eventType: 'event.two', eventId: 'evt_11700000002', status: 200, response: {} },
          { eventType: 'event.three', eventId: 'evt_11700000003', status: 200, response: {} },
        ];

        expect(() => WebhookSequencer.assertOrdered(results)).not.toThrow();
      });

      test('should throw when events are out of order', () => {
        const results = [
          { eventType: 'event.one', eventId: 'evt_11700000003', status: 200, response: {} },
          { eventType: 'event.two', eventId: 'evt_11700000001', status: 200, response: {} },
        ];

        expect(() => WebhookSequencer.assertOrdered(results)).toThrow('Events not in chronological order');
      });

      test('should handle events without extractable timestamps', () => {
        const results = [
          { eventType: 'event.one', eventId: 'evt_no_timestamp_1', status: 200, response: {} },
          { eventType: 'event.two', eventId: 'evt_no_timestamp_2', status: 200, response: {} },
        ];

        // Should not throw when timestamps can't be extracted
        expect(() => WebhookSequencer.assertOrdered(results)).not.toThrow();
      });
    });
  });
});
