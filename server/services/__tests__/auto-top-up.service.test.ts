import { beforeEach, describe, expect, test, vi } from 'vitest';

const { fromMock, priceRetrieve, paymentIntentCreate } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  priceRetrieve: vi.fn(),
  paymentIntentCreate: vi.fn(),
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: { from: fromMock },
}));
vi.mock('@server/stripe', () => ({
  stripe: {
    prices: { retrieve: priceRetrieve },
    paymentIntents: { create: paymentIntentCreate },
  },
}));

import { AutoTopUpService } from '../auto-top-up.service';
import { getCreditPackByKey } from '@shared/config/subscription.utils';

function thenable(result: unknown) {
  const query: Record<string, unknown> = {};
  for (const method of ['eq', 'not', 'select', 'update']) {
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
                    stripe_payment_method_id: 'pm_1',
                    consent_version: setting.consent_version,
                  },
                }),
              })),
            };
          }),
          update: vi.fn(() => thenable({ error: null })),
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
      expect.objectContaining({ off_session: true, confirm: true, amount: 1499, currency: 'usd' }),
      {
        idempotencyKey: `auto-top-up:user-1:${setting.consent_version}:2026-07-11`,
      }
    );
  });
});
