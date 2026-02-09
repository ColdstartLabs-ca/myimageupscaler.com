#!/usr/bin/env npx tsx
/**
 * Stripe Setup Script for MyImageUpscaler
 *
 * Automatically creates all necessary Stripe products, prices, and billing portal
 * configuration for the MyImageUpscaler application.
 *
 * This script:
 * - Creates subscription products (Hobby, Professional, Business)
 * - Creates credit pack products (Small, Medium, Large)
 * - Sets up the billing portal configuration
 * - Reuses existing products with matching metadata to avoid duplicates
 *
 * Usage:
 *   npx tsx scripts/setup-stripe.ts          # Use credentials from .env.api
 *   npx tsx scripts/setup-stripe.ts --test   # Force test mode
 *   npx tsx scripts/setup-stripe.ts --prod   # Force production mode
 *   npx tsx scripts/setup-stripe.ts --debug  # Save output file (stripe-setup-output-*.txt)
 */

import Stripe from 'stripe';
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { config as dotenvConfig } from 'dotenv';

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

interface IProductDefinition {
  key: string;
  name: string;
  description: string;
  priceInCents: number;
  type: 'subscription' | 'one_time';
  metadata: Record<string, string>;
}

interface ICreatedProduct {
  product: Stripe.Product;
  price: Stripe.Price;
  definition: IProductDefinition;
}

// Product definitions matching subscription.config.ts
const SUBSCRIPTION_PRODUCTS: IProductDefinition[] = [
  {
    key: 'starter',
    name: 'Starter',
    description: '100 credits per month - For getting started',
    priceInCents: 900, // $9.00
    type: 'subscription',
    metadata: {
      tier: 'starter',
      credits_per_cycle: '100',
      product_type: 'subscription',
    },
  },
  {
    key: 'hobby',
    name: 'Hobby',
    description: '200 credits per month - For personal projects',
    priceInCents: 1900, // $19.00
    type: 'subscription',
    metadata: {
      tier: 'hobby',
      credits_per_cycle: '200',
      product_type: 'subscription',
    },
  },
  {
    key: 'pro',
    name: 'Professional',
    description: '1000 credits per month - For professionals',
    priceInCents: 4900, // $49.00
    type: 'subscription',
    metadata: {
      tier: 'pro',
      credits_per_cycle: '1000',
      product_type: 'subscription',
    },
  },
  {
    key: 'business',
    name: 'Business',
    description: '5000 credits per month - For teams and agencies',
    priceInCents: 14900, // $149.00
    type: 'subscription',
    metadata: {
      tier: 'business',
      credits_per_cycle: '5000',
      product_type: 'subscription',
    },
  },
];

const CREDIT_PACK_PRODUCTS: IProductDefinition[] = [
  {
    key: 'small',
    name: 'Small Credit Pack',
    description: '50 credits - Perfect for occasional use',
    priceInCents: 499, // $4.99
    type: 'one_time',
    metadata: {
      pack_key: 'small',
      credits: '50',
      product_type: 'credit_pack',
    },
  },
  {
    key: 'medium',
    name: 'Medium Credit Pack',
    description: '200 credits - Best value for one-time purchases',
    priceInCents: 1499, // $14.99
    type: 'one_time',
    metadata: {
      pack_key: 'medium',
      credits: '200',
      product_type: 'credit_pack',
    },
  },
  {
    key: 'large',
    name: 'Large Credit Pack',
    description: '600 credits - For larger projects',
    priceInCents: 3999, // $39.99
    type: 'one_time',
    metadata: {
      pack_key: 'large',
      credits: '600',
      product_type: 'credit_pack',
    },
  },
];

const ALL_PRODUCTS = [...SUBSCRIPTION_PRODUCTS, ...CREDIT_PACK_PRODUCTS];

class StripeSetup {
  private stripe: Stripe;
  private rl: readline.Interface;
  private isTestMode: boolean;
  private envPath: string;
  private isDebug: boolean;

  constructor(secretKey: string, isTestMode: boolean, envPath: string, isDebug: boolean) {
    this.stripe = new Stripe(secretKey, {
      apiVersion: '2025-11-17.clover',
    });
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    this.isTestMode = isTestMode;
    this.envPath = envPath;
    this.isDebug = isDebug;
  }

  private log(message: string, color: keyof typeof colors = 'reset'): void {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  private async question(query: string): Promise<string> {
    return new Promise(resolve => {
      this.rl.question(query, resolve);
    });
  }

  async run(): Promise<void> {
    try {
      this.log('\n' + '='.repeat(70), 'cyan');
      this.log('  Stripe Setup for MyImageUpscaler', 'bright');
      this.log('='.repeat(70) + '\n', 'cyan');

      // Display current configuration
      this.log('Configuration:', 'blue');
      this.log(`   Mode: ${this.isTestMode ? 'TEST' : 'PRODUCTION'}`, 'yellow');
      this.log(`   Environment file: ${this.envPath}`, 'yellow');
      this.log(`   Subscription products: ${SUBSCRIPTION_PRODUCTS.length}`, 'yellow');
      this.log(`   Credit pack products: ${CREDIT_PACK_PRODUCTS.length}\n`, 'yellow');

      // First, check what already exists
      this.log('Verifying current Stripe configuration...\n', 'blue');
      const existingProducts = await this.checkExistingProducts();

      // Determine what needs to be created
      const missingProducts = ALL_PRODUCTS.filter(p => !existingProducts.has(p.key));
      const existingCount = existingProducts.size;
      const totalRequired = ALL_PRODUCTS.length;

      if (existingCount === totalRequired) {
        this.log('='.repeat(70), 'green');
        this.log('  All products already exist in Stripe!', 'green');
        this.log('='.repeat(70) + '\n', 'green');

        this.log('Current Price IDs:', 'blue');
        existingProducts.forEach(({ price, definition }) => {
          const typeLabel = definition.type === 'subscription' ? '/month' : '';
          this.log(
            `   ${definition.name}: ${price.id} ($${((price.unit_amount || 0) / 100).toFixed(2)}${typeLabel})`,
            'cyan'
          );
        });

        const recreate = await this.question(
          `\n${colors.yellow}Do you want to recreate the billing portal configuration? (yes/no): ${colors.reset}`
        );

        if (recreate.toLowerCase() === 'yes') {
          const subscriptionProducts = Array.from(existingProducts.values()).filter(
            p => p.definition.type === 'subscription'
          );
          await this.createBillingPortal(subscriptionProducts);
          await this.generateConfigOutput(Array.from(existingProducts.values()));
        } else {
          this.log('\n  No changes needed. Stripe is already configured!', 'green');
        }

        this.rl.close();
        return;
      }

      // Some products are missing
      this.log('='.repeat(70), 'yellow');
      this.log(
        `  ${existingCount}/${totalRequired} products exist. Missing ${missingProducts.length} product(s).`,
        'yellow'
      );
      this.log('='.repeat(70) + '\n', 'yellow');

      this.log('Missing products:', 'red');
      missingProducts.forEach(product => {
        const typeLabel = product.type === 'subscription' ? '/month' : '';
        this.log(
          `   - ${product.name} ($${(product.priceInCents / 100).toFixed(2)}${typeLabel})`,
          'red'
        );
      });

      if (existingCount > 0) {
        this.log('\nExisting products (will be reused):', 'green');
        existingProducts.forEach(({ price, definition }) => {
          const typeLabel = definition.type === 'subscription' ? '/month' : '';
          this.log(
            `   + ${definition.name}: ${price.id} ($${((price.unit_amount || 0) / 100).toFixed(2)}${typeLabel})`,
            'green'
          );
        });
      }

      // Warning for production
      if (!this.isTestMode) {
        this.log('\n  WARNING: You are about to create products in PRODUCTION mode!', 'red');
        this.log('   This will create real products in your live Stripe account.', 'red');
      }

      // Confirmation
      const confirm = await this.question(
        `\n${colors.yellow}Create missing products? (yes/no): ${colors.reset}`
      );

      if (confirm.toLowerCase() !== 'yes') {
        this.log('\n  Setup cancelled by user.', 'red');
        this.rl.close();
        process.exit(0);
      }

      this.log('\n' + '='.repeat(70) + '\n', 'cyan');

      // Create products and prices (reusing existing when possible)
      const createdProducts = await this.createProductsAndPrices(existingProducts);

      // Create billing portal configuration
      const subscriptionProducts = createdProducts.filter(
        p => p.definition.type === 'subscription'
      );
      await this.createBillingPortal(subscriptionProducts);

      // Generate configuration output
      await this.generateConfigOutput(createdProducts);

      this.log('\n' + '='.repeat(70), 'green');
      this.log('  Stripe setup completed successfully!', 'green');
      this.log('='.repeat(70) + '\n', 'green');

      this.log('Next steps:', 'blue');
      this.log('   1. Update subscription.config.ts with the new price IDs (if different)', 'cyan');
      this.log('   2. Restart your application', 'cyan');
      this.log('   3. Test the checkout flow\n', 'cyan');
    } catch (error) {
      this.log('\n' + '='.repeat(70), 'red');
      this.log('  Setup failed!', 'red');
      this.log('='.repeat(70) + '\n', 'red');

      if (error instanceof Error) {
        this.log(`Error: ${error.message}`, 'red');
      } else {
        this.log(`Unknown error: ${String(error)}`, 'red');
      }

      process.exit(1);
    } finally {
      this.rl.close();
    }
  }

  private async checkExistingProducts(): Promise<Map<string, ICreatedProduct>> {
    this.log('Checking for existing products...', 'blue');

    const products = await this.stripe.products.list({
      active: true,
      limit: 100,
    });

    const existingByKey = new Map<string, ICreatedProduct>();

    if (products.data.length > 0) {
      this.log(`\n  Found ${products.data.length} existing product(s):`, 'yellow');

      // Build map of existing products by tier/pack_key metadata
      for (const product of products.data) {
        const tier = product.metadata?.tier;
        const packKey = product.metadata?.pack_key;
        const key = tier || packKey;

        if (key) {
          // Get the active price for this product
          const prices = await this.stripe.prices.list({
            product: product.id,
            active: true,
            limit: 10,
          });

          // Find the matching price (subscription or one-time)
          const matchingPrice = prices.data.find(p => {
            if (tier) {
              return p.recurring?.interval === 'month';
            }
            // One-time price for credit packs
            return !p.recurring;
          });

          if (matchingPrice) {
            const definition = ALL_PRODUCTS.find(d => d.key === key);
            if (definition) {
              existingByKey.set(key, {
                product,
                price: matchingPrice,
                definition,
              });
              this.log(`   - ${product.name} (${key}) - ${product.id}`, 'yellow');
            }
          }
        } else {
          this.log(`   - ${product.name} (no tier/pack_key metadata) - ${product.id}`, 'yellow');
        }
      }

      this.log(
        `\n  Found ${existingByKey.size} product(s) with matching metadata that can be reused.\n`,
        'green'
      );
    } else {
      this.log('   No existing products found.\n', 'green');
    }

    return existingByKey;
  }

  private async createProductsAndPrices(
    existingByKey: Map<string, ICreatedProduct>
  ): Promise<ICreatedProduct[]> {
    this.log('\nCreating or reusing products and prices...\n', 'blue');

    const products: ICreatedProduct[] = [];

    for (const productDef of ALL_PRODUCTS) {
      try {
        // Check if product already exists for this key
        const existing = existingByKey.get(productDef.key);

        if (existing) {
          this.log(`Reusing existing "${productDef.name}" (${productDef.key})...`, 'cyan');
          this.log(`   Product: ${existing.product.id}`, 'green');
          this.log(
            `   Price: ${existing.price.id} ($${((existing.price.unit_amount || 0) / 100).toFixed(2)}${productDef.type === 'subscription' ? '/month' : ''})\n`,
            'green'
          );
          products.push(existing);
          continue;
        }

        // Create new product if not exists
        this.log(`Creating new "${productDef.name}" (${productDef.key})...`, 'cyan');

        const product = await this.stripe.products.create({
          name: productDef.name,
          description: productDef.description,
          metadata: {
            ...productDef.metadata,
            created_by: 'setup-script',
            created_at: new Date().toISOString(),
          },
        });

        this.log(`   Product created: ${product.id}`, 'green');

        // Create price based on product type
        let price: Stripe.Price;

        if (productDef.type === 'subscription') {
          price = await this.stripe.prices.create({
            product: product.id,
            unit_amount: productDef.priceInCents,
            currency: 'usd',
            recurring: {
              interval: 'month',
              interval_count: 1,
            },
            metadata: {
              tier: productDef.key,
              created_by: 'setup-script',
              created_at: new Date().toISOString(),
            },
          });
        } else {
          price = await this.stripe.prices.create({
            product: product.id,
            unit_amount: productDef.priceInCents,
            currency: 'usd',
            metadata: {
              pack_key: productDef.key,
              credits: productDef.metadata.credits,
              created_by: 'setup-script',
              created_at: new Date().toISOString(),
            },
          });
        }

        this.log(
          `   Price created: ${price.id} ($${(productDef.priceInCents / 100).toFixed(2)}${productDef.type === 'subscription' ? '/month' : ''})\n`,
          'green'
        );

        products.push({ product, price, definition: productDef });
      } catch (error) {
        this.log(`   Failed to create "${productDef.name}"`, 'red');
        if (error instanceof Error) {
          this.log(`     Error: ${error.message}`, 'red');
        }
        throw error;
      }
    }

    return products;
  }

  private async createBillingPortal(subscriptionProducts: ICreatedProduct[]): Promise<void> {
    this.log('Creating billing portal configuration...\n', 'blue');

    try {
      // Check for existing configurations
      const existingConfigs = await this.stripe.billingPortal.configurations.list();

      if (existingConfigs.data.length > 0) {
        this.log(`   Found ${existingConfigs.data.length} existing configuration(s)`, 'yellow');
      }

      // Create new billing portal configuration
      const config = await this.stripe.billingPortal.configurations.create({
        business_profile: {
          headline: 'Manage your MyImageUpscaler subscription',
        },
        features: {
          customer_update: {
            enabled: true,
            allowed_updates: ['email', 'address'],
          },
          invoice_history: {
            enabled: true,
          },
          payment_method_update: {
            enabled: true,
          },
          subscription_cancel: {
            enabled: true,
            mode: 'at_period_end',
          },
          subscription_update: {
            enabled: true,
            default_allowed_updates: ['price'],
            proration_behavior: 'create_prorations',
            products: subscriptionProducts.map(({ product, price }) => ({
              product: product.id,
              prices: [price.id],
            })),
          },
        },
      });

      this.log(`   Billing portal created: ${config.id}`, 'green');
      this.log(
        `   Features enabled: Customer update, Invoice history, Payment method update`,
        'green'
      );
      this.log(
        `   Subscription management: Enabled with ${subscriptionProducts.length} products`,
        'green'
      );
      this.log(`   Subscription updates: Users can upgrade/downgrade between plans\n`, 'green');
    } catch (error) {
      this.log('   Failed to create billing portal', 'red');
      if (error instanceof Error) {
        this.log(`     Error: ${error.message}`, 'red');
      }
      throw error;
    }
  }

  private async generateConfigOutput(createdProducts: ICreatedProduct[]): Promise<void> {
    this.log('Generated configuration:\n', 'blue');

    this.log('='.repeat(70), 'cyan');
    this.log('Update shared/config/subscription.config.ts with these price IDs:', 'bright');
    this.log('='.repeat(70) + '\n', 'cyan');

    // Subscription plans
    this.log('// Subscription Plans', 'yellow');
    const subscriptions = createdProducts.filter(p => p.definition.type === 'subscription');
    subscriptions.forEach(({ definition, price }) => {
      this.log(`// ${definition.name}`, 'cyan');
      this.log(`stripePriceId: '${price.id}',`, 'cyan');
      this.log('', 'reset');
    });

    // Credit packs
    this.log('// Credit Packs', 'yellow');
    const creditPacks = createdProducts.filter(p => p.definition.type === 'one_time');
    creditPacks.forEach(({ definition, price }) => {
      this.log(`// ${definition.name}`, 'cyan');
      this.log(`stripePriceId: '${price.id}',`, 'cyan');
      this.log('', 'reset');
    });

    this.log('='.repeat(70) + '\n', 'cyan');

    // Save to file
    const outputPath = path.join(
      __dirname,
      `stripe-setup-output-${this.isTestMode ? 'test' : 'prod'}.txt`
    );

    const lines: string[] = [
      `Stripe Setup Output - ${this.isTestMode ? 'TEST' : 'PRODUCTION'} Mode`,
      `Generated at: ${new Date().toISOString()}`,
      '',
      '=== Subscription Plans ===',
    ];

    subscriptions.forEach(({ definition, product, price }) => {
      lines.push(`${definition.name}:`);
      lines.push(`  Product ID: ${product.id}`);
      lines.push(`  Price ID: ${price.id}`);
      lines.push(`  Amount: $${(definition.priceInCents / 100).toFixed(2)}/month`);
      lines.push('');
    });

    lines.push('=== Credit Packs ===');
    creditPacks.forEach(({ definition, product, price }) => {
      lines.push(`${definition.name}:`);
      lines.push(`  Product ID: ${product.id}`);
      lines.push(`  Price ID: ${price.id}`);
      lines.push(`  Amount: $${(definition.priceInCents / 100).toFixed(2)}`);
      lines.push(`  Credits: ${definition.metadata.credits}`);
      lines.push('');
    });

    if (this.isDebug) {
      fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
      this.log(`Configuration saved to: ${outputPath}`, 'green');
    } else {
      this.log('Configuration output to file skipped (use --debug to enable)', 'yellow');
    }
  }
}

// Main execution
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const forceMode = args.find(arg => arg === '--test' || arg === '--prod' || arg === '--dev');
  const isDebug = args.includes('--debug');

  // Determine which .env file to use based on mode
  let envPath: string;
  if (forceMode === '--prod') {
    // Production mode: use .env.api (server secrets)
    envPath = path.resolve(process.cwd(), '.env.api');
  } else {
    // Dev/test mode: use .env.api
    envPath = path.resolve(process.cwd(), '.env.api');
  }

  // Try to load .env file
  if (fs.existsSync(envPath)) {
    dotenvConfig({ path: envPath });
  } else {
    console.error(`${colors.red}Error: .env file not found at ${envPath}${colors.reset}`);
    console.error(
      `${colors.yellow}Run this script from the project root directory.${colors.reset}`
    );
    process.exit(1);
  }

  // Get Stripe credentials from environment
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    console.error(`${colors.red}Error: STRIPE_SECRET_KEY not found in ${envPath}${colors.reset}`);
    process.exit(1);
  }

  // Determine mode from secret key if not forced
  let isTestMode: boolean;
  if (forceMode === '--test' || forceMode === '--dev') {
    isTestMode = true;
  } else if (forceMode === '--prod') {
    isTestMode = false;
  } else {
    isTestMode = secretKey.startsWith('sk_test_');
  }

  // Validate key matches mode
  const keyMode = secretKey.startsWith('sk_test_') ? 'test' : 'production';
  const targetMode = isTestMode ? 'test' : 'production';

  if (keyMode !== targetMode) {
    console.error(
      `${colors.red}Error: Your secret key is for ${keyMode} mode, but you're trying to run in ${targetMode} mode.${colors.reset}`
    );
    console.error(
      `${colors.yellow}Please update your .env.api file with the correct credentials, or use the matching --test or --prod flag.${colors.reset}`
    );
    process.exit(1);
  }

  console.log(`${colors.blue}Using env file: ${envPath}${colors.reset}`);
  console.log(`${colors.blue}Stripe mode: ${isTestMode ? 'TEST' : 'PRODUCTION'}${colors.reset}`);
  console.log(`${colors.blue}Debug mode: ${isDebug ? 'enabled' : 'disabled'}${colors.reset}\n`);

  const setup = new StripeSetup(secretKey, isTestMode, envPath, isDebug);
  await setup.run();
}

// Run the script
main().catch(error => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});
