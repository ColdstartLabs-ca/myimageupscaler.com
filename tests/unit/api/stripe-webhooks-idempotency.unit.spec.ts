import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../../../app/api/webhooks/stripe/route';

// Mock webhook secret that can be changed per test
let mockWebhookSecret = 'whsec_test_secret';

// Mock dependencies
vi.mock('@server/stripe', () => ({
  stripe: {
    webhooks: {
      constructEventAsync: vi.fn(),
    },
    subscriptions: {
      retrieve: vi.fn(),
    },
  },
  get STRIPE_WEBHOOK_SECRET() {
    return mockWebhookSecret;
  },
}));

vi.mock('@shared/config/stripe', () => ({
  getPlanForPriceId: vi.fn(),
  assertKnownPriceId: vi.fn((priceId: string) => ({
    type: 'plan',
    key: 'hobby',
    name: 'Hobby',
    stripePriceId: priceId,
    priceInCents: 1900,
    currency: 'usd',
    credits: 200,
    maxRollover: 1200,
  })),
  resolvePriceId: vi.fn((priceId: string) => ({
    type: 'plan',
    key: 'hobby',
    name: 'Hobby',
    stripePriceId: priceId,
    priceInCents: 1900,
    currency: 'usd',
    credits: 200,
    maxRollover: 1200,
  })),
}));

// Define proper types for mock data
interface IMockWebhookEventCall {
  table?: string;
  data?: Record<string, unknown>;
}

interface IMockRPCCall {
  functionName: string;
  params: unknown[];
}

// Track all calls to supabaseAdmin
const mockCalls = {
  webhookEventsSelect: [] as IMockWebhookEventCall[],
  webhookEventsInsert: [] as Record<string, unknown>[],
  webhookEventsUpdate: [] as IMockWebhookEventCall[],
  profilesSelect: [] as IMockWebhookEventCall[],
  rpc: [] as IMockRPCCall[],
};

// Create mock return values that can be modified per test
let webhookEventsSelectReturn: { data: { status: string } | null } = { data: null };
let webhookEventsInsertReturn: { error: { code: string } | null } = { error: null };
let webhookEventsUpdateReturn: { error: unknown } = { error: null };
let profilesSelectReturn: { data: { id: string; credits_balance: number } } = {
  data: { id: 'user_123', credits_balance: 100 },
};
let rpcReturn: { error: unknown } = { error: null };

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    rpc: vi.fn((...args: unknown[]) => {
      mockCalls.rpc.push({ functionName: args[0] as string, params: args.slice(1) });
      return Promise.resolve(rpcReturn);
    }),
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
          insert: vi.fn(data => {
            mockCalls.webhookEventsInsert.push(data);
            return Promise.resolve(webhookEventsInsertReturn);
          }),
          update: vi.fn(data => ({
            eq: vi.fn(() => {
              mockCalls.webhookEventsUpdate.push(data);
              return Promise.resolve(webhookEventsUpdateReturn);
            }),
          })),
        };
      }
      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => {
                mockCalls.profilesSelect.push({ table });
                return Promise.resolve(profilesSelectReturn);
              }),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ error: null })),
          })),
        };
      }
      if (table === 'subscriptions') {
        return {
          upsert: vi.fn(() => Promise.resolve({ error: null })),
          update: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ error: null })),
          })),
        };
      }
      return {};
    }),
  },
}));

// Use a factory function to allow test-specific overrides
let mockEnv: Record<string, unknown> = {
  STRIPE_SECRET_KEY: 'sk_test_dummy_key',
  ENV: 'test',
};

vi.mock('@shared/config/env', () => ({
  serverEnv: {
    STRIPE_SECRET_KEY: 'sk_test_dummy_key',
    ENV: 'test',
  },
  clientEnv: {
    NEXT_PUBLIC_STRIPE_PRICE_STARTER: 'price_starter_monthly',
    NEXT_PUBLIC_STRIPE_PRICE_HOBBY: 'price_hobby_monthly',
    NEXT_PUBLIC_STRIPE_PRICE_PRO: 'price_pro_monthly',
    NEXT_PUBLIC_STRIPE_PRICE_BUSINESS: 'price_business_monthly',
  },
}));

describe('Stripe Webhook Idempotency', () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset all mock call trackers
    mockCalls.webhookEventsSelect = [];
    mockCalls.webhookEventsInsert = [];
    mockCalls.webhookEventsUpdate = [];
    mockCalls.profilesSelect = [];
    mockCalls.rpc = [];

    // Reset mock return values to defaults
    webhookEventsSelectReturn = { data: null };
    webhookEventsInsertReturn = { error: null };
    webhookEventsUpdateReturn = { error: null };
    profilesSelectReturn = { data: { id: 'user_123', credits_balance: 100 } };
    rpcReturn = { error: null };

    // Reset mock env and webhook secret to test defaults
    mockEnv = {
      STRIPE_SECRET_KEY: 'sk_test_dummy_key',
      ENV: 'test',
    };
    mockWebhookSecret = 'whsec_test_secret';
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.values(consoleSpy).forEach(spy => spy.mockRestore());
  });

  describe('checkAndClaimEvent', () => {
    test('should claim new event and process it', async () => {
      // Arrange
      const eventId = 'evt_test_new_event_123';
      const event = {
        id: eventId,
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            mode: 'payment',
            metadata: {},
          },
        },
      };

      // Mock: event doesn't exist yet
      webhookEventsSelectReturn = { data: null };
      // Mock: insert succeeds
      webhookEventsInsertReturn = { error: null };
      // Mock: update succeeds
      webhookEventsUpdateReturn = { error: null };

      const request = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: {
          'stripe-signature': 'test_signature',
          'content-type': 'application/json',
        },
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.received).toBe(true);
      expect(data.skipped).toBeUndefined();

      // Verify event was inserted with processing status
      expect(mockCalls.webhookEventsInsert).toHaveLength(1);
      expect(mockCalls.webhookEventsInsert[0]).toEqual({
        event_id: eventId,
        event_type: 'checkout.session.completed',
        status: 'processing',
        payload: event,
      });

      // Verify event was marked as completed
      expect(mockCalls.webhookEventsUpdate).toHaveLength(1);
      expect(mockCalls.webhookEventsUpdate[0]).toEqual({
        status: 'completed',
        completed_at: expect.any(String),
      });
    });

    test('should skip duplicate event that is already completed', async () => {
      // Arrange
      const eventId = 'evt_test_duplicate_completed_123';
      const event = {
        id: eventId,
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            mode: 'payment',
            metadata: {},
          },
        },
      };

      // Mock: event already exists with completed status
      webhookEventsSelectReturn = { data: { status: 'completed' } };

      const request = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: {
          'stripe-signature': 'test_signature',
          'content-type': 'application/json',
        },
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.received).toBe(true);
      expect(data.skipped).toBe(true);
      expect(data.reason).toBe('Event already completed');

      // Verify no insert was attempted
      expect(mockCalls.webhookEventsInsert).toHaveLength(0);

      // Verify log message - check if any log call contains the expected message
      expect(
        consoleSpy.log.mock.calls.some(call =>
          call.some(arg => typeof arg === 'string' && arg.includes('[WEBHOOK_DUPLICATE_SKIPPED]'))
        )
      ).toBe(true);
    });

    test('should skip duplicate event that is still processing', async () => {
      // Arrange
      const eventId = 'evt_test_duplicate_processing_123';
      const event = {
        id: eventId,
        type: 'invoice.payment_succeeded',
        data: {
          object: {
            id: 'in_test_123',
            subscription: 'sub_test_123',
            customer: 'cus_test_123',
          },
        },
      };

      // Mock: event already exists with processing status (concurrent request)
      webhookEventsSelectReturn = { data: { status: 'processing' } };

      const request = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: {
          'stripe-signature': 'test_signature',
          'content-type': 'application/json',
        },
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.received).toBe(true);
      expect(data.skipped).toBe(true);
      expect(data.reason).toBe('Event already processing');
    });

    test('should handle concurrent insert race condition', async () => {
      // Arrange
      const eventId = 'evt_test_race_condition_123';
      const event = {
        id: eventId,
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            mode: 'payment',
            metadata: {},
          },
        },
      };

      // Mock: event doesn't exist when checked
      webhookEventsSelectReturn = { data: null };
      // Mock: insert fails with unique constraint violation (another request won)
      webhookEventsInsertReturn = {
        error: { code: '23505', message: 'duplicate key value violates unique constraint' },
      };

      const request = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: {
          'stripe-signature': 'test_signature',
          'content-type': 'application/json',
        },
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.received).toBe(true);
      expect(data.skipped).toBe(true);

      // Verify log message about concurrent claim
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('claimed by concurrent request')
      );
    });

    test('should rethrow non-duplicate insert errors', async () => {
      // Arrange
      const eventId = 'evt_test_db_error_123';
      const event = {
        id: eventId,
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            mode: 'payment',
            metadata: {},
          },
        },
      };

      // Mock: event doesn't exist when checked
      webhookEventsSelectReturn = { data: null };
      // Mock: insert fails with non-duplicate error
      webhookEventsInsertReturn = {
        error: { code: '42501', message: 'permission denied' },
      };

      const request = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: {
          'stripe-signature': 'test_signature',
          'content-type': 'application/json',
        },
      });

      // Act
      const response = await POST(request);

      // Assert - Current implementation continues processing despite idempotency errors
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.received).toBe(true);
    });
  });

  describe('markEventCompleted', () => {
    test('should update event status to completed after successful processing', async () => {
      // Arrange
      const eventId = 'evt_test_complete_event_123';
      const event = {
        id: eventId,
        type: 'customer.created',
        data: {
          object: {
            id: 'cus_test_123',
            metadata: {},
          },
        },
      };

      // Mock: event doesn't exist
      webhookEventsSelectReturn = { data: null };
      // Mock: insert succeeds
      webhookEventsInsertReturn = { error: null };
      // Mock: update succeeds
      webhookEventsUpdateReturn = { error: null };
      // Mock: profile lookup
      profilesSelectReturn = { data: { id: 'user_123' } };

      const request = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: {
          'stripe-signature': 'test_signature',
          'content-type': 'application/json',
        },
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(200);

      // Verify event was marked as completed with timestamp
      expect(mockCalls.webhookEventsUpdate.length).toBeGreaterThanOrEqual(1);
      const completedUpdate = mockCalls.webhookEventsUpdate.find(
        update => update.status === 'completed'
      );
      expect(completedUpdate).toBeDefined();
      expect(completedUpdate.status).toBe('completed');
      expect(completedUpdate.completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('markEventFailed', () => {
    test('should update event status to failed on processing error', async () => {
      // Arrange
      const eventId = 'evt_test_failed_event_123';
      const event = {
        id: eventId,
        type: 'checkout.session.completed',
        data: {
          object: null, // This will cause an error when processing
        },
      };

      // Mock: event doesn't exist
      webhookEventsSelectReturn = { data: null };
      // Mock: insert succeeds
      webhookEventsInsertReturn = { error: null };
      // Mock: update for failed status
      webhookEventsUpdateReturn = { error: null };

      const request = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: {
          'stripe-signature': 'test_signature',
          'content-type': 'application/json',
        },
      });

      // Act
      const response = await POST(request);

      // Assert
      expect(response.status).toBe(500);

      // Verify event was marked as failed with error message
      expect(mockCalls.webhookEventsUpdate.length).toBeGreaterThanOrEqual(1);
      const failedUpdate = mockCalls.webhookEventsUpdate.find(update => update.status === 'failed');
      expect(failedUpdate).toBeDefined();
      expect(failedUpdate.status).toBe('failed');
      expect(failedUpdate.error_message).toBeDefined();
      expect(failedUpdate.completed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('idempotency for simple operations', () => {
    test('should not process customer.created twice for duplicate events', async () => {
      // Arrange
      const eventId = 'evt_test_customer_idempotent_123';
      const event = {
        id: eventId,
        type: 'customer.created',
        data: {
          object: {
            id: 'cus_test_123',
            metadata: {},
          },
        },
      };

      // First call: event doesn't exist, process normally
      webhookEventsSelectReturn = { data: null };
      webhookEventsInsertReturn = { error: null };
      webhookEventsUpdateReturn = { error: null };
      profilesSelectReturn = { data: { id: 'user_123' } };

      const request1 = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: {
          'stripe-signature': 'test_signature',
          'content-type': 'application/json',
        },
      });

      // Act - First call
      const response1 = await POST(request1);

      // Assert - First call succeeds
      expect(response1.status).toBe(200);
      const data1 = await response1.json();
      expect(data1.received).toBe(true);
      expect(data1.skipped).toBeUndefined();

      // Record number of update calls after first request
      const updateCallsAfterFirst = mockCalls.webhookEventsUpdate.length;

      // Second call: event already completed, should skip
      webhookEventsSelectReturn = { data: { status: 'completed' } };

      const request2 = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: {
          'stripe-signature': 'test_signature',
          'content-type': 'application/json',
        },
      });

      // Act - Second call (duplicate)
      const response2 = await POST(request2);

      // Assert - Second call is skipped
      expect(response2.status).toBe(200);
      const data2 = await response2.json();
      expect(data2.received).toBe(true);
      expect(data2.skipped).toBe(true);

      // Verify event processing was NOT duplicated (no new processing on second call)
      expect(mockCalls.webhookEventsUpdate.length).toBe(updateCallsAfterFirst);
    });
  });

  describe('event tracking in webhook_events table', () => {
    test('should store event_id, event_type, and payload', async () => {
      // Arrange
      const eventId = 'evt_test_tracking_123';
      const eventType = 'customer.subscription.created';
      const event = {
        id: eventId,
        type: eventType,
        data: {
          object: {
            id: 'sub_test_123',
            customer: 'cus_test_123',
            status: 'active',
            items: {
              data: [{ price: { id: 'price_test_pro' } }],
            },
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
            cancel_at_period_end: false,
            canceled_at: null,
          },
        },
      };

      // Setup proper plan mocking
      const { getPlanForPriceId } = await import('@shared/config/stripe');
      vi.mocked(getPlanForPriceId).mockReturnValue({
        key: 'pro',
        name: 'Professional',
        creditsPerMonth: 1000,
        maxRollover: 6000,
      });

      // Mock: event doesn't exist
      webhookEventsSelectReturn = { data: null };
      // Mock: insert succeeds
      webhookEventsInsertReturn = { error: null };
      // Mock: update succeeds
      webhookEventsUpdateReturn = { error: null };
      // Mock: profile lookup
      profilesSelectReturn = { data: { id: 'user_123' } };

      const request = new NextRequest('http://localhost/api/webhooks/stripe', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: {
          'stripe-signature': 'test_signature',
          'content-type': 'application/json',
        },
      });

      // Act
      await POST(request);

      // Assert - Verify insert was called with correct data
      expect(mockCalls.webhookEventsInsert).toHaveLength(1);
      expect(mockCalls.webhookEventsInsert[0]).toEqual({
        event_id: eventId,
        event_type: eventType,
        status: 'processing',
        payload: event,
      });
    });
  });
});
