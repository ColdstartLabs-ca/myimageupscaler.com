# Credit Top-Up Feature - Setup & Testing Guide

## Overview

The credit top-up feature allows users to purchase one-time credit packs without subscribing. This document explains how to set up the feature and test it end-to-end.

## Architecture

### Components

1. **Backend**:
   - `/api/checkout` - Updated to support both `subscription` and `payment` modes
   - `/api/webhooks/stripe` - Processes credit pack purchases via `handleCreditPackPurchase()`
   - `subscription.config.ts` - Defines available credit packs

2. **Frontend**:
   - `CreditPackSelector` - Card-based UI for selecting and purchasing packs
   - `OutOfCreditsModal` - Modal shown when user runs out of credits
   - Integration in `/dashboard/billing` and `/pricing` pages
   - `CreditsDisplay` - Updated with "Buy more credits" link

3. **Database**:
   - Uses existing `increment_credits_with_log` RPC with `type: 'purchase'`
   - No schema changes required

## Setup Instructions

### 1. Create Stripe Products (One-Time Setup)

Run the setup script to create products and prices in Stripe:

```bash
# For test mode
export STRIPE_SECRET_KEY=sk_test_your_key_here
npx tsx scripts/setup-stripe-credit-packs.ts

# For production (after testing)
export STRIPE_SECRET_KEY=sk_live_your_key_here
npx tsx scripts/setup-stripe-credit-packs.ts
```

The script will:
- Create a "PixelPerfect Credit Packs" product
- Create three one-time prices (Small, Medium, Large)
- Output environment variables to add to `.env`

### 2. Configure Environment Variables

Add the price IDs from the setup script output to your `.env` file:

```env
# Credit Pack Stripe Price IDs
NEXT_PUBLIC_STRIPE_PRICE_CREDITS_SMALL=price_xxxxxxxxxxxxx
NEXT_PUBLIC_STRIPE_PRICE_CREDITS_MEDIUM=price_xxxxxxxxxxxxx
NEXT_PUBLIC_STRIPE_PRICE_CREDITS_LARGE=price_xxxxxxxxxxxxx
```

### 3. Configure Credit Packs

The credit packs are defined in `shared/config/subscription.config.ts`:

```typescript
creditPacks: [
  {
    key: 'small',
    name: 'Small Pack',
    credits: 50,
    priceInCents: 499, // $4.99
    stripePriceId: clientEnv.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_SMALL,
    // ...
  },
  // medium, large...
]
```

To modify packs:
1. Update the configuration in `subscription.config.ts`
2. Create new prices in Stripe (via dashboard or script)
3. Update environment variables

### 4. Test Webhook Integration

Use Stripe CLI to test webhooks locally:

```bash
# Install Stripe CLI
# https://stripe.com/docs/stripe-cli

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Trigger test webhook
stripe trigger checkout.session.completed
```

## Testing Guide

### Manual Testing Flow

1. **Navigate to Billing Page**
   - Go to `/dashboard/billing`
   - Verify "Buy Credits" section is visible
   - Verify three credit packs are displayed

2. **Select a Credit Pack**
   - Click on a pack (e.g., Medium Pack for $14.99)
   - Should redirect to Stripe Checkout
   - Verify pack details are correct

3. **Complete Purchase** (Test Mode)
   - Use test card: `4242 4242 4242 4242`
   - Expiry: Any future date
   - CVC: Any 3 digits
   - Complete checkout

4. **Verify Credits Added**
   - Webhook should process within seconds
   - Navigate back to `/dashboard/billing`
   - Verify credits were added to balance
   - Check `/dashboard/billing` → Credit History for transaction

5. **Verify Transaction Logging**
   - Query Supabase:
     ```sql
     SELECT * FROM credit_transactions
     WHERE type = 'purchase'
     ORDER BY created_at DESC
     LIMIT 10;
     ```
   - Should see entry with:
     - `type: 'purchase'`
     - Correct credit amount
     - `ref_id` starting with `pi_` (payment intent)

### Automated Testing

Run the test suite:

```bash
# Unit tests for utility functions
yarn test shared/config/subscription.utils.test.ts

# Integration tests for checkout API
yarn test app/api/checkout/route.test.ts

# E2E test for full purchase flow (requires Playwright)
yarn test:e2e credit-purchase.spec.ts
```

### Testing Edge Cases

1. **Concurrent Purchases**:
   - Start two purchase flows in different tabs
   - Both should complete successfully
   - Credits should be additive

2. **Failed Payments**:
   - Use declining test card: `4000 0000 0000 0002`
   - Should return to page without adding credits

3. **Webhook Idempotency**:
   - Manually replay same webhook event ID
   - Should respond with `{ skipped: true }` (already processed)

4. **Subscription + Credit Pack**:
   - Subscribe to a plan
   - Purchase a credit pack
   - Both credit sources should coexist

5. **Refund Handling**:
   - Complete a purchase
   - Issue refund via Stripe dashboard
   - Credits should be clawed back

## Monitoring & Debugging

### Logs to Watch

1. **Checkout API** (`/api/checkout`):
   ```
   "Creating Stripe Checkout Session (supports both subscription and payment modes)"
   "mode: payment" // For credit packs
   ```

2. **Webhook Handler** (`/api/webhooks/stripe`):
   ```
   "Checkout completed for user {userId}, mode: payment"
   "Added {credits} purchased credits to user {userId} (pack: {packKey})"
   ```

3. **RPC Function** (`increment_credits_with_log`):
   ```sql
   -- Check recent transactions
   SELECT * FROM credit_transactions
   WHERE type = 'purchase'
   ORDER BY created_at DESC;
   ```

### Common Issues

| Issue | Solution |
|-------|----------|
| "Invalid price ID" error | Verify env vars are set and match Stripe prices |
| Webhook not processing | Check Stripe webhook secret is correct |
| Credits not added | Check Supabase logs for RPC errors |
| Pack not showing in UI | Verify `enabled: true` in config |

## Production Checklist

Before deploying to production:

- [ ] Run setup script in production Stripe account
- [ ] Add production price IDs to environment variables
- [ ] Test purchase with real card in test mode
- [ ] Verify webhook endpoint is reachable from Stripe
- [ ] Check webhook secret is set correctly
- [ ] Monitor first few purchases in production
- [ ] Set up alerts for failed webhook processing
- [ ] Document support process for purchase issues

## Feature Flags

To temporarily disable credit packs:

```typescript
// In subscription.config.ts
creditPacks: [
  {
    key: 'small',
    enabled: false, // Disable this pack
    // ...
  }
]
```

## Support Resources

- **PRD**: `/docs/PRDs/credit-topup-feature.md`
- **Stripe Dashboard**: https://dashboard.stripe.com
- **Webhook Logs**: Dashboard → Developers → Webhooks
- **Test Cards**: https://stripe.com/docs/testing
