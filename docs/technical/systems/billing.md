# Billing System

Subscription and credit management using Stripe.

## Overview

```mermaid
graph TD
    subgraph "User Actions"
        UPGRADE[Upgrade Plan]
        MANAGE[Manage Subscription]
        CANCEL[Cancel Plan]
    end

    subgraph "Stripe"
        CHECKOUT[Checkout Session]
        PORTAL[Customer Portal]
        WEBHOOKS[Webhooks]
    end

    subgraph "Application"
        CREDITS[Credit System]
        PROFILE[User Profile]
    end

    UPGRADE --> CHECKOUT
    MANAGE --> PORTAL
    CANCEL --> PORTAL

    CHECKOUT --> WEBHOOKS
    PORTAL --> WEBHOOKS

    WEBHOOKS --> CREDITS
    WEBHOOKS --> PROFILE
```

## Pricing Tiers

### Free Tier

| Feature        | Value            |
| -------------- | ---------------- |
| **Price**      | $0               |
| **Credits**    | 10 (one-time)    |
| **File Limit** | 5MB              |
| **Features**   | Basic processing |

### Credit Packs (One-Time Purchase)

| Pack           | Price  | Credits | Value        |
| -------------- | ------ | ------- | ------------ |
| **Starter**    | $9.99  | 100     | $0.10/credit |
| **Pro**        | $29.99 | 500     | $0.06/credit |
| **Enterprise** | $99.99 | 2,000   | $0.05/credit |

- Valid for 12 months from purchase
- No subscription required
- Best for occasional users

### Monthly Subscriptions

| Plan             | Price   | Credits/Month | Features                        |
| ---------------- | ------- | ------------- | ------------------------------- |
| **Hobby**        | $19/mo  | 200           | All features, email support     |
| **Professional** | $49/mo  | 1,000         | Priority support, early access  |
| **Business**     | $149/mo | 5,000         | 24/7 support, dedicated manager |

### Credit Rollover (Subscriptions Only)

- Unused credits roll over month-to-month
- Maximum rollover: 6x monthly allowance
- Example: Professional user can accumulate up to 6,000 credits
- Credits expire when subscription is canceled

## Checkout Flow

```mermaid
sequenceDiagram
    participant User
    participant App
    participant Stripe
    participant Webhook
    participant DB

    User->>App: Click "Upgrade to Pro"
    App->>Stripe: Create Checkout Session
    Stripe-->>App: Session URL

    App-->>User: Redirect to Stripe

    User->>Stripe: Enter payment details
    Stripe->>Stripe: Process payment

    alt Payment Success
        Stripe-->>User: Redirect to success URL
        Stripe->>Webhook: checkout.session.completed
        Webhook->>DB: Update profile
        Webhook->>DB: Add credits
        Webhook->>DB: Create subscription record
    end

    alt Payment Failed
        Stripe-->>User: Show error
        User->>Stripe: Retry payment
    end
```

## Webhook Events

```mermaid
flowchart TD
    EVENT[Stripe Webhook] --> VERIFY{Verify Signature}

    VERIFY -->|Invalid| REJECT[401 Unauthorized]
    VERIFY -->|Valid| TYPE{Event Type}

    TYPE -->|checkout.session.completed| CHECKOUT[Handle Checkout]
    TYPE -->|invoice.payment_succeeded| INVOICE[Handle Invoice]
    TYPE -->|customer.subscription.updated| UPDATE[Update Subscription]
    TYPE -->|customer.subscription.deleted| DELETE[Cancel Subscription]

    CHECKOUT --> ADD_CREDITS[Add Credits]
    CHECKOUT --> CREATE_SUB[Create Subscription]

    INVOICE --> RENEW_CREDITS[Renew Credits]

    UPDATE --> UPDATE_TIER[Update Tier/Status]

    DELETE --> CANCEL[Mark Canceled]
```

### Handled Events

| Event                           | Action                                   |
| ------------------------------- | ---------------------------------------- |
| `checkout.session.completed`    | Create subscription, add initial credits |
| `invoice.payment_succeeded`     | Renew monthly credits                    |
| `customer.subscription.updated` | Update tier, status changes              |
| `customer.subscription.deleted` | Mark subscription as canceled            |
| `invoice.payment_failed`        | Mark as past_due, send notification      |

## Webhook Handler

```typescript
// api/webhooks/stripe/route.ts
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature')!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    return new Response('Invalid signature', { status: 401 });
  }

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutComplete(event.data.object);
      break;
    case 'invoice.payment_succeeded':
      await handleInvoicePaid(event.data.object);
      break;
    case 'customer.subscription.updated':
      await handleSubscriptionUpdate(event.data.object);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object);
      break;
  }

  return new Response('OK', { status: 200 });
}
```

## Credit Management

### Credit Allocation

```mermaid
flowchart TD
    EVENT[Payment Event] --> TYPE{Event Type}

    TYPE -->|New Subscription| INITIAL[Add Full Monthly Credits]
    TYPE -->|Renewal| RENEW{Check Rollover}

    RENEW --> CALC[Current + New ≤ Max Rollover?]
    CALC -->|Yes| ADD_ALL[Add Full Credits]
    CALC -->|No| ADD_CAP[Add Up to Cap]

    ADD_ALL --> LOG[Log Transaction]
    ADD_CAP --> LOG
    INITIAL --> LOG
```

### Credit Deduction

```typescript
async function deductCredits(userId: string, amount: number) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('credits_balance')
    .eq('id', userId)
    .single();

  if (profile.credits_balance < amount) {
    throw new Error('INSUFFICIENT_CREDITS');
  }

  // Atomic deduction
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      credits_balance: profile.credits_balance - amount,
    })
    .eq('id', userId)
    .eq('credits_balance', profile.credits_balance); // Optimistic lock

  if (updateError) {
    throw new Error('DEDUCTION_FAILED');
  }

  // Log transaction
  await supabase.from('credit_transactions').insert({
    user_id: userId,
    amount: -amount,
    type: 'usage',
    description: 'Image processing',
  });
}
```

## Customer Portal

Users can manage their subscription through Stripe's hosted portal:

```mermaid
flowchart LR
    USER[User] --> PORTAL_BTN[Click Manage Billing]
    PORTAL_BTN --> API[Create Portal Session]
    API --> STRIPE[Stripe Portal]

    subgraph "Portal Actions"
        VIEW[View Invoices]
        UPDATE[Update Payment]
        CHANGE[Change Plan]
        CANCEL[Cancel Subscription]
    end

    STRIPE --> VIEW
    STRIPE --> UPDATE
    STRIPE --> CHANGE
    STRIPE --> CANCEL
```

### Portal Session Creation

```typescript
// api/billing/portal/route.ts
export async function POST(request: Request) {
  const user = await getUser(request);

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single();

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
  });

  return Response.json({ portalUrl: session.url });
}
```

## Subscription States

```mermaid
stateDiagram-v2
    [*] --> free: Signup

    free --> active: Subscribe
    free --> trialing: Start Trial

    trialing --> active: Trial Ends + Payment
    trialing --> canceled: No Payment

    active --> past_due: Payment Failed
    active --> canceled: User Cancels

    past_due --> active: Payment Succeeds
    past_due --> canceled: Grace Period Ends

    canceled --> active: Resubscribe
    canceled --> [*]: Account Deletion
```

## Database Schema

```sql
-- Subscriptions table
CREATE TABLE subscriptions (
    id TEXT PRIMARY KEY,                    -- Stripe subscription ID
    user_id UUID REFERENCES profiles(id),
    status TEXT NOT NULL,                   -- active, past_due, canceled, etc.
    price_id TEXT NOT NULL,                 -- Stripe price ID
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    canceled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Credit transactions
CREATE TABLE credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id),
    amount INTEGER NOT NULL,                -- Positive or negative
    type TEXT NOT NULL,                     -- purchase, subscription, usage, refund
    reference_id TEXT,                      -- Stripe ID or job ID
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Security

### Webhook Verification

```typescript
// Always verify Stripe signatures
const isValidSignature = (payload: string, signature: string): boolean => {
  try {
    stripe.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET!);
    return true;
  } catch {
    return false;
  }
};
```

### Price Validation

```typescript
// Only allow known price IDs
const VALID_PRICES = ['price_starter_monthly', 'price_pro_monthly', 'price_business_monthly'];

const isValidPrice = (priceId: string): boolean => {
  return VALID_PRICES.includes(priceId);
};
```

## Error Handling

| Scenario          | Action                         |
| ----------------- | ------------------------------ |
| Payment fails     | Mark as `past_due`, send email |
| Card expired      | Notify user, retry in 3 days   |
| Webhook timeout   | Stripe auto-retries            |
| Duplicate webhook | Idempotent handlers            |
| Invalid price     | Reject checkout                |
