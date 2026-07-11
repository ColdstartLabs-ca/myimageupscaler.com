import { beforeEach, describe, expect, test, vi } from 'vitest';

const {
  fromMock,
  priceRetrieve,
  paymentIntentCreate,
  paymentIntentConfirm,
  paymentIntentCancel,
  paymentIntentRetrieve,
  sendEmail,
} = vi.hoisted(() => ({
  fromMock: vi.fn(),
  priceRetrieve: vi.fn(),
  paymentIntentCreate: vi.fn(),
  paymentIntentConfirm: vi.fn(),
  paymentIntentCancel: vi.fn(),
  paymentIntentRetrieve: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: fromMock,
    auth: {
      admin: {
        getUserById: vi
          .fn()
          .mockResolvedValue({ data: { user: { email: 'u@example.com' } }, error: null }),
      },
    },
  },
}));
vi.mock('@server/services/email.service', () => ({
  getEmailService: () => ({ send: sendEmail }),
}));
vi.mock('@server/stripe', () => ({
  stripe: {
    prices: { retrieve: priceRetrieve },
    paymentIntents: {
      create: paymentIntentCreate,
      confirm: paymentIntentConfirm,
      cancel: paymentIntentCancel,
      retrieve: paymentIntentRetrieve,
    },
  },
}));

import {
  AutoTopUpService,
  isAutoTopUpEligibleBalance,
  isAutoTopUpPayableStatus,
  isStaleAutoTopUpLease,
  parseAutoTopUpBalance,
} from '../auto-top-up.service';
import { getCreditPackByKey } from '@shared/config/subscription.utils';

function thenable(result: unknown) {
  const query: Record<string, unknown> = {};
  for (const method of ['eq', 'is', 'not', 'select', 'update']) {
    query[method] = vi.fn(() => query);
  }
  query.then = (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve);
  return query;
}

describe('AutoTopUpService', () => {
  const medium = getCreditPackByKey('medium')!;
  const setting = {
    user_id: 'user-1',
    threshold_credits: 25,
    pack_key: 'medium',
    stripe_price_id: medium.stripePriceId,
    stripe_customer_id: 'cus_1',
    stripe_payment_method_id: 'pm_1',
    consent_version: '00000000-0000-4000-8000-000000000001',
    consecutive_failures: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    priceRetrieve.mockResolvedValue({ type: 'one_time', unit_amount: 1499, currency: 'usd' });
    paymentIntentCreate.mockResolvedValue({ id: 'pi_auto_1' });
    paymentIntentConfirm.mockResolvedValue({ id: 'pi_auto_1', status: 'succeeded' });
    paymentIntentCancel.mockResolvedValue({ id: 'pi_auto_1', status: 'canceled' });
    paymentIntentRetrieve.mockResolvedValue({ id: 'pi_auto_1', status: 'requires_confirmation' });
    sendEmail.mockResolvedValue({ success: true });
  });

  test('matches below-threshold disclosure and accepts only payable Stripe states', () => {
    expect(isAutoTopUpEligibleBalance(24, 25)).toBe(true);
    expect(isAutoTopUpEligibleBalance(25, 25)).toBe(false);
    expect(isAutoTopUpPayableStatus('succeeded')).toBe(true);
    expect(isAutoTopUpPayableStatus('processing')).toBe(true);
    for (const status of ['requires_action', 'requires_payment_method', 'canceled']) {
      expect(isAutoTopUpPayableStatus(status)).toBe(false);
    }
    const now = new Date('2026-07-11T12:10:00.000Z');
    expect(isStaleAutoTopUpLease('2026-07-11T12:04:59.000Z', now)).toBe(true);
    expect(isStaleAutoTopUpLease('2026-07-11T12:05:01.000Z', now)).toBe(false);
    expect(parseAutoTopUpBalance(0)).toBe(0);
    expect(() => parseAutoTopUpBalance(null)).toThrow('missing credit balance');
    expect(() => parseAutoTopUpBalance('not-a-number')).toThrow('invalid credit balance');
  });

  test('concurrent scans produce at most one Stripe charge with deterministic idempotency', async () => {
    let claimCount = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === 'auto_top_up_settings') {
        return {
          select: vi.fn((columns: string) => {
            if (columns.startsWith('user_id,')) {
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    not: vi.fn(() => ({
                      limit: vi.fn().mockResolvedValue({ data: [setting], error: null }),
                    })),
                  })),
                })),
              };
            }
            return {
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    enabled: true,
                    charge_claim_id: 'attempt-1',
                  },
                }),
              })),
            };
          }),
          update: vi.fn(payload => {
            const query = thenable({ error: null });
            query.maybeSingle = vi.fn().mockResolvedValue({
              data: payload.charge_claim_id ? { user_id: 'user-1' } : null,
              error: null,
            });
            return query;
          }),
        };
      }
      if (table === 'user_credits') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: { total_credits_balance: 10 } }),
            })),
          })),
        };
      }
      if (table === 'auto_top_up_attempts') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              maybeSingle: vi.fn(async () => {
                claimCount++;
                return claimCount === 1
                  ? { data: { id: 'attempt-1' }, error: null }
                  : { data: null, error: { code: '23505' } };
              }),
            })),
          })),
          update: vi.fn(() => thenable({ error: null })),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const now = new Date('2026-07-11T12:00:00.000Z');
    const service = new AutoTopUpService();
    await Promise.all([service.processEligible(25, now), service.processEligible(25, now)]);
    expect(paymentIntentCreate).toHaveBeenCalledTimes(1);
    expect(paymentIntentCreate).toHaveBeenCalledWith(
      expect.objectContaining({ confirm: false, amount: 1499, currency: 'usd' }),
      {
        idempotencyKey: `auto-top-up:user-1:${setting.consent_version}:2026-07-11`,
      }
    );
    expect(paymentIntentCreate.mock.calls[0][0]).not.toHaveProperty('off_session');
    expect(paymentIntentConfirm).toHaveBeenCalledWith(
      'pi_auto_1',
      { off_session: true },
      { idempotencyKey: `auto-top-up:user-1:${setting.consent_version}:2026-07-11:confirm` }
    );
  });

  test('cancels a normally returned nonpayable intent before releasing and notifies the user', async () => {
    paymentIntentConfirm.mockResolvedValue({ id: 'pi_auto_1', status: 'requires_action' });
    let attemptInsert: Record<string, unknown> | undefined;
    fromMock.mockImplementation((table: string) => {
      if (table === 'auto_top_up_settings') {
        return {
          select: vi.fn((columns: string) =>
            columns.startsWith('user_id,')
              ? {
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      not: vi.fn(() => ({
                        limit: vi.fn().mockResolvedValue({ data: [setting], error: null }),
                      })),
                    })),
                  })),
                }
              : {
                  eq: vi.fn(() => ({
                    maybeSingle: vi
                      .fn()
                      .mockResolvedValue({ data: { enabled: true, charge_claim_id: 'attempt-1' } }),
                  })),
                }
          ),
          update: vi.fn(() => {
            const query = thenable({ error: null });
            query.maybeSingle = vi
              .fn()
              .mockResolvedValue({ data: { user_id: 'user-1' }, error: null });
            return query;
          }),
        };
      }
      if (table === 'user_credits')
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: { total_credits_balance: 10 } }),
            })),
          })),
        };
      if (table === 'auto_top_up_attempts')
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            attemptInsert = payload;
            return {
              select: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'attempt-1' }, error: null }),
              })),
            };
          }),
          update: vi.fn(() => thenable({ error: null })),
        };
      throw new Error(`Unexpected table ${table}`);
    });
    const result = await new AutoTopUpService().processEligible(
      25,
      new Date('2026-07-11T12:00:00Z')
    );
    expect(attemptInsert).toEqual(expect.objectContaining({ pack_key: 'medium', credits: 200 }));
    expect(paymentIntentCancel).toHaveBeenCalledWith('pi_auto_1');
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'auto-top-up-failure' })
    );
    expect(result.failed).toBe(1);
  });
});
