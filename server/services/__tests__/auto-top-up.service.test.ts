import { beforeEach, describe, expect, test, vi } from 'vitest';

const {
  fromMock,
  priceRetrieve,
  paymentIntentCreate,
  paymentIntentConfirm,
  paymentIntentCancel,
  paymentIntentRetrieve,
  sendEmail,
  rpcMock,
  revenueFeatureEligible,
} = vi.hoisted(() => ({
  fromMock: vi.fn(),
  priceRetrieve: vi.fn(),
  paymentIntentCreate: vi.fn(),
  paymentIntentConfirm: vi.fn(),
  paymentIntentCancel: vi.fn(),
  paymentIntentRetrieve: vi.fn(),
  sendEmail: vi.fn(),
  rpcMock: vi.fn(),
  revenueFeatureEligible: vi.fn(),
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: fromMock,
    rpc: rpcMock,
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
vi.mock('@server/services/revenue-feature-rollout.service', () => ({
  isRevenueFeatureEligible: revenueFeatureEligible,
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
  notifyAutoTopUpFailure,
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
    rpcMock.mockImplementation((name: string) =>
      Promise.resolve({
        data:
          name === 'claim_auto_top_up_failure_notification' ||
          name === 'finalize_auto_top_up_attempt'
            ? true
            : 1,
        error: null,
      })
    );
    revenueFeatureEligible.mockResolvedValue(true);
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

  test('kill switch prevents a previously enabled setting from charging', async () => {
    revenueFeatureEligible.mockResolvedValue(false);
    fromMock.mockImplementation((table: string) => {
      if (table === 'auto_top_up_attempts') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) })),
          })),
        } as never;
      }
      if (table === 'auto_top_up_settings') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                not: vi.fn(() => ({
                  limit: vi.fn().mockResolvedValue({ data: [setting], error: null }),
                })),
              })),
            })),
          })),
        } as never;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await new AutoTopUpService().processEligible();

    expect(result).toMatchObject({ scanned: 1, claimed: 0, paymentPending: 0 });
    expect(paymentIntentCreate).not.toHaveBeenCalled();
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
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) })),
          })),
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
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ limit: vi.fn().mockResolvedValue({ data: [], error: null }) })),
          })),
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

  test('isolates an unknown price configuration and continues scanning later settings', async () => {
    const badSetting = {
      ...setting,
      user_id: 'user-bad-price',
      stripe_price_id: 'price_rotated_out_of_config',
      charge_claim_id: null,
      charge_claimed_at: null,
    };
    const laterSetting = {
      ...setting,
      user_id: 'user-later',
      charge_claim_id: null,
      charge_claimed_at: null,
    };
    const settings = [badSetting, laterSetting];
    const settingsUpdates: Record<string, unknown>[] = [];

    fromMock.mockImplementation((table: string) => {
      if (table === 'auto_top_up_attempts') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          })),
        } as never;
      }
      if (table === 'auto_top_up_settings') {
        return {
          select: vi.fn((columns: string) =>
            columns.startsWith('user_id,')
              ? {
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      not: vi.fn(() => ({
                        limit: vi.fn().mockResolvedValue({ data: settings, error: null }),
                      })),
                    })),
                  })),
                }
              : { eq: vi.fn(() => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) })) }
          ),
          update: vi.fn((payload: Record<string, unknown>) => {
            settingsUpdates.push(payload);
            return thenable({ error: null });
          }),
        };
      }
      if (table === 'user_credits') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((field: string, value: string) => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { total_credits_balance: value === 'user-bad-price' ? 0 : 100 },
                error: null,
              }),
            })),
          })),
        } as never;
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await new AutoTopUpService().processEligible();

    expect(result).toMatchObject({ scanned: 2, failed: 1 });
    expect(settingsUpdates).toContainEqual(
      expect.objectContaining({ enabled: false, failure_reason: 'invalid_pack_configuration' })
    );
    expect(paymentIntentCreate).not.toHaveBeenCalled();
  });

  test('finalizes a succeeded PaymentIntent during stale lease recovery', async () => {
    const leasedSetting = {
      ...setting,
      charge_claim_id: 'attempt-stale',
      charge_claimed_at: '2026-07-11T11:00:00.000Z',
    };
    fromMock.mockImplementation((table: string) => {
      if (table === 'auto_top_up_attempts') {
        return {
          select: vi.fn((columns: string) =>
            columns.includes('stripe_payment_intent_id')
              ? {
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: {
                        id: 'attempt-stale',
                        stripe_payment_intent_id: 'pi_stale_succeeded',
                        credits: 200,
                      },
                      error: null,
                    }),
                  })),
                }
              : {
                  eq: vi.fn(() => ({
                    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                  })),
                }
          ),
          update: vi.fn(() => thenable({ error: null })),
        } as never;
      }
      if (table === 'auto_top_up_settings') {
        return {
          select: vi.fn((columns: string) =>
            columns.startsWith('user_id,')
              ? {
                  eq: vi.fn(() => ({
                    eq: vi.fn(() => ({
                      not: vi.fn(() => ({
                        limit: vi.fn().mockResolvedValue({ data: [leasedSetting], error: null }),
                      })),
                    })),
                  })),
                }
              : { eq: vi.fn(() => ({ maybeSingle: vi.fn() })) }
          ),
          update: vi.fn(() => thenable({ error: null })),
        } as never;
      }
      throw new Error(`Unexpected table ${table}`);
    });
    paymentIntentRetrieve.mockResolvedValue({ id: 'pi_stale_succeeded', status: 'succeeded' });
    rpcMock.mockImplementation((name: string) =>
      Promise.resolve(
        name === 'finalize_auto_top_up_attempt'
          ? { data: true, error: null }
          : { data: true, error: null }
      )
    );

    const result = await new AutoTopUpService().processEligible(
      25,
      new Date('2026-07-11T12:00:00.000Z')
    );

    expect(result).toMatchObject({ scanned: 1, failed: 0, claimed: 0 });
    expect(rpcMock).toHaveBeenCalledWith(
      'finalize_auto_top_up_attempt',
      expect.objectContaining({ p_attempt_id: 'attempt-stale', p_credits: 200 })
    );
    expect(paymentIntentCancel).not.toHaveBeenCalled();
  });

  test('does not send a duplicate failure notice when another worker owns the claim', async () => {
    rpcMock.mockImplementation((name: string) =>
      Promise.resolve(
        name === 'claim_auto_top_up_failure_notification'
          ? { data: false, error: null }
          : { data: 1, error: null }
      )
    );

    await notifyAutoTopUpFailure('user-1', 1, 'attempt-1');

    expect(sendEmail).not.toHaveBeenCalled();
  });
});
