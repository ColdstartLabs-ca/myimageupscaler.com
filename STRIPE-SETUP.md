# Stripe Payment Setup Guide

This document explains the complete Stripe payment setup and troubleshooting for PixelPerfect AI.

## Overview

The payment flow works as follows:
1. User selects a pricing plan on the landing page
2. App adds `checkout_price` parameter to URL
3. Authentication modal opens
4. After successful authentication, user is redirected to Stripe Checkout
5. User completes payment and is redirected back to the app

## Scripts

### Main Scripts

1. **`scripts/stripe-setup.sh`** - One-time setup to create all Stripe products and prices
   - Creates all necessary products in Stripe
   - Updates `shared/config/stripe.ts` with real Price IDs
   - Run this once to initialize your Stripe account

2. **`scripts/stripe-complete-setup.sh`** - Complete verification and troubleshooting
   - Verifies environment variables
   - Tests Stripe API connection
   - Checks existing products
   - Validates configuration
   - Cleans up old scripts

### Old Scripts (Removed)

The following scripts have been consolidated into `stripe-setup.sh`:
- `create-stripe-products.sh`
- `stripe-product-sync.sh`
- `stripe-env.sh`

## Configuration

### Environment Variables

Ensure these are configured in your `.env` file:
```env
# Client-side (exposed to browser)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Server-side (never exposed)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Price IDs

Real Price IDs are automatically configured in `shared/config/stripe.ts`:
- **Pro Monthly**: `price_1SZmVzALMLhQocpfPyRX2W8D` ($49/month)
- **Hobby Monthly**: `price_1SZmVyALMLhQocpf0H7n5ls8` ($19/month)
- **Business Monthly**: `price_1SZmVzALMLhQocpfqPk9spg4` ($149/month)
- **Starter Credits**: `price_1SZmVxALMLhQocpfYPN36mgk` ($9.99 for 100 credits)
- **Pro Credits**: `price_1SZmVxALMLhQocpfVYhFMSO5` ($29.99 for 500 credits)
- **Enterprise Credits**: `price_1SZmVyALMLhQocpfZwmDQ5kt` ($99.99 for 2000 credits)

## Database Schema

The `profiles` table includes a `stripe_customer_id` column to store the Stripe customer ID for each user. This is automatically created when a user first makes a purchase.

## Test User

For testing purposes, a test user is available:
- **Email**: `testuser@pixelperfect.test`
- **Password**: `TestPassword123!`
- **Stripe Customer ID**: `cus_TWpyt0XxoNQ8Kb`

## Troubleshooting

### Issue: "No such customer" error

This happens when a user has a Stripe customer ID in the database that doesn't exist in Stripe.

**Solution**:
1. Check the `stripe_customer_id` field in the `profiles` table
2. If it's a mock ID starting with `cus_test_`, set it to `NULL`
3. The next checkout will automatically create a real Stripe customer

### Issue: STRIPE_SECRET_KEY not set

The server needs access to the Stripe secret key. Make sure:
1. It's in your `.env` file (not `.env.prod` for development)
2. The `.env` file is loaded by your dev script
3. The key starts with `sk_test_` for test mode or `sk_live_` for production

### Issue: Price ID not found

This happens when using placeholder Price IDs.

**Solution**: Run `./scripts/stripe-setup.sh` to create real products and update the configuration.

## Testing the Flow

1. Start your dev server:
   ```bash
   yarn dev
   ```

2. Go to http://localhost:3000

3. Click "Get Started" on any pricing tier

4. Sign in with test credentials:
   - Email: `testuser@pixelperfect.test`
   - Password: `TestPassword123!`

5. Complete the Stripe checkout using test card:
   - Card Number: `4242 4242 4242 4242`
   - Expiry: Any future date
   - CVC: Any 3 digits

6. You should be redirected to the success page

## Important Notes

- The app uses Stripe Checkout (redirect to Stripe-hosted page), not an in-app modal
- All Stripe operations happen server-side for security
- The auth store handles checkout redirects after authentication
- Webhooks handle subscription updates and payment confirmations

## Links

- [Stripe Dashboard](https://dashboard.stripe.com/test)
- [Stripe Test Cards](https://stripe.com/docs/testing#cards)
- [API Reference](./docs/technical/api-reference.md)