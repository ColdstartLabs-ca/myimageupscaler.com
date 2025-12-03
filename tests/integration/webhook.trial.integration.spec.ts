import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { POST as webhookHandler } from '@app/api/webhooks/stripe/route';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { stripe, STRIPE_WEBHOOK_SECRET } from '@server/stripe';
import { getTrialConfig, getPlanConfig } from '@shared/config/subscription.config';
import { getPlanForPriceId } from '@shared/config/stripe';
import dayjs from 'dayjs';

// Mock dependencies
vi.mock('@server/stripe');
vi.mock('@server/supabase/supabaseAdmin');
vi.mock('@shared/config/subscription.config');
vi.mock('@shared/config/stripe');
vi.mock('@shared/config/subscription.utils');
vi.mock('dayjs', () => {
  const mockDayjs = vi.fn((timestamp?: number) => {
    const date = timestamp ? new Date(timestamp * 1000) : new Date();
    return {
      toISOString: vi.fn(() => date.toISOString()),
      unix: vi.fn(() => Math.floor(date.getTime() / 1000)),
    };
  });
  return mockDayjs;
});

const mockStripe = vi.mocked(stripe);
const mockSupabaseAdmin = vi.mocked(supabaseAdmin);
const mockGetTrialConfig = vi.mocked(getTrialConfig);
const mockGetPlanConfig = vi.mocked(getPlanConfig);
const mockGetPlanForPriceId = vi.mocked(getPlanForPriceId);

describe('Webhook Handler - Trial Integration', () => {
  let mockRequest: (event: any) => NextRequest;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    mockSupabaseAdmin.from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'user_123' },
            error: null,
          }),
        }),
      }),
    });

    mockSupabaseAdmin.from = vi.fn().mockReturnValue((table: string) => {
      if (table === 'webhook_events') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'user_123',
                  subscription_status: null,
                  credits_balance: 0,
                },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      if (table === 'subscriptions') {
        return {
          upsert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return {
        rpc: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    mockRequest = (event: any) => {
      const body = JSON.stringify(event);
      const signature = 'stripe-signature';

      return new NextRequest('http://localhost:3000/api/webhooks/stripe', {
        method: 'POST',
        headers: {
          'stripe-signature': signature,
          'Content-Type': 'application/json',
        },
        body,
      });
    };
  });

  describe('Trial Start Handling', () => {
    it('handles customer.subscription.created with trial', async () => {
      const trialSubscriptionEvent = {
        id: 'evt_test_123',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_test_123',
            customer: 'cus_test_123',
            status: 'trialing',
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor(Date.now() / 1000) + (14 * 24 * 60 * 60), // 14 days
            trial_end: Math.floor(Date.now() / 1000) + (14 * 24 * 60 * 60),
            cancel_at_period_end: false,
            items: {
              data: [{
                price: {
                  id: 'price_pro_monthly',
                },
              }],
            },
          },
        },
      };

      // Mock trial configuration
      mockGetTrialConfig.mockReturnValue({
        enabled: true,
        durationDays: 14,
        trialCredits: 100,
        requirePaymentMethod: true,
        allowMultipleTrials: false,
        autoConvertToPaid: true,
      });

      mockGetPlanConfig.mockReturnValue({
        key: 'pro',
        name: 'Professional',
        creditsPerCycle: 1000,
        trial: {
          enabled: true,
          durationDays: 14,
          trialCredits: 100,
          requirePaymentMethod: true,
          allowMultipleTrials: false,
          autoConvertToPaid: true,
        },
      } as any);

      // Mock successful credit allocation
      mockSupabaseAdmin.rpc.mockResolvedValue({ error: null });

      // Mock webhook event creation
      mockSupabaseAdmin.from.mockReturnValue((table: string) => {
        if (table === 'webhook_events') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        return {
          upsert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'user_123' }, error: null }),
            }),
          }),
          rpc: vi.fn().mockResolvedValue({ error: null }),
        };
      });

      const request = mockRequest(trialSubscriptionEvent);
      const response = await webhookHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.received).toBe(true);

      // Verify trial credits were allocated
      expect(mockSupabaseAdmin.rpc).toHaveBeenCalledWith('increment_credits_with_log', {
        target_user_id: 'user_123',
        amount: 100,
        transaction_type: 'trial',
        ref_id: 'sub_test_123',
        description: 'Trial credits - Professional plan - 100 credits',
      });

      // Verify subscription was stored with trial end date
      expect(mockSupabaseAdmin.from).toHaveBeenCalledWith('subscriptions');
    });

    it('allocates regular plan credits when trialCredits is null', async () => {
      const trialSubscriptionEvent = {
        id: 'evt_test_123',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_test_123',
            customer: 'cus_test_123',
            status: 'trialing',
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor(Date.now() / 1000) + (14 * 24 * 60 * 60),
            trial_end: Math.floor(Date.now() / 1000) + (14 * 24 * 60 * 60),
            cancel_at_period_end: false,
            items: {
              data: [{
                price: {
                  id: 'price_pro_monthly',
                },
              }],
            },
          },
        },
      };

      // Mock trial configuration with null trialCredits (use regular credits)
      mockGetTrialConfig.mockReturnValue({
        enabled: true,
        durationDays: 14,
        trialCredits: null, // Use regular credits
        requirePaymentMethod: true,
        allowMultipleTrials: false,
        autoConvertToPaid: true,
      });

      mockGetPlanConfig.mockReturnValue({
        key: 'pro',
        name: 'Professional',
        creditsPerCycle: 1000,
        trial: {
          enabled: true,
          durationDays: 14,
          trialCredits: null,
          requirePaymentMethod: true,
          allowMultipleTrials: false,
          autoConvertToPaid: true,
        },
      } as any);

      // Mock successful credit allocation
      mockSupabaseAdmin.rpc.mockResolvedValue({ error: null });

      // Mock webhook event creation
      mockSupabaseAdmin.from.mockReturnValue((table: string) => {
        if (table === 'webhook_events') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        return {
          upsert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'user_123' }, error: null }),
            }),
          }),
          rpc: vi.fn().mockResolvedValue({ error: null }),
        };
      });

      const request = mockRequest(trialSubscriptionEvent);
      const response = await webhookHandler(request);

      expect(response.status).toBe(200);

      // Verify regular credits were allocated (1000 instead of trial credits)
      expect(mockSupabaseAdmin.rpc).toHaveBeenCalledWith('increment_credits_with_log', {
        target_user_id: 'user_123',
        amount: 1000,
        transaction_type: 'trial',
        ref_id: 'sub_test_123',
        description: 'Trial credits - Professional plan - 1000 credits',
      });
    });
  });

  describe('Trial Conversion Handling', () => {
    it('handles trial to active conversion with different credit amounts', async () => {
      const trialConversionEvent = {
        id: 'evt_test_456',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test_123',
            customer: 'cus_test_123',
            status: 'active', // Converted from trialing
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60),
            trial_end: Math.floor(Date.now() / 1000) - (1 * 24 * 60 * 60), // Trial ended yesterday
            cancel_at_period_end: false,
            items: {
              data: [{
                price: {
                  id: 'price_pro_monthly',
                },
              }],
            },
          },
        },
      };

      // Mock trial configuration
      mockGetTrialConfig.mockReturnValue({
        enabled: true,
        durationDays: 14,
        trialCredits: 100,
        requirePaymentMethod: true,
        allowMultipleTrials: false,
        autoConvertToPaid: true,
      });

      mockGetPlanConfig.mockReturnValue({
        key: 'pro',
        name: 'Professional',
        creditsPerCycle: 1000,
        trial: {
          enabled: true,
          durationDays: 14,
          trialCredits: 100,
          requirePaymentMethod: true,
          allowMultipleTrials: false,
          autoConvertToPaid: true,
        },
      } as any);

      // Mock user profile with existing trial credits
      mockSupabaseAdmin.from.mockReturnValue((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'user_123',
                    subscription_status: 'trialing', // Previous status
                    credits_balance: 45, // Has some trial credits left
                  },
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        return {
          upsert: vi.fn().mockResolvedValue({ error: null }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'user_123' }, error: null }),
            }),
          }),
          rpc: vi.fn().mockResolvedValue({ error: null }),
          insert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      });

      // Mock webhook event creation
      mockSupabaseAdmin.from.mockReturnValue((table: string) => {
        if (table === 'webhook_events') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        return {
          upsert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'user_123' }, error: null }),
            }),
          }),
          rpc: vi.fn().mockResolvedValue({ error: null }),
        };
      });

      const request = mockRequest(trialConversionEvent);
      const response = await webhookHandler(request);

      expect(response.status).toBe(200);

      // Verify additional credits were added (1000 - 45 = 955)
      expect(mockSupabaseAdmin.rpc).toHaveBeenCalledWith('increment_credits_with_log', {
        target_user_id: 'user_123',
        amount: 955,
        transaction_type: 'subscription',
        ref_id: 'sub_test_123',
        description: 'Trial conversion - Professional plan - 955 additional credits',
      });
    });

    it('does not add credits when trial used same amount as regular plan', async () => {
      const trialConversionEvent = {
        id: 'evt_test_456',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test_123',
            customer: 'cus_test_123',
            status: 'active',
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60),
            trial_end: Math.floor(Date.now() / 1000) - (1 * 24 * 60 * 60),
            cancel_at_period_end: false,
            items: {
              data: [{
                price: {
                  id: 'price_pro_monthly',
                },
              }],
            },
          },
        },
      };

      // Mock trial configuration with same credits as regular plan
      mockGetTrialConfig.mockReturnValue({
        enabled: true,
        durationDays: 14,
        trialCredits: 1000, // Same as regular plan
        requirePaymentMethod: true,
        allowMultipleTrials: false,
        autoConvertToPaid: true,
      });

      mockGetPlanConfig.mockReturnValue({
        key: 'pro',
        name: 'Professional',
        creditsPerCycle: 1000,
        trial: {
          enabled: true,
          durationDays: 14,
          trialCredits: 1000, // Same as regular
          requirePaymentMethod: true,
          allowMultipleTrials: false,
          autoConvertToPaid: true,
        },
      } as any);

      // Mock user profile
      mockSupabaseAdmin.from.mockReturnValue((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'user_123',
                    subscription_status: 'trialing',
                    credits_balance: 1000, // Has full regular credits
                  },
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        return {
          upsert: vi.fn().mockResolvedValue({ error: null }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'user_123' }, error: null }),
            }),
          }),
          rpc: vi.fn().mockResolvedValue({ error: null }),
          insert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      });

      // Mock webhook event creation
      mockSupabaseAdmin.from.mockReturnValue((table: string) => {
        if (table === 'webhook_events') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        return {
          upsert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'user_123' }, error: null }),
            }),
          }),
          rpc: vi.fn().mockResolvedValue({ error: null }),
        };
      });

      const request = mockRequest(trialConversionEvent);
      const response = await webhookHandler(request);

      expect(response.status).toBe(200);

      // Should not add additional credits since user already has full amount
      expect(mockSupabaseAdmin.rpc).not.toHaveBeenCalledWith(
        'increment_credits_with_log',
        expect.objectContaining({
          transaction_type: 'subscription',
        })
      );
    });
  });

  describe('Trial Will End Handler', () => {
    it('handles customer.subscription.trial_will_end event', async () => {
      const trialWillEndEvent = {
        id: 'evt_test_789',
        type: 'customer.subscription.trial_will_end',
        data: {
          object: {
            id: 'sub_test_123',
            customer: 'cus_test_123',
            status: 'trialing',
            trial_end: Math.floor(Date.now() / 1000) + (3 * 24 * 60 * 60), // 3 days from now
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor(Date.now() / 1000) + (14 * 24 * 60 * 60),
            cancel_at_period_end: false,
            items: {
              data: [{
                price: {
                  id: 'price_pro_monthly',
                },
              }],
            },
          },
        },
      };

      // Mock user profile with email
      mockSupabaseAdmin.from.mockReturnValue((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'user_123',
                    email: 'test@example.com',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'user_123' }, error: null }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      });

      // Mock webhook event creation
      mockSupabaseAdmin.from.mockReturnValue((table: string) => {
        if (table === 'webhook_events') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'user_123' }, error: null }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      });

      // Mock console.log to capture email notification log
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const request = mockRequest(trialWillEndEvent);
      const response = await webhookHandler(request);

      expect(response.status).toBe(200);
      expect(data.received).toBe(true);

      // Verify email notification log
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('TODO: Send trial ending soon email to test@example.com')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('handles missing trial_end gracefully', async () => {
      const subscriptionEventWithoutTrialEnd = {
        id: 'evt_test_error',
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_test_error',
            customer: 'cus_test_error',
            status: 'trialing',
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor(Date.now() / 1000) + (14 * 24 * 60 * 60),
            // Missing trial_end
            cancel_at_period_end: false,
            items: {
              data: [{
                price: {
                  id: 'price_pro_monthly',
                },
              }],
            },
          },
        },
      };

      // Mock trial configuration
      mockGetTrialConfig.mockReturnValue({
        enabled: true,
        durationDays: 14,
        trialCredits: 100,
        requirePaymentMethod: true,
        allowMultipleTrials: false,
        autoConvertToPaid: true,
      });

      mockGetPlanConfig.mockReturnValue({
        key: 'pro',
        name: 'Professional',
        creditsPerCycle: 1000,
        trial: {
          enabled: true,
          durationDays: 14,
          trialCredits: 100,
          requirePaymentMethod: true,
          allowMultipleTrials: false,
          autoConvertToPaid: true,
        },
      } as any);

      // Mock webhook event creation
      mockSupabaseAdmin.from.mockReturnValue((table: string) => {
        if (table === 'webhook_events') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
            insert: vi.fn().mockResolvedValue({ error: null }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        return {
          upsert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'user_123' }, error: null }),
            }),
          }),
          rpc: vi.fn().mockResolvedValue({ error: null }),
        };
      });

      const request = mockRequest(subscriptionEventWithoutTrialEnd);
      const response = await webhookHandler(request);

      expect(response.status).toBe(200);

      // Verify subscription was stored even without trial_end
      expect(mockSupabaseAdmin.from).toHaveBeenCalledWith('subscriptions');
    });
  });
});