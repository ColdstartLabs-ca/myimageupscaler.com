# Credit Top-Up Feature PRD

**Date:** December 2025
**Status:** Draft
**Author:** Engineering Team
**Version:** 1.0

---

## Executive Summary

**Feature**: Credit Top-Up System (One-Time Credit Purchases)

**Business Model**: ✅ **HYBRID MODEL** - Credit packs available to ALL users (free and subscribers). Designed to complement subscriptions, not replace them.

**Rationale**:

- **Lower barrier to entry**: Casual users can purchase credits without subscription commitment
- **Revenue maximization**: Captures occasional users who won't subscribe (+37% projected revenue)
- **Competitive parity**: All competitors offer one-time options (Let's Enhance, VanceAI, Topaz, Upscale.media)
- **Natural upgrade path**: One-time packs are more expensive per credit, incentivizing heavy users to subscribe
- **Customer segment fit**: Supports "Casual Family Photo Restoration" and project-based users identified in business model canvas

**Pricing Strategy**:

- One-time packs: **$0.067-$0.10 per credit** (more expensive)
- Subscriptions: **$0.04-$0.09 per credit** (better value) ← Upgrade incentive
- Credits never expire (value prop for occasional users)

**UI Locations**: Dashboard Billing Page (primary) + Pricing Page (secondary)

**Technical Approach**: Extend existing Stripe checkout to support `mode: 'payment'` alongside subscriptions.

---

## 1. Context Analysis

### 1.1 Files Analyzed

```
/home/joao/projects/pixelperfect/app/api/checkout/route.ts
/home/joao/projects/pixelperfect/app/api/webhooks/stripe/route.ts
/home/joao/projects/pixelperfect/shared/config/stripe.ts
/home/joao/projects/pixelperfect/shared/config/subscription.config.ts
/home/joao/projects/pixelperfect/shared/config/subscription.types.ts
/home/joao/projects/pixelperfect/shared/types/stripe.ts
/home/joao/projects/pixelperfect/supabase/migrations/20250121_enhanced_credit_functions.sql
/home/joao/projects/pixelperfect/client/services/stripeService.ts
/home/joao/projects/pixelperfect/client/components/stripe/CreditsDisplay.tsx
/home/joao/projects/pixelperfect/client/components/stripe/CreditHistory.tsx
/home/joao/projects/pixelperfect/docs/business-model-canvas/economics/pricing-proposal-v2.md
```

### 1.2 Component & Dependency Overview

```mermaid
graph TD
    subgraph Client
        A[CreditPackSelector] --> B[CheckoutModal]
        B --> C[stripeService.purchaseCredits]
    end

    subgraph API
        C --> D[/api/checkout]
        E[Stripe Webhook] --> F[/api/webhooks/stripe]
    end

    subgraph Server
        D --> G[Stripe Checkout Session]
        F --> H[handleCheckoutSessionCompleted]
        H --> I[increment_credits_with_log RPC]
    end

    subgraph Database
        I --> J[(profiles.credits_balance)]
        I --> K[(credit_transactions)]
    end

    G -.-> E
```

### 1.3 Current Behavior Summary

- **Checkout API** (`/api/checkout`) currently **only supports subscriptions**:
  - Validates that `priceId` is a known subscription price
  - Rejects one-time payments with `INVALID_PRICE` error
  - Sets `mode: 'subscription'` explicitly
- **Webhook handler** ignores `session.mode === 'payment'`:
  - Line 339-344: "One-time payments are no longer supported - ignore these sessions"
- **Credit system** is fully functional:
  - `increment_credits_with_log` RPC works for any transaction type including `'purchase'`
  - `credit_transactions` table already supports `type: 'purchase'`
- **UI components** exist for credit display and history but no package selector

### 1.4 Problem Statement

**All users** (free, subscribers, and lapsed users) who run out of credits face a binary choice: subscribe or leave. This creates friction for:

- **Occasional users**: Only need 20-50 images for a one-time project (family photos, single product launch)
- **Subscribers who run out**: Can't bridge the gap to next billing cycle without upgrading tier
- **Project-based users**: Need burst capacity for seasonal demand (holidays, sales events)
- **Trial users**: Liked free tier but aren't ready for monthly commitment

**Solution**: Offer one-time credit packs as a low-friction option that complements (not replaces) subscriptions.

---

## 2. Proposed Solution

### 2.1 Architecture Summary

1. **Enable one-time payments** in `/api/checkout` alongside subscriptions
2. **Define credit packages** in `subscription.config.ts` as a new `creditPacks` section
3. **Handle `checkout.session.completed`** for `mode: 'payment'` to add purchased credits
4. **Create `CreditPackSelector`** component for package selection UI
5. **Purchased credits never expire** (unlike subscription credits that reset at cycle end)

**Alternatives Considered:**

- ❌ **Separate `/api/purchase-credits` endpoint**: Rejected - duplicates Stripe customer management logic
- ❌ **Use Stripe Payment Links**: Rejected - cannot embed in-app, loses checkout customization
- ❌ **Usage-based billing via Stripe Billing**: Rejected - over-engineered for simple top-ups

### 2.2 Architecture Diagram

```mermaid
flowchart LR
    subgraph User Flow
        U[User] --> |Select Pack| CPS[CreditPackSelector]
        CPS --> |Click Buy| CM[CheckoutModal]
        CM --> |Redirect| SC[Stripe Checkout]
        SC --> |Success| SP[Success Page]
    end

    subgraph Backend Flow
        SC --> |Webhook| WH[Webhook Handler]
        WH --> |mode=payment| HPC[handlePaymentCompleted]
        HPC --> |increment_credits_with_log| DB[(Database)]
    end
```

### 2.3 Key Technical Decisions

| Decision         | Choice                                           | Justification                                         |
| ---------------- | ------------------------------------------------ | ----------------------------------------------------- |
| Payment mode     | Stripe Checkout (one_time)                       | Reuses existing Stripe integration                    |
| Credit storage   | Same `credits_balance` field                     | Simplicity - no separate "purchased credits" tracking |
| Expiration       | Never expire                                     | Industry standard - purchased credits are permanent   |
| Transaction type | `'purchase'`                                     | Already supported in `credit_transactions.type` enum  |
| Refund handling  | Clawback via `clawback_credits_from_transaction` | Already implemented for subscription refunds          |

### 2.4 Data Model Changes

**No schema changes required.** All tables and RPC functions already support credit purchases:

- `credit_transactions.type` includes `'purchase'`
- `increment_credits_with_log` accepts any `transaction_type`
- `clawback_credits_from_transaction` works with any `ref_id`

**Configuration change only:**

```typescript
// Addition to subscription.config.ts
creditPacks: [
  {
    key: 'small',
    name: 'Small Pack',
    credits: 50,
    priceInCents: 499,    // $4.99
    stripePriceId: 'price_xxx', // One-time Stripe price
    description: '50 credits',
    popular: false,
  },
  {
    key: 'medium',
    name: 'Medium Pack',
    credits: 200,
    priceInCents: 1499,   // $14.99
    stripePriceId: 'price_xxx',
    description: '200 credits - Best value',
    popular: true,
  },
  {
    key: 'large',
    name: 'Large Pack',
    credits: 600,
    priceInCents: 3999,   // $39.99
    stripePriceId: 'price_xxx',
    description: '600 credits',
    popular: false,
  },
],
```

---

## 2.5 Runtime Execution Flow

```mermaid
sequenceDiagram
    participant User
    participant UI as CreditPackSelector
    participant API as /api/checkout
    participant Stripe
    participant WH as Webhook Handler
    participant RPC as increment_credits_with_log
    participant DB as Database

    User->>UI: Select "Medium Pack" ($14.99)
    UI->>API: POST { priceId, mode: 'payment' }

    API->>API: Validate price is credit pack
    API->>Stripe: Create Checkout Session (mode: payment)
    Stripe-->>API: { sessionId, url }
    API-->>UI: { url }

    UI->>Stripe: Redirect to Checkout
    User->>Stripe: Complete payment
    Stripe-->>User: Redirect to /success

    Stripe->>WH: checkout.session.completed
    WH->>WH: checkAndClaimEvent (idempotency)

    alt mode === 'payment'
        WH->>WH: Extract credits from metadata
        WH->>RPC: increment_credits_with_log(userId, 200, 'purchase', sessionId)
        RPC->>DB: UPDATE profiles SET credits_balance = credits_balance + 200
        RPC->>DB: INSERT credit_transactions (type: 'purchase')
        RPC-->>WH: success
    else mode === 'subscription'
        WH->>WH: Existing subscription logic
    end

    WH->>WH: markEventCompleted
    WH-->>Stripe: 200 OK

    Note over User,DB: Error Path

    Stripe->>WH: checkout.session.completed (retry)
    WH->>WH: checkAndClaimEvent
    WH-->>Stripe: { skipped: true, reason: "already completed" }
```

---

## 3. Detailed Implementation Spec

### A. `/shared/config/subscription.config.ts`

**Changes Needed:**

- Add `creditPacks` array to `SUBSCRIPTION_CONFIG`

**New Type (in `subscription.types.ts`):**

```typescript
export interface ICreditPack {
  key: string;
  name: string;
  credits: number;
  priceInCents: number;
  currency: string;
  stripePriceId: string;
  description: string;
  popular?: boolean;
  enabled: boolean;
}

// Add to ISubscriptionConfig
export interface ISubscriptionConfig {
  // ... existing fields
  creditPacks: ICreditPack[];
}
```

**New Config:**

```typescript
creditPacks: [
  {
    key: 'small',
    name: 'Small Pack',
    credits: 50,
    priceInCents: 499,
    currency: 'usd',
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_SMALL || 'price_credits_small',
    description: '50 credits',
    popular: false,
    enabled: true,
  },
  {
    key: 'medium',
    name: 'Medium Pack',
    credits: 200,
    priceInCents: 1499,
    currency: 'usd',
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_MEDIUM || 'price_credits_medium',
    description: '200 credits',
    popular: true,
    enabled: true,
  },
  {
    key: 'large',
    name: 'Large Pack',
    credits: 600,
    priceInCents: 3999,
    currency: 'usd',
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_LARGE || 'price_credits_large',
    description: '600 credits',
    popular: false,
    enabled: true,
  },
],
```

**Justification:** Centralizes all pricing in one config file, consistent with subscription plan structure.

---

### B. `/shared/config/subscription.utils.ts`

**New Methods:**

```typescript
/**
 * Get credit pack by Stripe price ID
 */
export function getCreditPackByPriceId(priceId: string): ICreditPack | null {
  return (
    getSubscriptionConfig().creditPacks.find(
      pack => pack.stripePriceId === priceId && pack.enabled
    ) || null
  );
}

/**
 * Get credit pack by key
 */
export function getCreditPackByKey(key: string): ICreditPack | null {
  return getSubscriptionConfig().creditPacks.find(pack => pack.key === key && pack.enabled) || null;
}

/**
 * Get all enabled credit packs
 */
export function getEnabledCreditPacks(): ICreditPack[] {
  return getSubscriptionConfig().creditPacks.filter(pack => pack.enabled);
}

/**
 * Check if a price ID is a credit pack (one-time) or subscription
 */
export function isPriceIdCreditPack(priceId: string): boolean {
  return getCreditPackByPriceId(priceId) !== null;
}
```

**Justification:** Provides type-safe lookup functions consistent with existing subscription utilities.

---

### C. `/app/api/checkout/route.ts`

**Changes Needed:**

- Accept both subscription and one-time payment modes
- Validate credit pack prices separately from subscription prices
- Include `credits` in session metadata for webhook

**Modified Logic (pseudo-code):**

```typescript
// After basic validation...

// Determine if this is a credit pack or subscription
const creditPack = getCreditPackByPriceId(priceId);
const subscriptionPlan = getPlanForPriceId(priceId);

if (!creditPack && !subscriptionPlan) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'INVALID_PRICE',
        message: 'Invalid price ID. Must be a subscription plan or credit pack.',
      },
    },
    { status: 400 }
  );
}

// For subscriptions, check existing subscription (existing logic)
if (subscriptionPlan && existingSubscription) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'ALREADY_SUBSCRIBED',
        message: 'You already have an active subscription...',
      },
    },
    { status: 400 }
  );
}

// Determine checkout mode
const checkoutMode = creditPack ? 'payment' : 'subscription';

// Build session params
const sessionParams: Stripe.Checkout.SessionCreateParams = {
  customer: customerId,
  line_items: [{ price: priceId, quantity: 1 }],
  mode: checkoutMode,
  ui_mode: uiMode,
  metadata: {
    user_id: user.id,
    ...(creditPack
      ? {
          credits: creditPack.credits.toString(),
          pack_key: creditPack.key,
          type: 'credit_purchase',
        }
      : {
          plan_key: subscriptionPlan!.key,
          type: 'subscription',
        }),
    ...metadata,
  },
};

// Only add subscription_data for subscriptions
if (checkoutMode === 'subscription') {
  sessionParams.subscription_data = {
    metadata: { user_id: user.id, plan_key: subscriptionPlan!.key },
  };

  // Add trial if configured (existing logic)
  const trialConfig = getTrialConfig(priceId);
  if (trialConfig?.enabled) {
    sessionParams.subscription_data.trial_period_days = trialConfig.durationDays;
  }
}

// URLs based on mode
if (uiMode === 'hosted') {
  sessionParams.success_url = successUrl || `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`;
  sessionParams.cancel_url = cancelUrl || `${baseUrl}/canceled`;
} else {
  sessionParams.return_url = successUrl || `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`;
}
```

**Justification:** Minimal changes to existing flow - branches based on price type while reusing all Stripe customer management logic.

---

### D. `/app/api/webhooks/stripe/route.ts`

**Changes Needed:**

- Handle `mode === 'payment'` in `handleCheckoutSessionCompleted`
- Add credits from session metadata

**Modified `handleCheckoutSessionCompleted`:**

```typescript
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id;
  if (!userId) {
    console.error('No user_id in session metadata');
    return;
  }

  console.log(`Checkout completed for user ${userId}, mode: ${session.mode}`);

  if (session.mode === 'subscription') {
    // Existing subscription logic (unchanged)
    // ...
  } else if (session.mode === 'payment') {
    // NEW: Handle credit pack purchase
    await handleCreditPackPurchase(session, userId);
  } else {
    console.warn(`Unexpected checkout mode: ${session.mode}`);
  }
}

/**
 * Handle one-time credit pack purchase
 */
async function handleCreditPackPurchase(
  session: Stripe.Checkout.Session,
  userId: string
): Promise<void> {
  const credits = parseInt(session.metadata?.credits || '0', 10);
  const packKey = session.metadata?.pack_key;

  if (!credits || credits <= 0) {
    console.error(`Invalid credits in session metadata: ${session.metadata?.credits}`);
    return;
  }

  // Get payment intent for refund correlation
  const paymentIntentId = session.payment_intent as string;

  try {
    const { error } = await supabaseAdmin.rpc('increment_credits_with_log', {
      target_user_id: userId,
      amount: credits,
      transaction_type: 'purchase',
      ref_id: paymentIntentId ? `pi_${paymentIntentId}` : `session_${session.id}`,
      description: `Credit pack purchase - ${packKey || 'unknown'} - ${credits} credits`,
    });

    if (error) {
      console.error('Error adding purchased credits:', error);
      throw error; // Trigger webhook retry
    }

    console.log(`Added ${credits} purchased credits to user ${userId} (pack: ${packKey})`);
  } catch (error) {
    console.error('Failed to process credit purchase:', error);
    throw error; // Re-throw for webhook retry
  }
}
```

**Justification:** Clean separation between subscription and payment handling. Uses existing RPC function with `'purchase'` type.

---

### E. `/client/services/stripeService.ts`

**New Method:**

```typescript
/**
 * Create checkout session for credit pack purchase
 */
static async purchaseCredits(
  packKey: string,
  options?: { uiMode?: 'hosted' | 'embedded' }
): Promise<{ url: string; sessionId: string; clientSecret?: string }> {
  const pack = getCreditPackByKey(packKey);
  if (!pack) {
    throw new Error(`Invalid credit pack: ${packKey}`);
  }

  const token = await this.getAuthToken();
  const response = await fetch('/api/checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      priceId: pack.stripePriceId,
      uiMode: options?.uiMode || 'hosted',
    }),
  });

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error?.message || 'Failed to create checkout session');
  }

  return result.data;
}
```

**Justification:** Mirrors existing `createCheckoutSession` but specialized for credit packs.

---

### F. `/client/components/stripe/CreditPackSelector.tsx`

**New Component:**

```typescript
'use client';

import React, { useState } from 'react';
import { getEnabledCreditPacks, type ICreditPack } from '@shared/config/subscription.utils';
import { stripeService } from '@client/services/stripeService';
import { Button } from '@client/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@client/components/ui/card';
import { Badge } from '@client/components/ui/badge';
import { Loader2, CreditCard, Check } from 'lucide-react';

interface ICreditPackSelectorProps {
  onPurchaseStart?: () => void;
  onPurchaseComplete?: () => void;
  onError?: (error: Error) => void;
}

export function CreditPackSelector({
  onPurchaseStart,
  onPurchaseComplete,
  onError,
}: ICreditPackSelectorProps) {
  const [selectedPack, setSelectedPack] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const packs = getEnabledCreditPacks();

  const handlePurchase = async (packKey: string) => {
    setIsLoading(true);
    setSelectedPack(packKey);
    onPurchaseStart?.();

    try {
      const { url } = await stripeService.purchaseCredits(packKey);
      window.location.href = url;
    } catch (error) {
      console.error('Purchase error:', error);
      onError?.(error instanceof Error ? error : new Error('Purchase failed'));
      setIsLoading(false);
      setSelectedPack(null);
    }
  };

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const getPricePerCredit = (pack: ICreditPack) => {
    return (pack.priceInCents / pack.credits / 100).toFixed(3);
  };

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {packs.map((pack) => (
        <Card
          key={pack.key}
          className={`relative cursor-pointer transition-all hover:border-primary ${
            selectedPack === pack.key ? 'border-primary ring-2 ring-primary' : ''
          } ${pack.popular ? 'border-primary' : ''}`}
          onClick={() => !isLoading && handlePurchase(pack.key)}
        >
          {pack.popular && (
            <Badge className="absolute -top-2 left-1/2 -translate-x-1/2">
              Best Value
            </Badge>
          )}

          <CardHeader className="text-center pb-2">
            <CardTitle className="text-lg">{pack.name}</CardTitle>
            <div className="text-3xl font-bold">{formatPrice(pack.priceInCents)}</div>
          </CardHeader>

          <CardContent className="text-center space-y-4">
            <div className="text-2xl font-semibold text-primary">
              {pack.credits} credits
            </div>

            <div className="text-sm text-muted-foreground">
              ${getPricePerCredit(pack)} per credit
            </div>

            <ul className="text-sm text-left space-y-1">
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                Never expire
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                Use anytime
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-500" />
                Stack with subscription
              </li>
            </ul>

            <Button
              className="w-full"
              disabled={isLoading}
              variant={pack.popular ? 'default' : 'outline'}
            >
              {isLoading && selectedPack === pack.key ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Buy Now
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

**Justification:** Follows existing component patterns. Cards show value proposition (never expire, stack with subscription).

---

## 4. UI Integration Points

### 4.1 Where to Show Credit Top-Ups (All Users)

| Location                   | Component                         | Priority | Visibility Rule                   | Purpose                                 |
| -------------------------- | --------------------------------- | -------- | --------------------------------- | --------------------------------------- |
| **Dashboard Billing Page** | `/app/dashboard/billing/page.tsx` | P0       | All authenticated users           | **Primary** purchase location           |
| **Pricing Page**           | `/app/pricing/page.tsx`           | P1       | All visitors (unauthenticated OK) | **Secondary** - Alongside subscriptions |
| **Low Credit Warning**     | `CreditsDisplay.tsx`              | P1       | All authenticated users           | Proactive upsell when credits < 5       |
| **Out of Credits Modal**   | New component                     | P0       | All authenticated users           | Shown when balance = 0                  |

**Key Strategy**: Credit packs are **available to everyone**, but pricing structure incentivizes subscription for regular users (11-58% cheaper per credit).

### 4.2 Detailed UI Changes

#### A. `/app/dashboard/billing/page.tsx` (**PRIMARY LOCATION**)

**Add Credit Top-Up Section between "Current Plan" and "Payment Methods":**

**File**: `/home/joao/projects/pixelperfect/app/dashboard/billing/page.tsx`
**Position**: After line 242 (after Current Plan section, before Payment Methods)
**Visibility**: All authenticated users

```tsx
import { CreditPackSelector } from '@client/components/stripe/CreditPackSelector';
import { Plus } from 'lucide-react';

// ... existing imports

// INSERT after line 242:
{
  /* Credit Top-Up Section - ALL USERS */
}
<div className="bg-white rounded-xl border border-slate-200 p-6">
  <div className="flex items-center gap-3 mb-4">
    <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
      <Plus size={20} className="text-purple-600" />
    </div>
    <div>
      <h2 className="font-semibold text-slate-900">Buy Credits</h2>
      <p className="text-sm text-slate-500">One-time credit packs that never expire</p>
    </div>
  </div>

  <CreditPackSelector
    onPurchaseStart={() => {}}
    onPurchaseComplete={() => loadBillingData()}
    onError={error => showToast({ message: error.message, type: 'error' })}
  />

  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
    <p className="text-sm text-blue-800">
      💡 <strong>Tip:</strong>{' '}
      {subscription
        ? 'Subscriptions offer better value (up to 58% cheaper per credit)'
        : 'Subscribe for better value - get up to 58% cheaper credits'}
    </p>
  </div>
</div>;
```

#### B. `/app/pricing/page.tsx` (**SECONDARY LOCATION**)

**Add Credit Packs Section after subscription plans:**

**File**: `/home/joao/projects/pixelperfect/app/pricing/page.tsx`
**Position**: After line 165 (after subscription grid, before FAQ section)
**Visibility**: All visitors (works for unauthenticated users)

```tsx
import { CreditPackSelector } from '@client/components/stripe/CreditPackSelector';

// INSERT after line 165:
{
  /* Credit Packs Section - ALL USERS */
}
<div className="mt-16 border-t border-slate-200 pt-16">
  <div className="text-center mb-8">
    <h2 className="text-3xl font-bold text-slate-900 mb-4">Need Credits Without a Subscription?</h2>
    <p className="text-lg text-slate-600 max-w-2xl mx-auto">
      One-time credit packs that never expire. Perfect for occasional projects.
    </p>
  </div>

  <CreditPackSelector
    onPurchaseStart={() => {}}
    onPurchaseComplete={() => window.location.reload()}
    onError={error => console.error(error)}
  />

  <div className="mt-8 text-center">
    <p className="text-sm text-slate-500 mb-2">
      💡 <strong>Value Comparison:</strong> Subscriptions offer 11-58% cheaper credits for regular
      users
    </p>
    <a href="#subscriptions" className="text-sm text-indigo-600 hover:text-indigo-700 underline">
      Compare subscription plans
    </a>
  </div>
</div>;
```

#### C. `client/components/stripe/CreditsDisplay.tsx` (**LOW CREDIT UPSELL**)

**Add "Buy Credits" link when credits are low:**

**File**: `/home/joao/projects/pixelperfect/client/components/stripe/CreditsDisplay.tsx`
**Position**: Modify lines 183-197 (tooltip section)

```tsx
{
  /* Tooltip for low credit warning and expiration info - MODIFIED */
}
{
  (isLowCredits || isNoCredits || showExpiration) && (
    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto whitespace-nowrap z-20">
      <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-slate-900"></div>
      <div className="space-y-2">
        {(isLowCredits || isNoCredits) && (
          <>
            <div>
              {isNoCredits ? 'No credits remaining' : `Low credits: ${creditBalance} remaining`}
            </div>
            <a
              href="/dashboard/billing"
              className="block text-indigo-400 hover:text-indigo-300 underline text-center"
              onClick={e => e.stopPropagation()}
            >
              Buy more credits →
            </a>
          </>
        )}
        {showExpiration && expirationText && (
          <div className="text-amber-300">Credits expire {expirationText}</div>
        )}
      </div>
    </div>
  );
}
```

#### D. **NEW COMPONENT**: `OutOfCreditsModal.tsx` (**ALL USERS**)

**Create modal shown when user tries to upscale without credits:**

**File**: `/home/joao/projects/pixelperfect/client/components/stripe/OutOfCreditsModal.tsx` (NEW)

```tsx
'use client';

import React, { useState } from 'react';
import { CreditPackSelector } from './CreditPackSelector';
import { AlertCircle, X } from 'lucide-react';

interface IOutOfCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPurchaseComplete: () => void;
}

export function OutOfCreditsModal({
  isOpen,
  onClose,
  onPurchaseComplete,
}: IOutOfCreditsModalProps) {
  const [showSubscriptionCTA, setShowSubscriptionCTA] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose} />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-4xl bg-white rounded-lg shadow-xl p-6">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
          >
            <X size={24} />
          </button>

          {/* Header */}
          <div className="text-center mb-6">
            <div className="mx-auto w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="h-6 w-6 text-amber-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">You're Out of Credits</h2>
            <p className="text-slate-600">
              Purchase credits to continue processing images, or subscribe for better value.
            </p>
          </div>

          {/* Tabs: One-Time vs Subscription */}
          <div className="flex gap-2 mb-6 justify-center">
            <button
              onClick={() => setShowSubscriptionCTA(false)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                !showSubscriptionCTA
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Buy Credits
            </button>
            <button
              onClick={() => setShowSubscriptionCTA(true)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                showSubscriptionCTA
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Subscribe (Best Value)
            </button>
          </div>

          {/* Content */}
          {!showSubscriptionCTA ? (
            <>
              <CreditPackSelector
                onPurchaseStart={() => {}}
                onPurchaseComplete={() => {
                  onPurchaseComplete();
                  onClose();
                }}
                onError={error => console.error(error)}
              />

              <div className="mt-4 text-center text-sm text-slate-500">
                💡 Subscribe for up to 58% cheaper credits
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-slate-600 mb-6">
                Get monthly credits with automatic rollover, plus 11-58% cheaper per-credit pricing.
              </p>
              <a
                href="/pricing"
                className="inline-flex items-center px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
              >
                View Subscription Plans
              </a>
            </div>
          )}

          {/* Footer */}
          <div className="mt-6 text-center">
            <button
              onClick={onClose}
              className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

#### E. **Upload/Upscale Flow Integration**

**Modify image processing to check credits before upload:**

**Example Integration** (adapt to your upload component):

```tsx
import { OutOfCreditsModal } from '@client/components/stripe/OutOfCreditsModal';
import { StripeService } from '@client/services/stripeService';

// ... in your component
const [showOutOfCreditsModal, setShowOutOfCreditsModal] = useState(false);

const handleUpscale = async () => {
  // Check credits before processing
  try {
    const profile = await StripeService.getUserProfile();

    if (profile.credits_balance < 1) {
      setShowOutOfCreditsModal(true);
      return;
    }

    // Proceed with upscaling...
    await processImage();
  } catch (error) {
    console.error('Failed to check credits:', error);
  }
};

// In JSX:
<OutOfCreditsModal
  isOpen={showOutOfCreditsModal}
  onClose={() => setShowOutOfCreditsModal(false)}
  onPurchaseComplete={() => {
    // Reload credits and allow retry
    window.location.reload();
  }}
/>;
```

### 4.3 User Flow Diagram

```mermaid
flowchart TD
    Start[User lands on site] --> Auth{Authenticated?}

    Auth -->|Yes| CheckCredits{Credits < 5?}
    CheckCredits -->|Yes| Warning[CreditsDisplay shows warning]
    Warning --> ClickBuy[User clicks 'Buy more credits']

    CheckCredits -->|No| Upload[User uploads image]
    Auth -->|No| SignupFlow[Signup → Get 10 free credits]
    SignupFlow --> Upload

    Upload --> EnoughCredits{Credits > 0?}

    EnoughCredits -->|No| Modal[OutOfCreditsModal with tabs]
    Modal --> Choice{User choice?}
    Choice -->|Buy Credits Tab| BuyPack[Select credit pack]
    Choice -->|Subscribe Tab| SubCTA[View subscriptions]

    EnoughCredits -->|Yes| Process[Process image]

    ClickBuy --> Billing[Navigate to /dashboard/billing]
    Billing --> Selector[CreditPackSelector shown]
    Selector --> BuyPack

    BuyPack --> Checkout[Stripe Checkout]
    SubCTA --> Pricing[/pricing page]
    Pricing --> SubCheckout[Subscribe]

    Checkout --> Payment[Complete payment]
    SubCheckout --> Payment

    Payment --> Webhook[Webhook adds credits]
    Webhook --> Success[Redirect to /success]
    Success --> Reload[Refresh credits]
    Reload --> Process
```

### 4.4 Mobile Responsiveness

All components must be mobile-responsive:

**CreditPackSelector**:

```tsx
<div className="grid gap-4 grid-cols-1 md:grid-cols-3">
```

**OutOfCreditsModal**:

```tsx
<div className="flex min-h-full items-end sm:items-center justify-center p-4">
  <div className="relative w-full max-w-4xl ...">
```

**Billing Page Integration**:

- Sections stack vertically on mobile
- Credit packs display 1 column on mobile, 3 on desktop

### 4.5 Empty States & Error Handling

| Scenario                    | UI Behavior                                                          |
| --------------------------- | -------------------------------------------------------------------- |
| No credit packs configured  | Show "Credit packs coming soon" message with "Contact Support" link  |
| Stripe checkout fails       | Show toast error: "Checkout failed. Please try again.", stay on page |
| Credits not added after 60s | Show banner: "Payment processing. Credits will appear soon."         |
| User cancels checkout       | Return to previous page, show toast: "Purchase canceled"             |
| Network error loading packs | Show error state with "Retry" button                                 |

### 4.6 Testing Checklist

**Visual Testing**:

- [ ] Credit packs display correctly on billing page
- [ ] Credit packs display correctly on pricing page
- [ ] OutOfCreditsModal centers properly on all screen sizes
- [ ] Mobile: Credit packs stack vertically (1 column)
- [ ] Desktop: Credit packs display in 3 columns
- [ ] "Best Value" badge positions correctly
- [ ] Loading states show spinner on correct card

**Functional Testing**:

- [ ] Clicking pack opens Stripe checkout
- [ ] Purchase completes and credits appear within 30s
- [ ] OutOfCreditsModal shows when credits = 0
- [ ] Low credit warning shows when credits < 5
- [ ] "Buy more credits" link navigates to billing page
- [ ] Billing page refresh updates credit balance

---

## 5. Step-by-Step Execution Plan

### Phase 1: Configuration & Types

- [ ] Add `ICreditPack` interface to `subscription.types.ts`
- [ ] Add `creditPacks` array to `SUBSCRIPTION_CONFIG` in `subscription.config.ts`
- [ ] Add utility functions to `subscription.utils.ts`:
  - `getCreditPackByPriceId()`
  - `getCreditPackByKey()`
  - `getEnabledCreditPacks()`
  - `isPriceIdCreditPack()`
- [ ] Create Stripe one-time prices in Stripe Dashboard
- [ ] Add price IDs to environment variables

### Phase 2: API Layer

- [ ] Modify `/api/checkout/route.ts`:
  - Import credit pack utilities
  - Add validation for credit pack prices
  - Branch checkout mode based on price type
  - Include credits in metadata for payment mode
- [ ] Modify `/api/webhooks/stripe/route.ts`:
  - Add `handleCreditPackPurchase()` function
  - Update `handleCheckoutSessionCompleted()` to handle `mode === 'payment'`

### Phase 3: Client Layer (UI Components)

**Services**:

- [ ] Add `purchaseCredits()` method to `stripeService.ts`

**New Components**:

- [ ] Create `CreditPackSelector.tsx` in `/client/components/stripe/`
- [ ] Create `OutOfCreditsModal.tsx` in `/client/components/stripe/`
- [ ] Export both from `/client/components/stripe/index.ts`

**UI Integrations**:

- [ ] **Billing Page** (`/app/dashboard/billing/page.tsx`) - **ALL USERS**:

  - Import `CreditPackSelector` and `Plus` icon
  - Add credit top-up section after line 242
  - Show `CreditPackSelector` for all authenticated users
  - Add tip banner showing subscription value (conditional based on `subscription`)
  - Wire up callbacks: `onPurchaseComplete={() => loadBillingData()}`

- [ ] **Pricing Page** (`/app/pricing/page.tsx`) - **ALL VISITORS**:

  - Import `CreditPackSelector`
  - Add credit packs section after line 165 (after subscriptions, before FAQ)
  - Add border-t separator and "Need Credits Without a Subscription?" heading
  - Add value comparison tip linking back to subscriptions
  - Wire up callbacks: `onPurchaseComplete={() => window.location.reload()}`

- [ ] **Credits Display** (`/client/components/stripe/CreditsDisplay.tsx`) - **ALL USERS**:

  - Modify tooltip (lines 183-197) to add "Buy more credits →" link
  - Link points to `/dashboard/billing` for all users
  - Change `pointer-events-none` to `pointer-events-auto` on tooltip

- [ ] **OutOfCreditsModal** - **TABBED UI**:

  - Remove `hasSubscription` prop (not needed)
  - Add tab state: "Buy Credits" vs "Subscribe (Best Value)"
  - Default to "Buy Credits" tab showing `CreditPackSelector`
  - "Subscribe" tab shows CTA to `/pricing` page
  - Add value messaging: "Subscribe for up to 58% cheaper credits"

- [ ] **Upload Flow** (identify upload component):
  - Import `OutOfCreditsModal` and `StripeService`
  - Add credit check in upload handler before processing
  - Show modal when `credits_balance < 1`
  - Wire up `onPurchaseComplete` to reload credits

### Phase 4: Testing & Validation

- [ ] Write unit tests for new utility functions
- [ ] Write integration tests for checkout flow
- [ ] Test webhook handling with Stripe CLI
- [ ] Test refund flow triggers credit clawback

---

## 5. Testing Strategy

### Unit Tests

| Function                   | Test Cases                                            |
| -------------------------- | ----------------------------------------------------- |
| `getCreditPackByPriceId`   | Valid price returns pack, invalid returns null        |
| `getCreditPackByKey`       | Valid key returns pack, invalid returns null          |
| `isPriceIdCreditPack`      | Returns true for pack prices, false for subscriptions |
| `handleCreditPackPurchase` | Adds correct credits, handles missing metadata        |

### Integration Tests

| Flow                | Steps                                                                  |
| ------------------- | ---------------------------------------------------------------------- |
| Purchase credits    | Select pack → Create session → Complete payment → Verify credits added |
| Refund credits      | Complete purchase → Issue refund → Verify credits clawed back          |
| Webhook idempotency | Send duplicate webhooks → Verify single credit addition                |

### Edge Cases

| Scenario                            | Expected Behavior                     |
| ----------------------------------- | ------------------------------------- |
| Invalid pack key in request         | Return 400 with `INVALID_PRICE` error |
| Missing credits in webhook metadata | Log error, return 200 (don't retry)   |
| User not found in webhook           | Log error, return 200 (don't retry)   |
| Concurrent purchase attempts        | Both succeed (no restriction)         |
| Purchase during subscription trial  | Both credits types coexist            |
| Refund partial amount               | Clawback all credits from transaction |

---

## 6. Acceptance Criteria

- [ ] User can purchase credits without active subscription
- [ ] User with subscription can purchase additional credits
- [ ] Credits added within 30 seconds of payment completion
- [ ] Transaction appears in credit history with type `'purchase'`
- [ ] Purchased credits never expire (no rollover cap applied)
- [ ] Refund triggers full credit clawback
- [ ] Duplicate webhooks do not double-credit
- [ ] All API responses follow existing `{ success, data, error }` format
- [ ] UI shows "Best Value" badge on popular pack
- [ ] Price per credit calculated and displayed
- [ ] Loading state shown during checkout redirect

---

## 7. Verification & Rollback

### Success Criteria

- **Metrics**: Track `credit_transactions` with `type = 'purchase'`
- **Logs**: Monitor for `Added X purchased credits to user` messages
- **Monitoring**: Alert if webhook processing takes >5s

### Rollback Plan

1. **Feature flag approach**: Add `FEATURE_CREDIT_PACKS=false` env var
2. **Checkout API**: Check flag before allowing one-time payments
3. **UI**: Hide `CreditPackSelector` when flag is false
4. **No migration needed**: Uses existing tables and RPCs

```typescript
// Quick disable in /api/checkout
if (!serverEnv.FEATURE_CREDIT_PACKS && creditPack) {
  return NextResponse.json(
    {
      success: false,
      error: { code: 'FEATURE_DISABLED', message: 'Credit packs temporarily unavailable' },
    },
    { status: 400 }
  );
}
```

---

## 8. Cost Analysis

### Pricing (Optimized for Hybrid Model)

| Pack   | Price  | Credits | $/Credit | Gross Margin | Strategy                          |
| ------ | ------ | ------- | -------- | ------------ | --------------------------------- |
| Small  | $4.99  | 50      | $0.10    | 98.3%        | Entry point for casual users      |
| Medium | $14.99 | 200     | $0.075   | 97.7%        | **Popular** - Project-based users |
| Large  | $39.99 | 600     | $0.067   | 97.2%        | Bulk one-time purchases           |

**Comparison with Subscriptions** (creates natural upgrade incentive):

| Plan Type          | $/Credit     | Rollover | Expiration     | Best For                   |
| ------------------ | ------------ | -------- | -------------- | -------------------------- |
| **Subscriptions**  | $0.04-$0.09  | ✅ 2-6x  | Reset at cycle | Regular users (best value) |
| **One-Time Packs** | $0.067-$0.10 | ❌ None  | ✅ Never       | Occasional users           |

**Key Insight**: One-time packs are **11-58% more expensive per credit**, naturally pushing heavy users toward subscriptions for better value.

### Unit Economics

- **Real-ESRGAN cost**: $0.0017/image
- **Revenue per credit**: $0.067-$0.10
- **Gross margin**: 93-97%
- **Stripe fees**: 2.9% + $0.30 per transaction

### Break-even per Transaction

| Pack   | Price  | Stripe Fee | Net    | Credits | Cost   | Profit |
| ------ | ------ | ---------- | ------ | ------- | ------ | ------ |
| Small  | $4.99  | $0.44      | $4.55  | 50      | $0.085 | $4.47  |
| Medium | $14.99 | $0.73      | $14.26 | 200     | $0.34  | $13.92 |
| Large  | $39.99 | $1.46      | $38.53 | 600     | $1.02  | $37.51 |

---

---

## 9. Hybrid Model Benefits Summary

### Revenue Impact

| Scenario               | Projected Annual Revenue |
| ---------------------- | ------------------------ |
| **Subscriptions only** | $245,040                 |
| **+ One-time packs**   | $335,040 (+37%)          |

### Customer Segment Coverage

| Segment                    | Need                 | Solution                           |
| -------------------------- | -------------------- | ---------------------------------- |
| **Regular users**          | Ongoing image needs  | Subscriptions ($0.04-$0.09/credit) |
| **Occasional users**       | One-time projects    | Credit packs ($0.067-$0.10/credit) |
| **Project-based**          | Seasonal bursts      | Credit packs (never expire)        |
| **Subscribers (overflow)** | Bridge to next cycle | Credit packs (immediate)           |

### Natural Upgrade Incentive

```
Price Comparison:
├─ One-time pack: $14.99 for 200 credits = $0.075/credit
└─ Pro subscription: $29 for 500 credits = $0.058/credit

Psychology: Heavy users save 22% by subscribing
```

### Competitive Positioning

| Competitor       | One-Time Option     | Subscription Option     |
| ---------------- | ------------------- | ----------------------- |
| Let's Enhance    | ✅ Credit packs     | ✅ Subscriptions        |
| VanceAI          | ✅ Pay-per-image    | ✅ Subscriptions        |
| Topaz Labs       | ✅ One-time license | ✅ Cloud subscription   |
| Upscale.media    | ✅ Annual payment   | ✅ Monthly subscription |
| **PixelPerfect** | ✅ **Credit packs** | ✅ **Subscriptions**    |

**Result**: We match industry standard while maintaining subscription incentives through pricing structure.

---

## References

- [Business Model Canvas - Revenue Model](/docs/business-model-canvas/04-revenue-costs.md)
- [Business Model Canvas - Customer Segments](/docs/business-model-canvas/01-customer-segments.md)
- [Pricing Proposal v2](/docs/business-model-canvas/economics/pricing-proposal-v2.md)
- [Credits System Documentation](/docs/technical/systems/credits.md)
- [Billing System Documentation](/docs/technical/systems/billing.md)
- [Stripe Checkout API](https://stripe.com/docs/api/checkout/sessions/create)
