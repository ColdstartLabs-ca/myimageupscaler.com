#!/bin/bash

# Consolidated Stripe Setup Script
# Creates all Stripe products and prices, updates config file
# Replaces: create-stripe-products.sh, stripe-product-sync.sh, stripe-env.sh

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 STRIPE SETUP SCRIPT${NC}"
echo "========================"

# Load environment variables from .env
ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}❌ .env file not found!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Loading environment from $ENV_FILE${NC}"
source "$(dirname "$0")/load-env.sh" "$ENV_FILE"

# Validate required variables
if [ -z "${STRIPE_SECRET_KEY:-}" ]; then
    echo -e "${RED}❌ STRIPE_SECRET_KEY not found in environment!${NC}"
    exit 1
fi

if [ -z "${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:-}" ]; then
    echo -e "${RED}❌ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY not found!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Stripe keys validated${NC}"

# Helper function to make Stripe API calls
stripe_request() {
    local method="$1"
    local endpoint="$2"
    local data="$3"

    curl -s -X "$method" \
        -u "$STRIPE_SECRET_KEY:" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "$data" \
        "https://api.stripe.com/v1$endpoint"
}

# Helper function to create product
create_product() {
    local name="$1"
    local description="$2"

    # URL encode the parameters
    local encoded_name=$(echo "$name" | jq -sRr @uri)
    local encoded_desc=$(echo "$description" | jq -sRr @uri)

    local response=$(stripe_request "POST" "/products" "name=$encoded_name&description=$encoded_desc")

    # Extract ID more safely using python
    local id=$(echo "$response" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "$response" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

    if [ -z "$id" ]; then
        echo -e "${RED}❌ Failed to create product: $name${NC}"
        echo "Response: $response" >&2
        exit 1
    fi

    echo "$id"
}

# Helper function to create price
create_price() {
    local product_id="$1"
    local amount="$2"
    local recurring="${3:-}"
    local metadata="${4:-}"

    local data="product=$product_id&currency=usd&unit_amount=$amount"

    if [ -n "$recurring" ]; then
        data="$data&recurring[interval]=$recurring"
    fi

    if [ -n "$metadata" ]; then
        data="$data&$metadata"
    fi

    local response=$(stripe_request "POST" "/prices" "$data")

    # Extract ID more safely using python
    local id=$(echo "$response" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "$response" | grep -o '"id":"price_[^"]*"' | head -1 | cut -d'"' -f4)

    if [ -z "$id" ]; then
        echo -e "${RED}❌ Failed to create price for product: $product_id${NC}"
        echo "Response: $response" >&2
        exit 1
    fi

    echo "$id"
}

echo -e "\n${BLUE}📦 Creating Credit Pack Products...${NC}"

# Create credit packs
echo "Creating Starter Credits..."
STARTER_PRODUCT_ID=$(create_product "Starter Credits Pack" "100 processing credits perfect for trying out")
STARTER_PRICE_ID=$(create_price "$STARTER_PRODUCT_ID" "999" "" "metadata[credits]=100")
echo -e "${GREEN}✅ Starter Credits: $STARTER_PRICE_ID${NC}"

echo "Creating Pro Credits..."
PRO_PRODUCT_ID=$(create_product "Pro Credits Pack" "500 processing credits - best value for regular users")
PRO_PRICE_ID=$(create_price "$PRO_PRODUCT_ID" "2999" "" "metadata[credits]=500")
echo -e "${GREEN}✅ Pro Credits: $PRO_PRICE_ID${NC}"

echo "Creating Enterprise Credits..."
ENTERPRISE_PRODUCT_ID=$(create_product "Enterprise Credits Pack" "2000 processing credits for power users")
ENTERPRISE_PRICE_ID=$(create_price "$ENTERPRISE_PRODUCT_ID" "9999" "" "metadata[credits]=2000")
echo -e "${GREEN}✅ Enterprise Credits: $ENTERPRISE_PRICE_ID${NC}"

echo -e "\n${BLUE}🔄 Creating Subscription Products...${NC}"

# Create subscriptions
echo "Creating Hobby Monthly..."
HOBBY_PRODUCT_ID=$(create_product "Hobby Plan" "For personal projects - 200 credits per month")
HOBBY_PRICE_ID=$(create_price "$HOBBY_PRODUCT_ID" "1900" "month" "metadata[credits_per_month]=200")
echo -e "${GREEN}✅ Hobby Monthly: $HOBBY_PRICE_ID${NC}"

echo "Creating Pro Monthly..."
PRO_MONTHLY_PRODUCT_ID=$(create_product "Professional Plan" "For professionals - 1000 credits per month")
PRO_MONTHLY_PRICE_ID=$(create_price "$PRO_MONTHLY_PRODUCT_ID" "4900" "month" "metadata[credits_per_month]=1000")
echo -e "${GREEN}✅ Pro Monthly: $PRO_MONTHLY_PRICE_ID${NC}"

echo "Creating Business Monthly..."
BUSINESS_PRODUCT_ID=$(create_product "Business Plan" "For teams and agencies - 5000 credits per month")
BUSINESS_PRICE_ID=$(create_price "$BUSINESS_PRODUCT_ID" "14900" "month" "metadata[credits_per_month]=5000")
echo -e "${GREEN}✅ Business Monthly: $BUSINESS_PRICE_ID${NC}"

echo -e "\n${BLUE}🔧 Updating shared/config/stripe.ts with real Price IDs...${NC}"

# Backup the original file
cp shared/config/stripe.ts shared/config/stripe.ts.backup

# Update the stripe.ts file with real price IDs
cat > shared/config/stripe.ts << EOF
/**
 * Centralized Stripe Payment Configuration
 *
 * This file contains all Stripe pricing and product configuration.
 * Auto-generated by stripe-setup.sh on $(date)
 */

import { clientEnv, serverEnv } from './env';

// Static Stripe Price IDs - Real Stripe Price IDs
export const STRIPE_PRICES = {
  // Credit Packs (One-time payments)
  STARTER_CREDITS: '$STARTER_PRICE_ID', // \$9.99 for 100 credits
  PRO_CREDITS: '$PRO_PRICE_ID',        // \$29.99 for 500 credits
  ENTERPRISE_CREDITS: '$ENTERPRISE_PRICE_ID', // \$99.99 for 2000 credits

  // Subscriptions (Recurring payments)
  HOBBY_MONTHLY: '$HOBBY_PRICE_ID',     // \$19/month for 200 credits
  PRO_MONTHLY: '$PRO_MONTHLY_PRICE_ID', // \$49/month for 1000 credits
  BUSINESS_MONTHLY: '$BUSINESS_PRICE_ID', // \$149/month for 5000 credits
} as const;

export type StripePriceKey = keyof typeof STRIPE_PRICES;

/**
 * Credit pack configuration with associated credits
 */
export const CREDIT_PACKS = {
  STARTER_CREDITS: {
    name: 'Starter Pack',
    description: 'Perfect for trying out',
    price: 9.99,
    credits: 100,
    features: ['100 processing credits', 'Valid for 12 months', 'Email support', 'Basic features'],
  },
  PRO_CREDITS: {
    name: 'Pro Pack',
    description: 'Best value for regular users',
    price: 29.99,
    credits: 500,
    features: [
      '500 processing credits',
      'Valid for 12 months',
      'Priority email support',
      'All features included',
      '40% more credits',
    ],
    recommended: true,
  },
  ENTERPRISE_CREDITS: {
    name: 'Enterprise Pack',
    description: 'For power users',
    price: 99.99,
    credits: 2000,
    features: [
      '2000 processing credits',
      'Valid for 12 months',
      '24/7 priority support',
      'All features included',
      'Best value per credit',
    ],
  },
} as const;

/**
 * Subscription plan configuration
 */
export const SUBSCRIPTION_PLANS = {
  HOBBY_MONTHLY: {
    name: 'Hobby',
    description: 'For personal projects',
    price: 19,
    interval: 'month' as const,
    creditsPerMonth: 200,
    features: [
      '200 credits per month',
      'Rollover unused credits',
      'Email support',
      'All features included',
    ],
  },
  PRO_MONTHLY: {
    name: 'Professional',
    description: 'For professionals',
    price: 49,
    interval: 'month' as const,
    creditsPerMonth: 1000,
    features: [
      '1000 credits per month',
      'Rollover unused credits',
      'Priority support',
      'All features included',
      'Early access to new features',
    ],
    recommended: true,
  },
  BUSINESS_MONTHLY: {
    name: 'Business',
    description: 'For teams and agencies',
    price: 149,
    interval: 'month' as const,
    creditsPerMonth: 5000,
    features: [
      '5000 credits per month',
      'Rollover unused credits',
      '24/7 priority support',
      'All features included',
      'Dedicated account manager',
      'Custom integrations',
    ],
  },
} as const;

/**
 * Check if Stripe prices are configured
 */
export function isStripePricesConfigured(): boolean {
  return true; // Always return true for static configuration
}

/**
 * Get the price ID for a given key, with validation
 */
export function getPriceId(key: StripePriceKey): string {
  const priceId = STRIPE_PRICES[key];
  if (!priceId || priceId.includes('000000000000000000000')) {
    console.warn(\`Stripe Price ID for \${key} is not properly configured.\`);
  }
  return priceId;
}

/**
 * Homepage pricing tiers - derived from subscription plans
 * Used by Pricing.tsx on homepage
 */
export const HOMEPAGE_TIERS = [
  {
    name: 'Free Tier',
    price: '\$0',
    priceValue: 0,
    period: '/mo',
    description: 'For testing and personal use.',
    features: [
      '10 images per month',
      '2x & 4x Upscaling',
      'Basic Enhancement',
      'No watermark',
      '5MB file limit',
    ],
    cta: 'Start for Free',
    variant: 'outline' as const,
    priceId: null, // No Stripe price for free tier
    recommended: false,
  },
  {
    name: SUBSCRIPTION_PLANS.HOBBY_MONTHLY.name,
    price: \`$\${SUBSCRIPTION_PLANS.HOBBY_MONTHLY.price}\`,
    priceValue: SUBSCRIPTION_PLANS.HOBBY_MONTHLY.price,
    period: '/mo',
    description: SUBSCRIPTION_PLANS.HOBBY_MONTHLY.description,
    features: SUBSCRIPTION_PLANS.HOBBY_MONTHLY.features,
    cta: 'Get Started',
    variant: 'secondary' as const,
    priceId: STRIPE_PRICES.HOBBY_MONTHLY,
    recommended: false,
  },
  {
    name: SUBSCRIPTION_PLANS.PRO_MONTHLY.name,
    price: \`$\${SUBSCRIPTION_PLANS.PRO_MONTHLY.price}\`,
    priceValue: SUBSCRIPTION_PLANS.PRO_MONTHLY.price,
    period: '/mo',
    description: SUBSCRIPTION_PLANS.PRO_MONTHLY.description,
    features: SUBSCRIPTION_PLANS.PRO_MONTHLY.features,
    cta: 'Get Started',
    variant: 'primary' as const,
    priceId: STRIPE_PRICES.PRO_MONTHLY,
    recommended: true,
  },
] as const;

// =============================================================================
// Stripe Configuration Validation & Access
// =============================================================================

/**
 * Get the Stripe publishable key for client-side usage
 */
export function getStripePublishableKey(): string {
  return clientEnv.STRIPE_PUBLISHABLE_KEY;
}

/**
 * Get the Stripe secret key for server-side usage
 * Only accessible on the server
 */
export function getStripeSecretKey(): string {
  return serverEnv.STRIPE_SECRET_KEY || '';
}

/**
 * Get the Stripe webhook secret for server-side webhook verification
 */
export function getStripeWebhookSecret(): string {
  return serverEnv.STRIPE_WEBHOOK_SECRET || '';
}

/**
 * Complete Stripe configuration object
 * Use this to get all Stripe-related configuration in one place
 */
export function getStripeConfig(): {
  publishableKey: string;
  secretKey: string;
  webhookSecret: string;
  prices: typeof STRIPE_PRICES;
  creditPacks: typeof CREDIT_PACKS;
  subscriptionPlans: typeof SUBSCRIPTION_PLANS;
  homepageTiers: typeof HOMEPAGE_TIERS;
} {
  return {
    // Client-side configuration
    publishableKey: clientEnv.STRIPE_PUBLISHABLE_KEY,

    // Server-side configuration (only available on server)
    secretKey: serverEnv.STRIPE_SECRET_KEY || '',
    webhookSecret: serverEnv.STRIPE_WEBHOOK_SECRET || '',

    // Price IDs
    prices: STRIPE_PRICES,

    // Product configurations
    creditPacks: CREDIT_PACKS,
    subscriptionPlans: SUBSCRIPTION_PLANS,

    // Homepage pricing
    homepageTiers: HOMEPAGE_TIERS,
  };
}

/**
 * Validate that all required Stripe configuration is present
 * Returns an object with validation results
 */
export function validateStripeConfig(): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check client-side configuration
  if (!clientEnv.STRIPE_PUBLISHABLE_KEY) {
    errors.push('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not configured');
  } else if (clientEnv.STRIPE_PUBLISHABLE_KEY.includes('pk_test_xxx') || clientEnv.STRIPE_PUBLISHABLE_KEY.includes('pk_live_xxx')) {
    warnings.push('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY appears to be a placeholder key');
  }

  // Check server-side configuration
  if (!serverEnv.STRIPE_SECRET_KEY) {
    errors.push('STRIPE_SECRET_KEY is not configured');
  } else if (serverEnv.STRIPE_SECRET_KEY.includes('dummy') || serverEnv.STRIPE_SECRET_KEY.includes('placeholder')) {
    warnings.push('STRIPE_SECRET_KEY appears to be a dummy/placeholder key');
  }

  if (!serverEnv.STRIPE_WEBHOOK_SECRET) {
    warnings.push('STRIPE_WEBHOOK_SECRET is not configured - webhook signature verification will fail');
  }

  // Check price IDs
  const missingPrices = Object.entries(STRIPE_PRICES)
    .filter(([, priceId]) => !priceId || priceId.includes('000000000000000000000'))
    .map(([key]) => key);

  if (missingPrices.length > 0) {
    errors.push(\`Missing or invalid Stripe Price IDs: \${missingPrices.join(', ')}\`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if Stripe is properly configured for payments
 * This is a convenience function that returns true if the essential configuration is present
 */
export function isStripeConfigured(): boolean {
  const validation = validateStripeConfig();
  return validation.isValid && serverEnv.STRIPE_SECRET_KEY.length > 0;
}
EOF

echo -e "\n${GREEN}✅ SUCCESS!${NC}"
echo "=================="
echo ""
echo -e "${YELLOW}📋 Created Price IDs:${NC}"
echo "   Starter Credits:  $STARTER_PRICE_ID"
echo "   Pro Credits:      $PRO_PRICE_ID"
echo "   Enterprise Credits: $ENTERPRISE_PRICE_ID"
echo "   Hobby Monthly:    $HOBBY_PRICE_ID"
echo "   Pro Monthly:      $PRO_MONTHLY_PRICE_ID"
echo "   Business Monthly: $BUSINESS_PRICE_ID"
echo ""
echo -e "${YELLOW}💾 Files updated:${NC}"
echo "   - shared/config/stripe.ts (with real Price IDs)"
echo "   - shared/config/stripe.ts.backup (original file)"
echo ""
echo -e "${GREEN}🚀 Ready to test payments!${NC}"
echo ""
echo -e "${BLUE}💡 Next steps:${NC}"
echo "   1. Restart your dev server"
echo "   2. Test the payment flow on the landing page"
echo ""
echo -e "${BLUE}🗑️  To clean up old scripts (optional):${NC}"
echo "   rm scripts/create-stripe-products.sh"
echo "   rm scripts/stripe-product-sync.sh"
echo "   rm scripts/stripe-env.sh"