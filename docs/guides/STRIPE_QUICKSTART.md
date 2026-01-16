# Stripe Integration - Quick Start Guide

## 🚀 Get Started in 5 Minutes

This guide will get you up and running with Stripe integration quickly.

## Step 1: Database Setup (2 minutes)

1. **Run Migrations in Supabase SQL Editor**

   Copy and paste each file in order:

   ```sql
   -- 1. Profiles table
   -- Copy contents of: supabase/migrations/20250120_create_profiles_table.sql

   -- 2. Subscriptions & Products
   -- Copy contents of: supabase/migrations/20250120_create_subscriptions_table.sql

   -- 3. RPC Functions
   -- Copy contents of: supabase/migrations/20250120_create_rpc_functions.sql
   ```

2. **Verify tables were created**
   ```sql
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public'
   AND table_name IN ('profiles', 'subscriptions', 'products', 'prices');
   ```

## Step 2: Stripe Setup (2 minutes)

1. **Get your Stripe API keys**
   - Go to https://dashboard.stripe.com/test/apikeys
   - Copy your **Secret key** (sk*test*...)

2. **Create a test product**

   ```bash
   # In Stripe Dashboard: Products → Add Product
   # Name: "100 Credits Pack"
   # Price: $9.99 (one-time)
   # Copy the Price ID (price_...)
   ```

3. **Or use Stripe CLI**
   ```bash
   stripe products create --name="100 Credits" --description="100 processing credits"
   stripe prices create --product=prod_XXX --unit-amount=999 --currency=usd
   ```

## Step 3: Environment Variables (1 minute)

Create `.env.local` in project root:

```bash
# Supabase (get from Supabase Dashboard → Settings → API)
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...

# Stripe (get from Stripe Dashboard → Developers → API keys)
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx  # Leave empty for now

# App
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

## Step 4: Test Locally (5 minutes)

1. **Start your dev server**

   ```bash
   yarn dev
   ```

2. **Set up Stripe webhook forwarding**

   ```bash
   # In a new terminal
   stripe login
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```

   Copy the webhook secret (whsec\_...) and update `.env.local`:

   ```bash
   STRIPE_WEBHOOK_SECRET=whsec_xxxxx
   ```

3. **Test the integration**

   Create a test page: `app/test-stripe/page.tsx`

   ```tsx
   'use client';

   import { BuyCreditsButton, CreditsDisplay } from '@/components/stripe';

   export default function TestStripePage() {
     return (
       <div className="container mx-auto p-8">
         <h1 className="text-3xl font-bold mb-8">Stripe Integration Test</h1>

         <div className="mb-8">
           <h2 className="text-xl mb-4">Current Credits:</h2>
           <CreditsDisplay />
         </div>

         <div>
           <h2 className="text-xl mb-4">Buy Credits:</h2>
           <BuyCreditsButton priceId="price_YOUR_PRICE_ID" creditsAmount={100} price={9.99} />
         </div>
       </div>
     );
   }
   ```

4. **Visit the test page**
   - Go to http://localhost:3000/test-stripe
   - Click "Buy 100 Credits"
   - Complete test payment (use card: 4242 4242 4242 4242)
   - Credits should be added to your account!

## Step 5: Verify Webhook (1 minute)

1. **Check webhook received the event**
   - Look at the terminal running `stripe listen`
   - You should see: `checkout.session.completed`

2. **Check database was updated**
   ```sql
   SELECT credits_balance FROM profiles WHERE id = 'your-user-id';
   ```

## 🎉 Success!

You now have a fully working Stripe integration!

## Next Steps

### Add a Pricing Page

```tsx
// app/pricing/page.tsx
'use client';

import { PricingCard } from '@/components/stripe';

export default function PricingPage() {
  return (
    <div className="container mx-auto py-16">
      <h1 className="text-4xl font-bold text-center mb-12">Pricing</h1>

      <div className="grid md:grid-cols-3 gap-8">
        <PricingCard
          name="Starter"
          price={9.99}
          features={['100 credits', 'Basic support']}
          priceId="price_starter"
          creditsAmount={100}
        />

        <PricingCard
          name="Pro"
          price={29}
          interval="month"
          features={['1000 credits/month', 'Priority support', 'Advanced features']}
          priceId="price_pro"
          recommended
        />

        <PricingCard
          name="Enterprise"
          price={99}
          interval="month"
          features={['Unlimited credits', '24/7 support', 'Custom integration']}
          priceId="price_enterprise"
        />
      </div>
    </div>
  );
}
```

### Add Credits to User Profile

```tsx
// Add to your dashboard/profile page
import { CreditsDisplay, SubscriptionStatus } from '@/components/stripe';

<div className="flex flex-col gap-4">
  <CreditsDisplay />
  <SubscriptionStatus />
</div>;
```

### Use Credits in Your App

```tsx
import { StripeService } from '@/lib/stripe';

async function processImage(imageData: any) {
  // Check if user has credits
  const hasCredits = await StripeService.hasSufficientCredits(1);

  if (!hasCredits) {
    throw new Error('Insufficient credits. Please purchase more.');
  }

  // Process the image
  const result = await yourImageProcessingFunction(imageData);

  // Deduct credit
  await StripeService.decrementCredits(1);

  return result;
}
```

## Production Deployment

When ready for production:

1. **Switch to Live Mode in Stripe Dashboard**
2. **Get Live API keys** (start with `sk_live_...`)
3. **Update Cloudflare environment variables** with live keys
4. **Configure production webhook** pointing to your domain
5. **Create real products and prices**

See [STRIPE_SETUP.md](./STRIPE_SETUP.md) for complete deployment guide.

## Troubleshooting

### "Missing STRIPE_SECRET_KEY"

- Ensure `.env.local` exists and has `STRIPE_SECRET_KEY`
- Restart dev server after adding env vars

### "Webhook signature verification failed"

- Check `STRIPE_WEBHOOK_SECRET` is set correctly
- Ensure `stripe listen` is running
- Copy the signing secret from the `stripe listen` output

### "Credits not updating"

- Check webhook logs in terminal
- Ensure `credits_amount` metadata is set in checkout
- Verify RPC function with: `SELECT * FROM pg_proc WHERE proname = 'increment_credits';`

### "User not authenticated"

- Ensure user is logged in with Supabase Auth
- Check Authorization header is being sent

## Support

Need help? Check:

- [Full Setup Guide](./STRIPE_SETUP.md)
- [Stripe Docs](https://stripe.com/docs)
- [Supabase Docs](https://supabase.com/docs)
