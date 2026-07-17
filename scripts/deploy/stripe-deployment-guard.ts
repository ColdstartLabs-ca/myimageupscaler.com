export interface IStripePriceConfig {
  name: string;
  publicPriceId: string;
  serverPriceId?: string;
}

export interface IStripeDeploymentConfig {
  publishableKey: string;
  secretKey: string;
  prices: IStripePriceConfig[];
  requireServerPriceIds?: boolean;
}

export interface IStripePriceRecord {
  id: string;
  active: boolean;
  livemode: boolean;
}

export type StripePriceRetriever = (priceId: string) => Promise<IStripePriceRecord>;

function publicPriceVariable(name: string): string {
  return `NEXT_PUBLIC_STRIPE_PRICE_${name}`;
}

function serverPriceVariable(name: string): string {
  return `STRIPE_PRICE_${name}`;
}

/**
 * Validates the exact Stripe configuration that will be embedded in a production build.
 * The caller is responsible for providing a retriever authenticated with the production
 * secret key, so account mismatches fail before deployment starts.
 */
export async function validateStripeDeploymentConfig(
  config: IStripeDeploymentConfig,
  retrievePrice: StripePriceRetriever
): Promise<{ errors: string[] }> {
  const errors: string[] = [];

  if (!config.publishableKey.startsWith('pk_live_')) {
    errors.push('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must be a live Stripe publishable key');
  }

  if (!config.secretKey.startsWith('sk_live_')) {
    errors.push('STRIPE_SECRET_KEY must be a live Stripe secret key');
  }

  for (const price of config.prices) {
    const publicVariable = publicPriceVariable(price.name);
    const serverVariable = serverPriceVariable(price.name);

    if (!price.publicPriceId.startsWith('price_')) {
      errors.push(`${publicVariable} must be a Stripe price ID`);
    }

    if (config.requireServerPriceIds && !price.serverPriceId) {
      errors.push(`${serverVariable} must be configured`);
    }

    if (price.serverPriceId && price.publicPriceId !== price.serverPriceId) {
      errors.push(`${publicVariable} must match ${serverVariable}`);
    }
  }

  if (errors.length > 0) {
    return { errors };
  }

  const results = await Promise.all(
    config.prices.map(async price => {
      const publicVariable = publicPriceVariable(price.name);

      try {
        const stripePrice = await retrievePrice(price.publicPriceId);
        const priceErrors: string[] = [];

        if (stripePrice.id !== price.publicPriceId) {
          priceErrors.push(`${publicVariable} resolved to an unexpected Stripe price`);
        }
        if (!stripePrice.active) {
          priceErrors.push(`${publicVariable} resolves to an inactive Stripe price`);
        }
        if (!stripePrice.livemode) {
          priceErrors.push(`${publicVariable} resolves to a test-mode Stripe price`);
        }

        return priceErrors;
      } catch {
        return [`${publicVariable} could not be retrieved from Stripe`];
      }
    })
  );

  return { errors: results.flat() };
}
