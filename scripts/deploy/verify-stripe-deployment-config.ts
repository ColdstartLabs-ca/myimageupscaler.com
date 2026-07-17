import { readFileSync } from 'node:fs';

import Stripe from 'stripe';

import { clientEnv, serverEnv } from '../../shared/config/env';
import {
  type IStripeDeploymentConfig,
  validateStripeDeploymentConfig,
} from './stripe-deployment-guard';

const PRICE_NAMES = [
  'STARTER',
  'HOBBY',
  'PRO',
  'BUSINESS',
  'CREDITS_SMALL',
  'CREDITS_MEDIUM',
  'CREDITS_LARGE',
] as const;

type PriceName = (typeof PRICE_NAMES)[number];
type Environment = Record<string, string>;

function readEnvironmentFile(filePath: string): Environment {
  const values: Environment = {};

  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    if (/^[A-Z_][A-Z0-9_]*$/.test(key)) {
      values[key] = line.slice(separator + 1);
    }
  }

  return values;
}

function publicPriceId(name: PriceName, environment: Environment): string {
  return environment[`NEXT_PUBLIC_STRIPE_PRICE_${name}`] ?? '';
}

function serverPriceId(name: PriceName, environment: Environment): string | undefined {
  return environment[`STRIPE_PRICE_${name}`];
}

function configFromEnvironment(
  clientEnvironment: Environment,
  serverEnvironment: Environment,
  requireServerPriceIds: boolean
): IStripeDeploymentConfig {
  return {
    publishableKey: clientEnvironment.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
    secretKey: serverEnvironment.STRIPE_SECRET_KEY ?? '',
    prices: PRICE_NAMES.map(name => ({
      name,
      publicPriceId: publicPriceId(name, clientEnvironment),
      serverPriceId: serverPriceId(name, serverEnvironment),
    })),
    requireServerPriceIds,
  };
}

function runtimeEnvironment(): { client: Environment; server: Environment } {
  return {
    client: {
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: clientEnv.STRIPE_PUBLISHABLE_KEY,
      NEXT_PUBLIC_STRIPE_PRICE_STARTER: clientEnv.NEXT_PUBLIC_STRIPE_PRICE_STARTER,
      NEXT_PUBLIC_STRIPE_PRICE_HOBBY: clientEnv.NEXT_PUBLIC_STRIPE_PRICE_HOBBY,
      NEXT_PUBLIC_STRIPE_PRICE_PRO: clientEnv.NEXT_PUBLIC_STRIPE_PRICE_PRO,
      NEXT_PUBLIC_STRIPE_PRICE_BUSINESS: clientEnv.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS,
      NEXT_PUBLIC_STRIPE_PRICE_CREDITS_SMALL: clientEnv.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_SMALL,
      NEXT_PUBLIC_STRIPE_PRICE_CREDITS_MEDIUM: clientEnv.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_MEDIUM,
      NEXT_PUBLIC_STRIPE_PRICE_CREDITS_LARGE: clientEnv.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_LARGE,
    },
    server: {
      STRIPE_SECRET_KEY: serverEnv.STRIPE_SECRET_KEY,
      STRIPE_PRICE_STARTER: serverEnv.STRIPE_PRICE_STARTER,
      STRIPE_PRICE_HOBBY: serverEnv.STRIPE_PRICE_HOBBY,
      STRIPE_PRICE_PRO: serverEnv.STRIPE_PRICE_PRO,
      STRIPE_PRICE_BUSINESS: serverEnv.STRIPE_PRICE_BUSINESS,
    },
  };
}

function parseFileArguments(): { clientFile: string; serverFile: string } | null {
  const args = process.argv.slice(2);
  if (args.length === 0) return null;

  if (args.length !== 4 || args[0] !== '--client-env-file' || args[2] !== '--server-env-file') {
    throw new Error(
      'Usage: verify-stripe-deployment-config.ts [--client-env-file <path> --server-env-file <path>]'
    );
  }

  return { clientFile: args[1], serverFile: args[3] };
}

async function main(): Promise<void> {
  const files = parseFileArguments();
  const environments = files
    ? {
        client: readEnvironmentFile(files.clientFile),
        server: readEnvironmentFile(files.serverFile),
      }
    : runtimeEnvironment();
  const config = configFromEnvironment(environments.client, environments.server, Boolean(files));
  const stripe = new Stripe(config.secretKey, {
    timeout: 20_000,
    maxNetworkRetries: 1,
  });
  const result = await validateStripeDeploymentConfig(config, async priceId => {
    const price = await stripe.prices.retrieve(priceId);
    return { id: price.id, active: price.active, livemode: price.livemode };
  });

  if (result.errors.length > 0) {
    console.error('Stripe production configuration is unsafe; deployment blocked:');
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Verified ${config.prices.length} live, active Stripe prices for production.`);
}

main().catch(error => {
  console.error('Stripe production configuration could not be verified; deployment blocked.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
