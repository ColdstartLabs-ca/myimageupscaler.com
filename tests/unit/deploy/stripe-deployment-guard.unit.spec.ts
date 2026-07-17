import { describe, expect, test, vi } from 'vitest';

import {
  validateStripeDeploymentConfig,
  type IStripeDeploymentConfig,
} from '../../../scripts/deploy/stripe-deployment-guard';

const priceNames = [
  'STARTER',
  'HOBBY',
  'PRO',
  'BUSINESS',
  'CREDITS_SMALL',
  'CREDITS_MEDIUM',
  'CREDITS_LARGE',
] as const;

function createConfig(overrides: Partial<IStripeDeploymentConfig> = {}): IStripeDeploymentConfig {
  return {
    publishableKey: 'pk_live_publishable_key',
    secretKey: 'sk_live_secret_key',
    prices: priceNames.map(name => ({
      name,
      publicPriceId: `price_${name.toLowerCase()}`,
      serverPriceId: `price_${name.toLowerCase()}`,
    })),
    ...overrides,
  };
}

describe('Stripe production deployment guard', () => {
  test('blocks configuration drift before making any Stripe request', async () => {
    const retrievePrice = vi.fn();
    const config = createConfig({
      prices: [
        {
          name: 'STARTER',
          publicPriceId: 'price_public_account',
          serverPriceId: 'price_server_account',
        },
      ],
    });

    const result = await validateStripeDeploymentConfig(config, retrievePrice);

    expect(result.errors).toContain(
      'NEXT_PUBLIC_STRIPE_PRICE_STARTER must match STRIPE_PRICE_STARTER'
    );
    expect(retrievePrice).not.toHaveBeenCalled();
  });

  test('blocks inactive, test-mode, or unavailable prices', async () => {
    const retrievePrice = vi
      .fn()
      .mockResolvedValueOnce({ id: 'price_starter', active: false, livemode: true })
      .mockResolvedValueOnce({ id: 'price_hobby', active: true, livemode: false })
      .mockRejectedValueOnce(new Error('No such price'));
    const config = createConfig({
      prices: [
        { name: 'STARTER', publicPriceId: 'price_starter' },
        { name: 'HOBBY', publicPriceId: 'price_hobby' },
        { name: 'PRO', publicPriceId: 'price_pro' },
      ],
    });

    const result = await validateStripeDeploymentConfig(config, retrievePrice);

    expect(result.errors).toEqual(
      expect.arrayContaining([
        'NEXT_PUBLIC_STRIPE_PRICE_STARTER resolves to an inactive Stripe price',
        'NEXT_PUBLIC_STRIPE_PRICE_HOBBY resolves to a test-mode Stripe price',
        'NEXT_PUBLIC_STRIPE_PRICE_PRO could not be retrieved from Stripe',
      ])
    );
  });

  test('accepts only live, active prices resolved by the configured secret key', async () => {
    const config = createConfig();
    const retrievePrice = vi.fn(async (priceId: string) => ({
      id: priceId,
      active: true,
      livemode: true,
    }));

    const result = await validateStripeDeploymentConfig(config, retrievePrice);

    expect(result.errors).toEqual([]);
    expect(retrievePrice).toHaveBeenCalledTimes(priceNames.length);
    expect(retrievePrice).toHaveBeenCalledWith('price_starter');
    expect(retrievePrice).toHaveBeenCalledWith('price_credits_large');
  });
});
