# Subscription System Architecture

**Version:** 2.0 (Subscription-Only Model)
**Last Updated:** December 2, 2025
**Status:** Production

---

## Table of Contents

1. [Overview](#1-overview)
2. [Implementation Status](#2-implementation-status)
3. [System Architecture](#3-system-architecture)
4. [Database Schema](#4-database-schema)
5. [API Endpoints](#5-api-endpoints)
6. [Webhook Processing](#6-webhook-processing)
7. [Credit System](#7-credit-system)
8. [Client Components](#8-client-components)
9. [Configuration](#9-configuration)
10. [Security Model](#10-security-model)
11. [Testing Strategy](#11-testing-strategy)
12. [Deployment](#12-deployment)
13. [Troubleshooting](#13-troubleshooting)
14. [Future Roadmap](#14-future-roadmap)

---

## 1. Overview

### 1.1 Business Model

PixelPerfect uses a **subscription-only payment model** where users pay monthly for a fixed allocation of credits. Credits are used to process images.

**Key Principles:**
- No one-time credit purchases
- Monthly credit allocation with rollover
- Rollover capped at 6x monthly allocation
- Free tier: 10 credits on signup (no renewal)

### 1.2 Subscription Plans

| Plan | Price | Credits/Month | Max Rollover | Target User |
|------|-------|---------------|--------------|-------------|
| Free | $0 | 10 (once) | N/A | Testing |
| Hobby | $19/mo | 200 | 1,200 | Personal projects |
| Professional | $49/mo | 1,000 | 6,000 | Professionals |
| Business | $149/mo | 5,000 | 30,000 | Teams/Agencies |

### 1.3 Technology Stack

- **Payment Provider:** Stripe (Checkout, Customer Portal, Webhooks)
- **Database:** Supabase (PostgreSQL)
- **Backend:** Next.js 15 Edge Runtime
- **Frontend:** React 18 with Stripe.js
- **Hosting:** Cloudflare Pages

---

## 2. Implementation Status

### 2.1 Feature Matrix

| Feature | Status | Notes |
|---------|--------|-------|
| New subscription purchase | Implemented | Embedded & hosted checkout |
| Monthly credit allocation | Implemented | With rollover cap |
| Subscription cancellation | Implemented | Via API + Stripe Portal |
| Billing page | Implemented | Shows plan & credits |
| Pricing page | Implemented | 3 subscription tiers |
| Success/cancel pages | Implemented | Post-checkout flow |
| Webhook signature verification | Implemented | Production-ready |
| Credit transaction logging | Implemented | Full audit trail |
| Upgrade/downgrade flow | Implemented | `/api/subscription/change` with proration |
| Webhook idempotency | Implemented | `webhook_events` table with atomic claims |
| **Scheduled Stripe sync** | **NOT IMPLEMENTED** | See PRD: `docs/PRDs/stripe-db-sync-prd.md` |
| **Credit usage history UI** | **NOT IMPLEMENTED** | Data exists, no UI |
| **Low credit warning** | **NOT IMPLEMENTED** | No notifications |
| **Trial period support** | **NOT IMPLEMENTED** | Schema ready, no UI |
| **Annual billing** | **NOT IMPLEMENTED** | Monthly only |
| **Proration preview** | **NOT IMPLEMENTED** | No in-app preview |
| **Refund webhook handling** | **PARTIAL** | Logged, no credit clawback |
| **Subscription pause** | **NOT IMPLEMENTED** | Not supported |
| **Expiration detection** | **NOT IMPLEMENTED** | No cron to check `current_period_end` |

### 2.2 API Coverage

```mermaid
graph LR
    subgraph "Implemented"
        A[POST /api/checkout]
        B[POST /api/portal]
        C[POST /api/webhooks/stripe]
        D[POST /api/subscription/change]
        E[POST /api/subscriptions/cancel]
        F[POST /api/admin/subscription]
    end

    subgraph "NOT IMPLEMENTED"
        G[GET /api/credits/history]
        H[POST /api/subscription/preview-change]
        I[GET /api/health/stripe]
        J[POST /api/cron/check-expirations]
        K[POST /api/cron/recover-webhooks]
        L[POST /api/cron/reconcile]
    end

    style G fill:#ff9999
    style H fill:#ff9999
    style I fill:#ff9999
    style J fill:#ff9999
    style K fill:#ff9999
    style L fill:#ff9999
```

### 2.3 Webhook Coverage

| Webhook Event | Status | Handler |
|---------------|--------|---------|
| `checkout.session.completed` | Implemented | Adds initial credits |
| `customer.subscription.created` | Implemented | Creates subscription record |
| `customer.subscription.updated` | Implemented | Updates status, period, tier |
| `customer.subscription.deleted` | Implemented | Marks canceled |
| `invoice.payment_succeeded` | Implemented | Adds monthly credits with rollover cap |
| `invoice.payment_failed` | Implemented | Sets `past_due` status |
| `charge.refunded` | **PARTIAL** | Logged, no credit clawback (TODO) |
| `charge.dispute.created` | **PARTIAL** | Logged, no action (TODO) |
| `invoice.payment_refunded` | **PARTIAL** | Logged, no action (TODO) |
| `customer.subscription.paused` | **NOT IMPLEMENTED** | No handling |
| `customer.subscription.resumed` | **NOT IMPLEMENTED** | No handling |

### 2.4 Known Gaps & Risks

| Gap | Risk Level | Mitigation |
|-----|------------|------------|
| No scheduled sync | **HIGH** | If webhooks fail, DB drifts from Stripe. See PRD. |
| No expiration detection | **MEDIUM** | Users may keep active status after period ends |
| No refund credit clawback | **LOW** | Manual admin intervention required |
| No dispute handling | **LOW** | Rare, handle via support ticket |

---

## 3. System Architecture

### 3.1 High-Level Architecture

```mermaid
flowchart TB
    subgraph Client["CLIENT LAYER"]
        PP[Pricing Page]
        BP[Billing Page]
        CM[Checkout Modal]
        CD[Credits Display]
        SS[StripeService]
    end

    subgraph API["API LAYER"]
        CO[POST /checkout]
        PO[POST /portal]
        WH[POST /webhooks/stripe]
    end

    subgraph Stripe["STRIPE"]
        CS[Checkout Session]
        CP[Customer Portal]
        WE[Webhook Events]
    end

    subgraph Supabase["SUPABASE"]
        PR[(profiles)]
        SU[(subscriptions)]
        CT[(credit_transactions)]
        RPC[RPC Functions]
    end

    PP --> SS
    BP --> SS
    CM --> SS
    CD --> SS

    SS --> CO
    SS --> PO

    CO --> CS
    PO --> CP

    WE --> WH
    WH --> RPC
    RPC --> PR
    RPC --> SU
    RPC --> CT
```

### 3.2 Subscription Purchase Flow

```mermaid
sequenceDiagram
    participant U as User
    participant UI as Pricing Page
    participant CM as Checkout Modal
    participant API as /api/checkout
    participant S as Stripe
    participant WH as /api/webhooks
    participant DB as Supabase

    U->>UI: Clicks "Subscribe Now"
    UI->>CM: Opens modal
    CM->>API: POST /checkout (priceId, auth token)
    API->>S: Create Checkout Session
    S-->>API: Session with clientSecret
    API-->>CM: clientSecret
    CM->>S: Embedded Checkout
    U->>S: Enters payment details
    S->>S: Processes payment
    S-->>U: Redirects to /success

    par Webhook Processing
        S->>WH: checkout.session.completed
        WH->>DB: increment_credits_with_log()
        S->>WH: customer.subscription.created
        WH->>DB: Upsert subscription
        WH->>DB: Update profile tier
    end

    U->>UI: Sees credits updated
```

### 3.3 Monthly Renewal Flow

```mermaid
sequenceDiagram
    participant S as Stripe
    participant WH as /api/webhooks
    participant DB as Supabase

    S->>S: Monthly billing cycle
    S->>S: Charges customer

    alt Payment Succeeds
        S->>WH: invoice.payment_succeeded
        WH->>DB: Get current balance
        WH->>WH: Calculate credits (with rollover cap)
        WH->>DB: increment_credits_with_log()
        WH->>DB: Log transaction
    else Payment Fails
        S->>WH: invoice.payment_failed
        WH->>DB: Set status = 'past_due'
    end
```

### 3.4 Subscription Management Flow

```mermaid
flowchart TD
    A[User clicks Manage Subscription] --> B[POST /api/portal]
    B --> C{Has stripe_customer_id?}
    C -->|No| D[Error: Activate subscription first]
    C -->|Yes| E[Create Portal Session]
    E --> F[Redirect to Stripe Portal]
    F --> G[User manages subscription]
    G --> H[Stripe sends webhooks]
    H --> I[Update local database]

    style D fill:#ff9999
```

---

## 4. Database Schema

### 4.1 Entity Relationship Diagram

```mermaid
erDiagram
    AUTH_USERS ||--|| PROFILES : "extends"
    PROFILES ||--o{ SUBSCRIPTIONS : "has"
    PROFILES ||--o{ CREDIT_TRANSACTIONS : "has"
    PRODUCTS ||--o{ PRICES : "has"

    AUTH_USERS {
        uuid id PK
        string email
        timestamp created_at
    }

    PROFILES {
        uuid id PK,FK
        string stripe_customer_id UK
        int credits_balance
        string subscription_status
        string subscription_tier
        timestamp created_at
        timestamp updated_at
    }

    SUBSCRIPTIONS {
        string id PK "Stripe sub ID"
        uuid user_id FK
        string status
        string price_id
        timestamp current_period_start
        timestamp current_period_end
        boolean cancel_at_period_end
        timestamp canceled_at
    }

    CREDIT_TRANSACTIONS {
        uuid id PK
        uuid user_id FK
        int amount
        string type "subscription|usage|bonus|refund"
        string ref_id
        string description
        timestamp created_at
    }

    PRODUCTS {
        string id PK "Stripe product ID"
        string name
        string description
        boolean active
        jsonb metadata
    }

    PRICES {
        string id PK "Stripe price ID"
        string product_id FK
        boolean active
        string currency
        int unit_amount
        string type
        string interval
    }
```

> **NOT IMPLEMENTED:** The `products` and `prices` tables exist but are never synced from Stripe. The system uses hardcoded `SUBSCRIPTION_PRICE_MAP` instead.

### 4.2 Table Definitions

#### profiles
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT UNIQUE,
  credits_balance INTEGER DEFAULT 10 NOT NULL,
  subscription_status TEXT CHECK (subscription_status IN
    ('active', 'trialing', 'past_due', 'canceled', 'unpaid')),
  subscription_tier TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### subscriptions
```sql
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,  -- Stripe subscription ID
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  price_id TEXT NOT NULL,
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### credit_transactions
```sql
CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  type TEXT CHECK (type IN
    ('purchase', 'subscription', 'usage', 'refund', 'bonus')),
  ref_id TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

> **NOT IMPLEMENTED:** No API endpoint exposes `credit_transactions` to users. The data is logged but not displayed.

### 4.3 RPC Functions

```mermaid
graph LR
    subgraph "Implemented RPC Functions"
        A[increment_credits_with_log]
        B[decrement_credits]
        C[has_sufficient_credits]
        D[get_active_subscription]
    end

    subgraph "Callers"
        W[Webhooks] --> A
        S[StripeService] --> B
        S --> C
        S --> D
    end
```

---

## 5. API Endpoints

### 5.1 Implemented Endpoints

#### POST /api/checkout

Creates a Stripe Checkout Session for subscription purchase.

**Request:**
```typescript
interface ICheckoutSessionRequest {
  priceId: string;           // Required: Stripe price ID
  successUrl?: string;       // Optional: Override success URL
  cancelUrl?: string;        // Optional: Override cancel URL
  metadata?: Record<string, string>;
  uiMode?: 'hosted' | 'embedded';  // Default: 'hosted'
}
```

**Response:**
```typescript
interface ICheckoutSessionResponse {
  success: true;
  data: {
    url: string;            // Redirect URL (hosted mode)
    sessionId: string;      // Stripe session ID
    clientSecret?: string;  // For embedded checkout
  }
}
```

**Location:** `app/api/checkout/route.ts`

---

#### POST /api/portal

Creates a Stripe Customer Portal session for subscription management.

**Request:**
```typescript
interface IPortalRequest {
  returnUrl?: string;  // Optional: URL to return to after portal
}
```

**Response:**
```typescript
interface IPortalResponse {
  success: true;
  data: {
    url: string;  // Stripe portal URL
  }
}
```

**Location:** `app/api/portal/route.ts`

---

#### POST /api/webhooks/stripe

Handles Stripe webhook events. See [Section 6](#6-webhook-processing) for details.

**Location:** `app/api/webhooks/stripe/route.ts`

---

### 5.2 NOT IMPLEMENTED Endpoints

```mermaid
graph TD
    subgraph "Missing API Endpoints"
        A["GET /api/credits/history<br/>Returns paginated credit transactions"]
        B["POST /api/subscription/preview-change<br/>Shows proration for plan change"]
        C["POST /api/subscription/change<br/>Changes plan with confirmation"]
        D["GET /api/health/stripe<br/>Validates Stripe configuration"]
    end

    style A fill:#ffcccc
    style B fill:#ffcccc
    style C fill:#ffcccc
    style D fill:#ffcccc
```

---

## 6. Webhook Processing

### 6.1 Event Flow

```mermaid
flowchart TD
    A[Stripe Event] --> B{Signature Valid?}
    B -->|No| C[400 Bad Request]
    B -->|Yes| D{Event Type?}

    D -->|checkout.session.completed| E[handleCheckoutSessionCompleted]
    D -->|subscription.created/updated| F[handleSubscriptionUpdate]
    D -->|subscription.deleted| G[handleSubscriptionDeleted]
    D -->|invoice.payment_succeeded| H[handleInvoicePaymentSucceeded]
    D -->|invoice.payment_failed| I[handleInvoicePaymentFailed]
    D -->|Other| J[Log: Unhandled event]

    E --> K[Add initial credits]
    F --> L[Upsert subscription + Update profile]
    G --> M[Mark subscription canceled]
    H --> N[Add monthly credits with rollover cap]
    I --> O[Set profile to past_due]

    style C fill:#ff9999
```

### 6.2 Rollover Cap Logic

```mermaid
graph TD
    A[Invoice Payment Succeeded] --> B[Get current balance]
    B --> C[Get plan credits & max rollover]
    C --> D{balance + credits > max?}
    D -->|Yes| E[credits_to_add = max - balance]
    D -->|No| F[credits_to_add = plan credits]
    E --> G{credits_to_add > 0?}
    F --> G
    G -->|Yes| H[increment_credits_with_log]
    G -->|No| I[Skip - already at max]
```

**Example:**
```
Pro Plan: 1000 credits/month, 6000 max rollover

Month 6: Balance = 5500
  → Would add 1000
  → 5500 + 1000 = 6500 > 6000
  → Add only 500 → Balance: 6000

Month 7: Balance = 6000
  → Would add 1000
  → Already at max
  → Add 0 → Balance: 6000
```

### 6.3 NOT IMPLEMENTED Webhook Handlers

| Event | Purpose | Status |
|-------|---------|--------|
| `charge.refunded` | Claw back credits on refund | **NOT IMPLEMENTED** |
| `charge.dispute.created` | Handle chargebacks | **NOT IMPLEMENTED** |
| `customer.subscription.paused` | Handle pause | **NOT IMPLEMENTED** |
| `customer.subscription.resumed` | Handle resume | **NOT IMPLEMENTED** |

---

## 7. Credit System

### 7.1 Credit Flow

```mermaid
flowchart LR
    subgraph "Credit Sources"
        A[Initial Subscription]
        B[Monthly Renewal]
        C[Bonus Credits]
        D[Refund Credits]
    end

    subgraph "Credit Balance"
        E[(profiles.credits_balance)]
    end

    subgraph "Credit Usage"
        F[Image Processing]
    end

    subgraph "Audit Log"
        G[(credit_transactions)]
    end

    A -->|increment_credits_with_log| E
    B -->|increment_credits_with_log| E
    C -->|increment_credits_with_log| E
    D -->|increment_credits_with_log| E
    E -->|decrement_credits| F

    A --> G
    B --> G
    C --> G
    D --> G
```

### 7.2 Credit Types

| Type | Description | Trigger | Implemented |
|------|-------------|---------|-------------|
| `subscription` | Monthly allocation | Invoice payment | Yes |
| `usage` | Credit consumption | Image processing | Yes |
| `bonus` | Promotional credits | Manual/campaign | Schema only |
| `refund` | Returned credits | Support action | Schema only |

### 7.3 NOT IMPLEMENTED: Credit History UI

```mermaid
graph TD
    subgraph "Current State"
        A[credit_transactions table] -->|Data exists| B[No UI to display]
    end

    subgraph "Needed"
        C[GET /api/credits/history endpoint]
        D[Credit History Component]
        E[Billing Page Integration]
        C --> D --> E
    end

    style B fill:#ffcccc
    style C fill:#ffcccc
    style D fill:#ffcccc
    style E fill:#ffcccc
```

---

## 8. Client Components

### 8.1 Component Hierarchy

```mermaid
graph TD
    subgraph "Pricing Page"
        A[app/pricing/page.tsx]
        B[PricingCard x3]
        C[CheckoutModal]
        D[EmbeddedCheckout]
    end

    subgraph "Billing Page"
        E[app/dashboard/billing/page.tsx]
        F[Current Plan Section]
        G[Credits Display]
        H[Manage Subscription Button]
    end

    subgraph "Shared"
        I[CreditsDisplay]
        J[SubscriptionStatus]
    end

    A --> B
    B --> C
    C --> D

    E --> F
    E --> G
    E --> H
    F --> J
    G --> I
    H -->|redirects| K[Stripe Portal]
```

### 8.2 Component Files

| Component | Location | Status |
|-----------|----------|--------|
| `PricingCard` | `client/components/stripe/PricingCard.tsx` | Implemented |
| `CheckoutModal` | `client/components/stripe/CheckoutModal.tsx` | Implemented |
| `CreditsDisplay` | `client/components/stripe/CreditsDisplay.tsx` | Implemented |
| `SubscriptionStatus` | `client/components/stripe/SubscriptionStatus.tsx` | Implemented |
| **CreditHistory** | — | **NOT IMPLEMENTED** |
| **LowCreditWarning** | — | **NOT IMPLEMENTED** |
| **PlanComparison** | — | **NOT IMPLEMENTED** |
| **UpgradeConfirmation** | — | **NOT IMPLEMENTED** |

### 8.3 Page Files

| Page | Location | Status |
|------|----------|--------|
| Pricing | `app/pricing/page.tsx` | Implemented |
| Billing | `app/dashboard/billing/page.tsx` | Implemented |
| Success | `app/success/page.tsx` | Implemented |
| Canceled | `app/canceled/page.tsx` | Implemented |

---

## 9. Configuration

### 9.1 Environment Variables

```mermaid
graph LR
    subgraph "Client .env.client"
        A[NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY]
        B[NEXT_PUBLIC_BASE_URL]
    end

    subgraph "Server .env.api"
        C[STRIPE_SECRET_KEY]
        D[STRIPE_WEBHOOK_SECRET]
    end

    subgraph "Usage"
        A --> E[Stripe.js initialization]
        B --> F[Redirect URLs]
        C --> G[Stripe API calls]
        D --> H[Webhook verification]
    end
```

### 9.2 Stripe Configuration

**Location:** `shared/config/stripe.ts`

```typescript
export const STRIPE_PRICES = {
  HOBBY_MONTHLY: 'price_xxx',
  PRO_MONTHLY: 'price_yyy',
  BUSINESS_MONTHLY: 'price_zzz',
} as const;

export const SUBSCRIPTION_PRICE_MAP = {
  [STRIPE_PRICES.HOBBY_MONTHLY]: {
    key: 'hobby',
    name: 'Hobby',
    creditsPerMonth: 200,
    maxRollover: 1200,
    features: [...],
  },
  // ...
};
```

> **NOT IMPLEMENTED:** Annual billing prices and trial period configuration.

---

## 10. Security Model

### 10.1 Authentication Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant A as API Route
    participant S as Supabase Auth

    C->>A: Request with Bearer token
    A->>A: Extract token from header
    A->>S: supabaseAdmin.auth.getUser(token)

    alt Token Valid
        S-->>A: User object
        A->>A: Continue processing
    else Token Invalid
        S-->>A: Error
        A-->>C: 401 Unauthorized
    end
```

### 10.2 Webhook Security

```mermaid
sequenceDiagram
    participant S as Stripe
    participant W as Webhook Endpoint

    S->>W: POST with stripe-signature header
    W->>W: Extract signature
    W->>W: Verify with webhook secret

    alt Signature Valid
        W->>W: Parse event
        W->>W: Process event
        W-->>S: 200 OK
    else Signature Invalid
        W-->>S: 400 Bad Request
    end
```

### 10.3 Row Level Security (RLS)

| Table | Policy | Access |
|-------|--------|--------|
| profiles | `auth.uid() = id` | Users see own profile |
| subscriptions | `auth.uid() = user_id` | Users see own subscriptions |
| credit_transactions | `auth.uid() = user_id` | Users see own transactions |
| products/prices | `true` | Public read access |

---

## 11. Testing Strategy

### 11.1 Test Files

| Test Type | Location | Status |
|-----------|----------|--------|
| Unit | `tests/unit/api/stripe-webhooks.unit.spec.ts` | Exists |
| Unit | `tests/unit/subscription-config.unit.spec.ts` | Exists |
| API | `tests/api/checkout.api.spec.ts` | Exists |
| API | `tests/api/portal.api.spec.ts` | Exists |
| API | `tests/api/webhooks.api.spec.ts` | Exists |
| Integration | `tests/integration/billing-system.integration.spec.ts` | Exists |
| E2E | `tests/e2e/billing.e2e.spec.ts` | Exists |

### 11.2 Test Mode

The system supports test mode when:
- `STRIPE_SECRET_KEY` contains `dummy_key`
- `ENV=test`
- `STRIPE_WEBHOOK_SECRET=whsec_test_secret`

### 11.3 Webhook Testing

```bash
# Forward webhooks to local
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Trigger test events
stripe trigger checkout.session.completed
stripe trigger invoice.payment_succeeded
```

---

## 12. Deployment

### 12.1 Deployment Flow

```mermaid
flowchart TD
    A[Configure env vars] --> B[Set up Stripe webhook]
    B --> C[Apply database migrations]
    C --> D[Deploy application]
    D --> E[Verify webhook connectivity]
    E --> F[Test checkout flow]
```

### 12.2 Setup Scripts

```bash
# Initial setup
./scripts/stripe-setup.sh

# Complete configuration
./scripts/stripe-complete-setup.sh
```

---

## 13. Troubleshooting

### 13.1 Common Issues

```mermaid
graph TD
    A[Credits not added] --> B{Check webhook logs}
    B --> C{Signature valid?}
    C -->|No| D[Check STRIPE_WEBHOOK_SECRET]
    C -->|Yes| E{user_id in metadata?}
    E -->|No| F[Check checkout session creation]
    E -->|Yes| G{RPC error?}
    G -->|Yes| H[Check Supabase logs]
    G -->|No| I[Check event type handling]
```

### 13.2 Debugging Commands

```bash
# Check user's subscription
supabase sql "SELECT * FROM subscriptions WHERE user_id = 'xxx'"

# Check credit transactions
supabase sql "SELECT * FROM credit_transactions WHERE user_id = 'xxx' ORDER BY created_at DESC"

# Check webhook events
stripe events list --limit 10
```

---

## 14. Future Roadmap

### 14.1 Priority Features

```mermaid
gantt
    title Subscription System Roadmap
    dateFormat  YYYY-MM-DD
    section High Priority
    Stripe DB Sync (Cron Jobs)   :a1, 2025-01-01, 14d
    Expiration Detection         :a2, after a1, 7d
    Refund Credit Clawback       :a3, after a2, 7d
    section Medium Priority
    Credit History UI            :b1, after a3, 10d
    Low Credit Warnings          :b2, after b1, 7d
    Proration Preview            :b3, after b2, 5d
    section Low Priority
    Annual Billing               :c1, after b3, 14d
    Trial Period UI              :c2, after c1, 7d
    Subscription Pause/Resume    :c3, after c2, 5d
```

### 14.2 Feature Details

| Feature | Description | Complexity | PRD |
|---------|-------------|------------|-----|
| Stripe DB Sync | Scheduled sync to catch missed webhooks | High | `docs/PRDs/stripe-db-sync-prd.md` |
| Expiration Detection | Hourly cron to check `current_period_end` | Medium | Part of sync PRD |
| Refund Credit Clawback | Deduct credits when charges are refunded | Medium | - |
| Credit History UI | Display `credit_transactions` to users | Low | - |
| Low Credit Warnings | Email/in-app notifications when credits low | Medium | - |
| Proration Preview | Show cost before plan change | Low | - |
| Annual Billing | Yearly plans with discount | Medium | - |

### 14.3 Completed Features (Recently)

| Feature | Completed | Notes |
|---------|-----------|-------|
| Upgrade/Downgrade Flow | Dec 2025 | `/api/subscription/change` with proration |
| Webhook Idempotency | Dec 2025 | `webhook_events` table with atomic claims |
| Admin Subscription Management | Dec 2025 | `/api/admin/subscription` endpoint |

---

## Appendix: File Index

### API Routes
- `app/api/checkout/route.ts` - Creates Stripe Checkout Session
- `app/api/portal/route.ts` - Creates Stripe Customer Portal session
- `app/api/webhooks/stripe/route.ts` - Main webhook handler (612 lines)
- `app/api/subscription/change/route.ts` - Plan upgrade/downgrade with proration
- `app/api/subscriptions/cancel/route.ts` - Cancel subscription at period end
- `app/api/admin/subscription/route.ts` - Admin subscription management

### Pages
- `app/pricing/page.tsx`
- `app/dashboard/billing/page.tsx`
- `app/success/page.tsx`
- `app/canceled/page.tsx`

### Components
- `client/components/stripe/CheckoutModal.tsx`
- `client/components/stripe/PricingCard.tsx`
- `client/components/stripe/CreditsDisplay.tsx`
- `client/components/stripe/SubscriptionStatus.tsx`

### Services
- `server/stripe/stripeService.ts`
- `server/stripe/config.ts`
- `server/stripe/types.ts`

### Configuration
- `shared/config/stripe.ts`
- `shared/config/env.ts`
- `shared/constants/billing.ts`

### Database
- `supabase/migrations/20250120_create_profiles_table.sql`
- `supabase/migrations/20250120_create_subscriptions_table.sql`
- `supabase/migrations/20250121_create_credit_transactions_table.sql`
- `supabase/migrations/20250120_create_rpc_functions.sql`
