import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { POST as checkoutHandler } from '@app/api/checkout/route';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { stripe } from '@server/stripe';
import { getTrialConfig, getPlanConfig } from '@shared/config/subscription.config';

// Mock dependencies
vi.mock('@server/stripe');
vi.mock('@server/supabase/supabaseAdmin');
vi.mock('@shared/config/subscription.config');
vi.mock('@shared/config/stripe');
vi.mock('@shared/config/env', () => ({
  serverEnv: {
    ENV: 'test',
    STRIPE_SECRET_KEY: 'sk_test_dummy_key',
  },
  clientEnv: {
    BASE_URL: 'http://localhost:3000',
  },
}));

vi.mock('@shared/constants/billing', () => ({
  BILLING_COPY: {
    ERROR_MESSAGES: {
      GENERIC_ERROR: 'An error occurred during checkout',
    },
  },
}));

const mockStripe = vi.mocked(stripe);
const mockSupabaseAdmin = vi.mocked(supabaseAdmin);
const mockGetTrialConfig = vi.mocked(getTrialConfig);
const mockGetPlanConfig = vi.mocked(getPlanConfig);

describe('Checkout API - Trial Integration', () => {
  let mockRequest: (body: any, headers?: Record<string, string>) => NextRequest;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    mockStripe.checkout = {
      sessions: {
        create: vi.fn(),
      },
    } as any;

    mockStripe.prices = {
      retrieve: vi.fn(),
    } as any;

    mockStripe.customers = {
      create: vi.fn(),
    } as any;

    mockSupabaseAdmin.auth = {
      getUser: vi.fn(),
    } as any;

    mockSupabaseAdmin.from = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn(),
        }),
      }),
    });

    mockSupabaseAdmin.from = vi.fn().mockReturnValue((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'user_123', stripe_customer_id: 'cus_123' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'subscriptions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return {
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      };
    });

    mockRequest = (body: any, headers: Record<string, string> = {}) => {
      return new NextRequest('http://localhost:3000/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(body),
      });
    };
  });

  describe('Trial Configuration', () => {
    it('includes trial_period_days when trial is enabled', async () => {
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
        stripePriceId: 'price_pro_monthly',
        priceInCents: 4900,
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

      // Mock successful authentication
      mockSupabaseAdmin.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user_123', email: 'test@example.com' } },
        error: null,
      } as any);

      // Mock Stripe price
      mockStripe.prices.retrieve.mockResolvedValue({
        type: 'recurring',
      } as any);

      // Mock successful checkout session creation
      const mockSession = {
        url: 'https://checkout.stripe.com/pay/cs_test_123',
        id: 'cs_test_123',
        client_secret: 'pi_test_123_secret_123',
      };

      mockStripe.checkout.sessions.create.mockResolvedValue(mockSession);

      const request = mockRequest({
        priceId: 'price_pro_monthly',
      }, {
        Authorization: 'Bearer valid_token',
      });

      const response = await checkoutHandler(request);
      const data = await response.json();

      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          subscription_data: expect.objectContaining({
            trial_period_days: 14,
            metadata: expect.objectContaining({
              user_id: 'user_123',
            }),
          }),
        })
      );

      expect(data.success).toBe(true);
    });

    it('does not include trial_period_days when trial is disabled', async () => {
      // Mock no trial configuration
      mockGetTrialConfig.mockReturnValue(null);
      mockGetPlanConfig.mockReturnValue({
        key: 'hobby',
        name: 'Hobby',
        stripePriceId: 'price_hobby_monthly',
        priceInCents: 1900,
        creditsPerCycle: 200,
        trial: {
          enabled: false,
          durationDays: 0,
          trialCredits: null,
          requirePaymentMethod: true,
          allowMultipleTrials: false,
          autoConvertToPaid: true,
        },
      } as any);

      // Mock successful authentication
      mockSupabaseAdmin.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user_123', email: 'test@example.com' } },
        error: null,
      } as any);

      // Mock Stripe price
      mockStripe.prices.retrieve.mockResolvedValue({
        type: 'recurring',
      } as any);

      // Mock successful checkout session creation
      const mockSession = {
        url: 'https://checkout.stripe.com/pay/cs_test_123',
        id: 'cs_test_123',
        client_secret: 'pi_test_123_secret_123',
      };

      mockStripe.checkout.sessions.create.mockResolvedValue(mockSession);

      const request = mockRequest({
        priceId: 'price_hobby_monthly',
      }, {
        Authorization: 'Bearer valid_token',
      });

      const response = await checkoutHandler(request);
      const data = await response.json();

      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          subscription_data: expect.not.objectContaining({
            trial_period_days: expect.any(Number),
          }),
        })
      );

      expect(data.success).toBe(true);
    });

    it('sets payment_method_collection to if_required when trial does not require payment method', async () => {
      // Mock trial configuration without payment method requirement
      mockGetTrialConfig.mockReturnValue({
        enabled: true,
        durationDays: 7,
        trialCredits: 50,
        requirePaymentMethod: false, // No payment method required
        allowMultipleTrials: false,
        autoConvertToPaid: true,
      });

      mockGetPlanConfig.mockReturnValue({
        key: 'trial_plan',
        name: 'Trial Plan',
        stripePriceId: 'price_trial_7days',
        priceInCents: 0,
        creditsPerCycle: 50,
        trial: {
          enabled: true,
          durationDays: 7,
          trialCredits: 50,
          requirePaymentMethod: false,
          allowMultipleTrials: false,
          autoConvertToPaid: true,
        },
      } as any);

      // Mock successful authentication
      mockSupabaseAdmin.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user_123', email: 'test@example.com' } },
        error: null,
      } as any);

      // Mock Stripe price
      mockStripe.prices.retrieve.mockResolvedValue({
        type: 'recurring',
      } as any);

      // Mock successful checkout session creation
      const mockSession = {
        url: 'https://checkout.stripe.com/pay/cs_test_123',
        id: 'cs_test_123',
        client_secret: 'pi_test_123_secret_123',
      };

      mockStripe.checkout.sessions.create.mockResolvedValue(mockSession);

      const request = mockRequest({
        priceId: 'price_trial_7days',
      }, {
        Authorization: 'Bearer valid_token',
      });

      const response = await checkoutHandler(request);
      const data = await response.json();

      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          subscription_data: expect.objectContaining({
            trial_period_days: 7,
          }),
          payment_method_collection: 'if_required',
        })
      );

      expect(data.success).toBe(true);
    });

    it('handles different trial durations correctly', async () => {
      // Mock 30-day trial configuration
      mockGetTrialConfig.mockReturnValue({
        enabled: true,
        durationDays: 30,
        trialCredits: 200,
        requirePaymentMethod: true,
        allowMultipleTrials: false,
        autoConvertToPaid: true,
      });

      mockGetPlanConfig.mockReturnValue({
        key: 'business',
        name: 'Business',
        stripePriceId: 'price_business_monthly',
        priceInCents: 14900,
        creditsPerCycle: 5000,
        trial: {
          enabled: true,
          durationDays: 30,
          trialCredits: 200,
          requirePaymentMethod: true,
          allowMultipleTrials: false,
          autoConvertToPaid: true,
        },
      } as any);

      // Mock successful authentication
      mockSupabaseAdmin.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user_123', email: 'test@example.com' } },
        error: null,
      } as any);

      // Mock Stripe price
      mockStripe.prices.retrieve.mockResolvedValue({
        type: 'recurring',
      } as any);

      // Mock successful checkout session creation
      const mockSession = {
        url: 'https://checkout.stripe.com/pay/cs_test_123',
        id: 'cs_test_123',
        client_secret: 'pi_test_123_secret_123',
      };

      mockStripe.checkout.sessions.create.mockResolvedValue(mockSession);

      const request = mockRequest({
        priceId: 'price_business_monthly',
      }, {
        Authorization: 'Bearer valid_token',
      });

      const response = await checkoutHandler(request);
      const data = await response.json();

      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          subscription_data: expect.objectContaining({
            trial_period_days: 30,
          }),
        })
      );

      expect(data.success).toBe(true);
    });

    it('includes plan metadata when trial is enabled', async () => {
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
        stripePriceId: 'price_pro_monthly',
        priceInCents: 4900,
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

      // Mock successful authentication
      mockSupabaseAdmin.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user_123', email: 'test@example.com' } },
        error: null,
      } as any);

      // Mock Stripe price
      mockStripe.prices.retrieve.mockResolvedValue({
        type: 'recurring',
      } as any);

      // Mock successful checkout session creation
      const mockSession = {
        url: 'https://checkout.stripe.com/pay/cs_test_123',
        id: 'cs_test_123',
        client_secret: 'pi_test_123_secret_123',
      };

      mockStripe.checkout.sessions.create.mockResolvedValue(mockSession);

      const request = mockRequest({
        priceId: 'price_pro_monthly',
      }, {
        Authorization: 'Bearer valid_token',
      });

      const response = await checkoutHandler(request);

      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            user_id: 'user_123',
            plan_key: 'pro',
          }),
          subscription_data: expect.objectContaining({
            metadata: expect.objectContaining({
              user_id: 'user_123',
              plan_key: 'pro',
            }),
          }),
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('returns error when invalid price ID provided', async () => {
      // Mock no plan configuration found
      mockGetTrialConfig.mockReturnValue(null);
      mockGetPlanConfig.mockReturnValue(null);

      // Mock successful authentication
      mockSupabaseAdmin.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user_123', email: 'test@example.com' } },
        error: null,
      } as any);

      const request = mockRequest({
        priceId: 'invalid_price_id',
      }, {
        Authorization: 'Bearer valid_token',
      });

      const response = await checkoutHandler(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_PRICE');
    });

    it('handles Stripe API errors gracefully', async () => {
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
        stripePriceId: 'price_pro_monthly',
        priceInCents: 4900,
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

      // Mock successful authentication
      mockSupabaseAdmin.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user_123', email: 'test@example.com' } },
        error: null,
      } as any);

      // Mock Stripe price
      mockStripe.prices.retrieve.mockResolvedValue({
        type: 'recurring',
      } as any);

      // Mock Stripe API error
      mockStripe.checkout.sessions.create.mockRejectedValue(new Error('Stripe API Error'));

      const request = mockRequest({
        priceId: 'price_pro_monthly',
      }, {
        Authorization: 'Bearer valid_token',
      });

      const response = await checkoutHandler(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INTERNAL_ERROR');
    });
  });
});