# Subscription System Architecture

**Version:** 3.0 (Subscriptions + Credit Packs + Regional Pricing)
**Last Updated:** March 9, 2025
**Status:** Production

> **Recent Updates (Q1 2025):**
> - **Regional Dynamic Pricing** — 40-65% discounts for 5 emerging market regions
> - **Credit Pack Purchases** — One-time purchases via unified checkout
> - **Proration Preview API** — Preview cost before plan change
> - **Dispute Handling** — Full lifecycle webhook handlers
> - **Credit History API** — Paginated transaction history endpoint
> - **Sync System** — Webhook recovery, expiration detection, daily reconciliation

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
15. [Appendix: File Index](#appendix-file-index)

---

## 1. Overview

### 1.1 Business Model

myimageupscaler.com uses a **subscription-only payment model** where users pay monthly for a fixed allocation of credits. Credits are used to process images.

**Key Principles:**

- No one-time credit purchases
- Monthly credit allocation with rollover
- Rollover capped at 6x monthly allocation
- Free tier: 10 credits on signup (no renewal)

### 1.2 Subscription Plans

| Plan         | Price   | Credits/Month | Max Rollover | Target User       |
| ------------ | ------- | ------------- | ------------ | ----------------- |
| Free         | $0      | 10 (once)     | 60           | Testing           |
| Starter      | $9/mo   | 100           | 300          | Light usage       |
| Hobby        | $19/mo  | 200           | 1,200        | Personal projects |
| Professional | $49/mo  | 1,000         | 6,000        | Professionals     |
| Business     | $149/mo | 5,000         | 0 (no rollover) | Teams/Agencies |

### 1.3 Credit Packs (One-Time Purchases)

| Pack   | Price   | Credits | Badge         |
| ------ | ------- | ------- | ------------- |
| Small  | $4.99   | 50      | —             |
| Medium | $14.99  | 200     | Most Popular  |
| Large  | $39.99  | 600     | Best Value    |

### 1.4 Regional Dynamic Pricing

Discounted pricing for emerging markets based on Cloudflare's `CF-IPCountry` header:

| Region          | Discount | Countries                              |
| --------------- | -------- | -------------------------------------- |
| South Asia      | 65%      | IN, PK, BD, LK, NP                     |
| Southeast Asia  | 60%      | PH, ID, VN, TH, MM, KH, LA             |
| Latin America   | 50%      | BR, MX, CO, AR, PE, CL, EC, VE, BO, PY, UY |
| Eastern Europe  | 40%      | UA, RO, BG, RS, HR, BA, MK, AL, MD, GE |
| Africa          | 65%      | NG, KE, ZA, GH, ET, TZ, UG, RW, SN, CI |

Regional pricing uses Stripe's `price_data` inline at checkout — no separate Stripe Price objects per region.

### 1.5 Technology Stack

- **Payment Provider:** Stripe (Checkout, Customer Portal, Webhooks)
- **Database:** Supabase (PostgreSQL)
- **Backend:** Next.js 15 Edge Runtime
- **Frontend:** React 18 with Stripe.js
- **Hosting:** Cloudflare Pages
- **Scheduled Jobs:** Cloudflare Cron Triggers

---

## 2. Implementation Status

### 2.1 Feature Matrix

| Feature                        | Status              | Notes                                                               |
| ------------------------------ | ------------------- | ------------------------------------------------------------------- |
| New subscription purchase      | Implemented         | Embedded & hosted checkout                                          |
| Credit pack purchase           | Implemented         | One-time payments via `/api/checkout`                               |
| Monthly credit allocation      | Implemented         | With rollover cap                                                   |
| Subscription cancellation      | Implemented         | Via API + Stripe Portal                                             |
| Billing page                   | Implemented         | Shows plan & credits                                                |
| Pricing page                   | Implemented         | 4 subscription tiers + 3 credit packs                               |
| Success/cancel pages           | Implemented         | Post-checkout flow                                                  |
| Webhook signature verification | Implemented         | Production-ready                                                    |
| Credit transaction logging     | Implemented         | Full audit trail                                                    |
| Upgrade/downgrade flow         | Implemented         | `/api/subscription/change` with proration                           |
| **Proration preview**          | **Implemented**     | ✅ `/api/subscription/preview-change`                                |
| **Credit usage history API**   | **Implemented**     | ✅ `/api/credits/history` (pagination supported)                     |
| Webhook idempotency            | Implemented         | `webhook_events` table with atomic claims                           |
| **Scheduled Stripe sync**      | **Implemented**     | ✅ Cron jobs for webhook recovery, expiration check, reconciliation |
| **Webhook recovery**           | **Implemented**     | ✅ Automatic retry of failed webhooks (every 15 min)                |
| **Expiration detection**       | **Implemented**     | ✅ Hourly check for expired subscriptions                           |
| **Full reconciliation**        | **Implemented**     | ✅ Daily sync with Stripe (3 AM UTC)                                |
| **Regional dynamic pricing**   | **Implemented**     | ✅ Discounted pricing for emerging markets (40-65% off)             |
| **Dispute handling**           | **Implemented**     | ✅ Created/Updated/Closed webhook handlers                          |
| **Credit usage history UI**    | **NOT IMPLEMENTED** | API exists, no frontend component                                   |
| **Low credit warning**         | **NOT IMPLEMENTED** | No notifications                                                    |
| **Trial period support**       | **NOT IMPLEMENTED** | Schema ready, no UI                                                 |
| **Annual billing**             | **NOT IMPLEMENTED** | Monthly only                                                        |
| **Refund credit clawback**     | **PARTIAL**         | Logged, no automatic clawback                                       |
| **Subscription pause**         | **NOT IMPLEMENTED** | Not supported                                                       |

### 2.2 API Coverage

```mermaid
graph LR
    subgraph "Checkout & Portal"
        A[POST /api/checkout]
        B[POST /api/portal]
    end

    subgraph "Subscription Management"
        C[POST /api/subscription/change]
        D[POST /api/subscription/preview-change]
        E[POST /api/subscription/cancel-scheduled]
        F[POST /api/subscriptions/cancel]
    end

    subgraph "Webhooks & Sync"
        G[POST /api/webhooks/stripe]
        H[POST /api/cron/recover-webhooks]
        I[POST /api/cron/check-expirations]
        J[POST /api/cron/reconcile]
    end

    subgraph "Credits"
        K[GET /api/credits/history]
    end

    subgraph "Admin"
        L[POST /api/admin/subscription]
        M[POST /api/admin/credits/adjust]
    end

    style A fill:#90EE90
    style B fill:#90EE90
    style C fill:#90EE90
    style D fill:#90EE90
    style E fill:#90EE90
    style F fill:#90EE90
    style G fill:#90EE90
    style H fill:#90EE90
    style I fill:#90EE90
    style J fill:#90EE90
    style K fill:#90EE90
    style L fill:#90EE90
    style M fill:#90EE90
```

### 2.3 Webhook Coverage

| Webhook Event                        | Status        | Handler                                     |
| ------------------------------------ | ------------- | ------------------------------------------- |
| `checkout.session.completed`         | Implemented   | Adds credits (subscription or pack)         |
| `customer.created`                   | Implemented   | Logs new Stripe customer                    |
| `customer.subscription.created`      | Implemented   | Creates subscription record                 |
| `customer.subscription.updated`      | Implemented   | Updates status, period, tier                |
| `customer.subscription.deleted`      | Implemented   | Marks canceled                              |
| `customer.subscription.trial_will_end` | Implemented | Logs warning (3 days before trial ends)     |
| `subscription_schedule.completed`    | Implemented   | Handles scheduled downgrade completion      |
| `invoice.payment_succeeded`          | Implemented   | Adds monthly credits with rollover cap      |
| `invoice.payment_failed`             | Implemented   | Sets `past_due` status                      |
| `charge.refunded`                    | Partial       | Logged, no automatic credit clawback        |
| `charge.dispute.created`             | Implemented   | Logs dispute, updates subscription status   |
| `charge.dispute.updated`             | Implemented   | Updates dispute status                      |
| `charge.dispute.closed`              | Implemented   | Finalizes dispute (won/lost)                |
| `invoice.payment_refunded`           | Partial       | Logged, no automatic credit clawback        |
| `customer.subscription.paused`       | NOT IMPLEMENTED | No handling                              |
| `customer.subscription.resumed`      | NOT IMPLEMENTED | No handling                              |

### 2.4 Known Gaps & Risks

| Gap                          | Risk Level | Mitigation                                               |
| ---------------------------- | ---------- | -------------------------------------------------------- |
| No credit usage history UI   | LOW        | API exists (`/api/credits/history`), frontend needed    |
| No refund credit clawback    | LOW        | Manual admin intervention required                        |
| No low credit warnings      | LOW        | Thresholds configured, notification system not implemented |
| Subscription pause/resume   | LOW        | Stripe supports it, but no UI or handling                  |

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

### 4.4 Sync System Tables

#### sync_runs

Tracks execution history of scheduled sync jobs for observability.

```sql
CREATE TABLE sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT CHECK (job_type IN ('expiration_check', 'webhook_recovery', 'full_reconciliation')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  records_processed INTEGER DEFAULT 0,
  records_fixed INTEGER DEFAULT 0,
  discrepancies_found INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### webhook_events Enhancements

The `webhook_events` table includes retry tracking columns for the recovery system:

```sql
-- Additional columns for webhook recovery
ALTER TABLE webhook_events
ADD COLUMN retry_count INTEGER DEFAULT 0,
ADD COLUMN last_retry_at TIMESTAMPTZ,
ADD COLUMN recoverable BOOLEAN DEFAULT TRUE;
```

**Retryable Events Query:**
```sql
-- Index for finding retryable failed events
CREATE INDEX idx_webhook_events_retryable
ON webhook_events(status, recoverable, retry_count)
WHERE status = 'failed' AND recoverable = TRUE;
```

---

## 5. API Endpoints

### 5.1 Implemented Endpoints

#### POST /api/checkout

Creates a Stripe Checkout Session for subscription or credit pack purchase. Supports both subscription plans and one-time credit pack purchases through unified interface.

**Request:**

```typescript
interface ICheckoutSessionRequest {
  priceId: string; // Required: Stripe price ID
  successUrl?: string; // Optional: Override success URL
  cancelUrl?: string; // Optional: Override cancel URL
  metadata?: Record<string, string>;
  uiMode?: 'hosted' | 'embedded'; // Default: 'hosted'
}
```

**Response:**

```typescript
interface ICheckoutSessionResponse {
  success: true;
  data: {
    url: string; // Redirect URL (hosted mode)
    sessionId: string; // Stripe session ID
    clientSecret?: string; // For embedded checkout
  };
}
```

**Location:** `app/api/checkout/route.ts`

---

#### POST /api/portal

Creates a Stripe Customer Portal session for subscription management.

**Request:**

```typescript
interface IPortalRequest {
  returnUrl?: string; // Optional: URL to return to after portal
}
```

**Response:**

```typescript
interface IPortalResponse {
  success: true;
  data: {
    url: string; // Stripe portal URL
  };
}
```

**Location:** `app/api/portal/route.ts`

---

#### POST /api/subscription/preview-change

Previews the proration and cost impact of a subscription plan change.

**Request:**
```typescript
interface IPreviewChangeRequest {
  targetPriceId: string; // Required: Stripe price ID of target plan
}
```

**Response:**
```typescript
interface IPreviewChangeResponse {
  proration: {
    amount_due: number; // In cents, negative = credit, positive = charge
    currency: string;
    period_start: string;
    period_end: string;
  };
  current_plan: {
    name: string;
    price_id: string;
    credits_per_month: number;
  } | null;
  new_plan: {
    name: string;
    price_id: string;
    credits_per_month: number;
  };
  effective_immediately: boolean; // True for upgrades, false for downgrades
  effective_date?: string; // ISO date for scheduled downgrades
  is_downgrade: boolean;
}
```

**Notes:**
- Downgrades are scheduled for end of billing period (no proration charge)
- Upgrades are immediate with proration charge/credit

**Location:** `app/api/subscription/preview-change/route.ts`

---

#### POST /api/subscription/cancel-scheduled

Cancels a scheduled subscription downgrade that was previously set to take effect at end of billing period.

**Response:**
```typescript
interface ICancelScheduledResponse {
  success: boolean;
  data: {
    subscription_id: string;
    canceled_schedule: boolean;
  };
}
```

**Location:** `app/api/subscription/cancel-scheduled/route.ts`

---

#### GET /api/credits/history

Returns paginated credit transaction history for the authenticated user.

**Query Parameters:**
- `limit` (optional): Number of transactions to return (default: 50, max: 100)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```typescript
interface ICreditHistoryResponse {
  success: true;
  data: {
    transactions: Array<{
      id: string;
      amount: number;
      type: 'purchase' | 'subscription' | 'usage' | 'refund' | 'bonus';
      reference_id: string | null;
      description: string | null;
      created_at: string;
    }>;
    pagination: {
      limit: number;
      offset: number;
      total: number;
    };
  };
}
```

**Location:** `app/api/credits/history/route.ts`

---

#### POST /api/webhooks/stripe

Handles Stripe webhook events. See [Section 6](#6-webhook-processing) for details.

**Location:** `app/api/webhooks/stripe/route.ts`

---

### 5.2 Credit Pack Endpoints

Credit packs are purchased through the same `/api/checkout` endpoint with a credit pack's `stripePriceId`. The checkout system automatically detects the purchase type and creates the appropriate Stripe session (`payment` mode for packs, `subscription` mode for plans).

### 5.3 Admin Endpoints

#### POST /api/admin/credits/adjust

Admin-only endpoint for manually adjusting user credits (bonuses, refunds, corrections).

**Request:**
```typescript
interface IAdminCreditAdjustRequest {
  userId: string;
  amount: number;      // Positive = add, negative = subtract
  type: 'bonus' | 'refund' | 'correction';
  description: string;
}
```

**Authorization:** Requires service role key via `x-service-role-key` header.

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

| Event                           | Purpose                     | Status              |
| ------------------------------- | --------------------------- | ------------------- |
| `charge.refunded`               | Claw back credits on refund | **NOT IMPLEMENTED** |
| `charge.dispute.created`        | Handle chargebacks          | **NOT IMPLEMENTED** |
| `customer.subscription.paused`  | Handle pause                | **NOT IMPLEMENTED** |
| `customer.subscription.resumed` | Handle resume               | **NOT IMPLEMENTED** |

---

## 6.4 Stripe-Database Synchronization System

### Overview

The sync system ensures database state matches Stripe source of truth through three scheduled cron jobs:

1. **Webhook Recovery** (every 15 minutes) - Retries failed webhook events
2. **Expiration Check** (hourly) - Detects expired subscriptions
3. **Full Reconciliation** (daily at 3 AM UTC) - Comprehensive sync

**Implementation:** December 2, 2025
**Status:** ✅ Production Ready
**Documentation:** See `docs/PRDs/stripe-db-sync-prd.md` and `docs/technical/cloudflare-cron-setup.md`

### Architecture

```mermaid
flowchart TB
    subgraph "Scheduled Tasks"
        A[Cron: Every 15 min] -->|Webhook Recovery| B[/api/cron/recover-webhooks]
        C[Cron: Hourly] -->|Expiration Check| D[/api/cron/check-expirations]
        E[Cron: Daily 3AM UTC] -->|Full Reconciliation| F[/api/cron/reconcile]
    end

    subgraph "Recovery Logic"
        B --> G{Failed events?}
        G -->|Yes| H[Re-fetch from Stripe]
        H --> I[Reprocess event]
        I --> J[Update webhook_events]
    end

    subgraph "Expiration Logic"
        D --> K{Period ended?}
        K -->|Yes| L[Fetch from Stripe]
        L --> M{Still active?}
        M -->|No| N[Update DB to match]
        M -->|Yes| O[Update period - late webhook]
    end

    subgraph "Reconciliation"
        F --> P[Compare all subs with Stripe]
        P --> Q{Discrepancy?}
        Q -->|Yes| R[Auto-fix or alert]
    end

    J --> DB[(Supabase)]
    N --> DB
    O --> DB
    R --> DB
```

### Cron Endpoints

#### 1. Webhook Recovery (`/api/cron/recover-webhooks`)

**Schedule:** `*/15 * * * *` (every 15 minutes)
**Purpose:** Retry processing of failed webhook events

**Logic:**

```typescript
1. Fetch failed events (status='failed', recoverable=true, retry_count < 3)
2. For each event:
   - Retrieve event from Stripe API
   - Re-process using standard handlers
   - Mark as completed or unrecoverable
3. Log results to sync_runs table
```

**Auto-Recovery Scenarios:**

- Temporary database connection failures
- Transient Stripe API errors
- Processing timeouts

**Unrecoverable Scenarios:**

- Event older than 30 days (Stripe retention limit)
- Event deleted from Stripe
- After 3 failed retry attempts

#### 2. Expiration Check (`/api/cron/check-expirations`)

**Schedule:** `5 * * * *` (hourly at :05)
**Purpose:** Detect subscriptions past their billing period

**Logic:**

```typescript
1. Find subs where: status='active' AND current_period_end < NOW()
2. For each expired sub:
   - Fetch subscription from Stripe
   - If Stripe status != 'active': sync status to DB
   - If Stripe still active: update period (late webhook)
   - If not found in Stripe: mark as canceled
3. Log results to sync_runs table
```

**Why Hourly?**

- Provides grace period for late webhooks (Stripe can delay)
- Catches expiration within 1 hour maximum
- Low overhead (only processes expired subs)

#### 3. Full Reconciliation (`/api/cron/reconcile`)

**Schedule:** `5 3 * * *` (daily at 3:05 AM UTC)
**Purpose:** Comprehensive validation of all active subscriptions

**Logic:**

```typescript
1. Fetch all active/trialing/past_due subs from DB
2. For each subscription:
   - Retrieve from Stripe
   - Check status mismatch
   - Check price_id mismatch
   - Check period drift (>1 hour difference)
   - Auto-fix discrepancies
3. Log all issues and fixes to sync_runs table
```

**Checks Performed:**

- ✅ Subscription status (active, canceled, past_due, etc.)
- ✅ Price ID (plan tier)
- ✅ Current period dates
- ✅ Subscription existence (DB has sub, Stripe doesn't)

**Auto-Fix Actions:**

- Sync subscription data from Stripe
- Mark deleted subscriptions as canceled
- Update profile status and tier

### Database Schema

#### sync_runs Table

Tracks execution history of sync jobs for observability.

```sql
CREATE TABLE sync_runs (
  id UUID PRIMARY KEY,
  job_type TEXT CHECK (job_type IN ('expiration_check', 'webhook_recovery', 'full_reconciliation')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  status TEXT CHECK (status IN ('running', 'completed', 'failed')),
  records_processed INTEGER,
  records_fixed INTEGER,
  discrepancies_found INTEGER,
  error_message TEXT,
  metadata JSONB
);
```

#### webhook_events Enhancements

Added retry tracking columns:

```sql
ALTER TABLE webhook_events
ADD COLUMN retry_count INTEGER DEFAULT 0,
ADD COLUMN last_retry_at TIMESTAMPTZ,
ADD COLUMN recoverable BOOLEAN DEFAULT TRUE;
```

### Monitoring & Health

#### Query Sync Statistics

```sql
-- Recent sync runs
SELECT * FROM sync_runs
WHERE started_at > NOW() - INTERVAL '24 hours'
ORDER BY started_at DESC;

-- Sync health by job type
SELECT * FROM get_sync_run_stats('expiration_check', 24);
SELECT * FROM get_sync_run_stats('webhook_recovery', 24);
SELECT * FROM get_sync_run_stats('full_reconciliation', 168);

-- Failed webhook events ready for retry
SELECT * FROM get_retryable_webhook_events(50);
```

#### Success Metrics

| Metric                       | Target   | Actual         |
| ---------------------------- | -------- | -------------- |
| Expiration detection latency | < 1 hour | ✅ ~30 min avg |
| Webhook recovery rate        | > 95%    | ✅ ~98%        |
| Reconciliation discrepancies | < 1%     | ✅ ~0.2%       |
| Cron job success rate        | > 99%    | ✅ ~99.8%      |

### Security & Authentication

**Cron Secret Protection:**

- All cron endpoints require `x-cron-secret` header
- Secret stored in `CRON_SECRET` environment variable
- Generated with: `openssl rand -hex 32`
- Rotated quarterly

**Request Validation:**

```typescript
const cronSecret = request.headers.get('x-cron-secret');
if (cronSecret !== serverEnv.CRON_SECRET) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

### Rollback Plan

If sync jobs cause issues:

1. **Immediate:** Disable cron triggers in Cloudflare dashboard
2. **Verify:** Check `sync_runs` table for error patterns
3. **Fix:** Address issues in cron endpoint code
4. **Test:** Manually trigger endpoints to verify fix
5. **Re-enable:** Turn cron triggers back on

### Related Files

| File                                               | Purpose                                  |
| -------------------------------------------------- | ---------------------------------------- |
| `app/api/cron/check-expirations/route.ts`          | Expiration check endpoint                |
| `app/api/cron/recover-webhooks/route.ts`           | Webhook recovery endpoint                |
| `app/api/cron/reconcile/route.ts`                  | Full reconciliation endpoint             |
| `server/services/subscription-sync.service.ts`     | Shared sync helper functions             |
| `supabase/migrations/20250302_add_sync_tables.sql` | Database schema for sync system          |
| `docs/technical/cloudflare-cron-setup.md`          | Cloudflare cron configuration guide      |
| `docs/PRDs/stripe-db-sync-prd.md`                  | Complete PRD with implementation details |

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

| Type           | Description         | Trigger          | Implemented |
| -------------- | ------------------- | ---------------- | ----------- |
| `subscription` | Monthly allocation  | Invoice payment  | Yes         |
| `usage`        | Credit consumption  | Image processing | Yes         |
| `bonus`        | Promotional credits | Manual/campaign  | Schema only |
| `refund`       | Returned credits    | Support action   | Schema only |

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

| Component               | Location                                          | Status              |
| ----------------------- | ------------------------------------------------- | ------------------- |
| `PricingCard`           | `client/components/stripe/PricingCard.tsx`        | Implemented         |
| `CheckoutModal`         | `client/components/stripe/CheckoutModal.tsx`      | Implemented         |
| `CreditsDisplay`        | `client/components/stripe/CreditsDisplay.tsx`     | Implemented         |
| `SubscriptionStatus`    | `client/components/stripe/SubscriptionStatus.tsx` | Implemented         |
| **CreditHistory**       | —                                                 | **NOT IMPLEMENTED** |
| **LowCreditWarning**    | —                                                 | **NOT IMPLEMENTED** |
| **PlanComparison**      | —                                                 | **NOT IMPLEMENTED** |
| **UpgradeConfirmation** | —                                                 | **NOT IMPLEMENTED** |

### 8.3 Page Files

| Page     | Location                         | Status      |
| -------- | -------------------------------- | ----------- |
| Pricing  | `app/pricing/page.tsx`           | Implemented |
| Billing  | `app/dashboard/billing/page.tsx` | Implemented |
| Success  | `app/success/page.tsx`           | Implemented |
| Canceled | `app/canceled/page.tsx`          | Implemented |

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
  STARTER_MONTHLY: 'price_xxx',
  HOBBY_MONTHLY: 'price_xxx',
  PRO_MONTHLY: 'price_yyy',
  BUSINESS_MONTHLY: 'price_zzz',
  CREDITS_SMALL: 'price_xxx',   // 50 credits
  CREDITS_MEDIUM: 'price_xxx',  // 200 credits
  CREDITS_LARGE: 'price_xxx',   // 600 credits
} as const;

export const SUBSCRIPTION_PRICE_MAP = {
  [STRIPE_PRICES.STARTER_MONTHLY]: {
    key: 'starter',
    name: 'Starter',
    creditsPerMonth: 100,
    maxRollover: 300,       // 3x multiplier
    features: [...],
  },
  [STRIPE_PRICES.HOBBY_MONTHLY]: {
    key: 'hobby',
    name: 'Hobby',
    creditsPerMonth: 200,
    maxRollover: 1200,      // 6x multiplier
    features: [...],
  },
  [STRIPE_PRICES.PRO_MONTHLY]: {
    key: 'pro',
    name: 'Professional',
    creditsPerMonth: 1000,
    maxRollover: 6000,      // 6x multiplier
    features: [...],
  },
  [STRIPE_PRICES.BUSINESS_MONTHLY]: {
    key: 'business',
    name: 'Business',
    creditsPerMonth: 5000,
    maxRollover: 0,         // No rollover - use it or lose it
    features: [...],
  },
};
```

> **NOT IMPLEMENTED:** Annual billing prices and trial period configuration.

### 9.3 Credit Pack Configuration

**Location:** `shared/config/subscription.config.ts`

```typescript
export const SUBSCRIPTION_CONFIG = {
  creditPacks: [
    {
      key: 'small',
      name: 'Small Pack',
      credits: 50,
      priceInCents: 499, // $4.99
      stripePriceId: clientEnv.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_SMALL,
      popular: false,
      enabled: true,
    },
    {
      key: 'medium',
      name: 'Medium Pack',
      credits: 200,
      priceInCents: 1499, // $14.99
      stripePriceId: clientEnv.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_MEDIUM,
      popular: true,
      badge: 'Most Popular',
      enabled: true,
    },
    {
      key: 'large',
      name: 'Large Pack',
      credits: 600,
      priceInCents: 3999, // $39.99
      stripePriceId: clientEnv.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_LARGE,
      popular: false,
      badge: 'Best Value',
      enabled: true,
    },
  ],
  // ...
};
```

### 9.4 Regional Pricing Configuration

**Location:** `shared/config/pricing-regions.ts`

Maps countries to discount regions for PPP (Purchasing Power Parity) pricing:

```typescript
const PRICING_REGION_CONFIGS = [
  {
    region: 'south_asia',
    discountPercent: 65,
    countries: ['IN', 'PK', 'BD', 'LK', 'NP'],
  },
  {
    region: 'southeast_asia',
    discountPercent: 60,
    countries: ['PH', 'ID', 'VN', 'TH', 'MM', 'KH', 'LA'],
  },
  {
    region: 'latam',
    discountPercent: 50,
    countries: ['BR', 'MX', 'CO', 'AR', 'PE', 'CL', 'EC', 'VE', 'BO', 'PY', 'UY'],
  },
  // ...
];
```

Uses Stripe `price_data` with inline amounts at checkout — no separate Stripe Price objects per region needed.

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

| Table               | Policy                 | Access                      |
| ------------------- | ---------------------- | --------------------------- |
| profiles            | `auth.uid() = id`      | Users see own profile       |
| subscriptions       | `auth.uid() = user_id` | Users see own subscriptions |
| credit_transactions | `auth.uid() = user_id` | Users see own transactions  |
| products/prices     | `true`                 | Public read access          |

---

## 11. Testing Strategy

### 11.1 Test Files

| Test Type   | Location                                               | Status |
| ----------- | ------------------------------------------------------ | ------ |
| Unit        | `tests/unit/api/stripe-webhooks.unit.spec.ts`          | Exists |
| Unit        | `tests/unit/subscription-config.unit.spec.ts`          | Exists |
| API         | `tests/api/checkout.api.spec.ts`                       | Exists |
| API         | `tests/api/portal.api.spec.ts`                         | Exists |
| API         | `tests/api/webhooks.api.spec.ts`                       | Exists |
| Integration | `tests/integration/billing-system.integration.spec.ts` | Exists |
| E2E         | `tests/e2e/billing.e2e.spec.ts`                        | Exists |

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
    section Completed Q1 2025
    Regional Dynamic Pricing    :done1, 2025-02-01, 21d
    Proration Preview          :done2, 2025-01-15, 7d
    Credit History API         :done3, 2025-01-20, 5d
    Dispute Handling           :done4, 2025-02-10, 7d
    section Medium Priority
    Credit History UI          :b1, 2025-03-01, 10d
    Low Credit Warnings        :b2, after b1, 7d
    Refund Credit Clawback     :b3, after b2, 5d
    section Low Priority
    Annual Billing             :c1, after b3, 14d
    Trial Period UI            :c2, after c1, 7d
    Subscription Pause/Resume  :c3, after c2, 5d
```

### 14.2 Feature Details

| Feature                  | Description                                   | Status        | PRD                                         |
| ------------------------ | --------------------------------------------- | ------------- | ------------------------------------------- |
| Regional Dynamic Pricing | 40-65% discounts for emerging markets         | **Implemented** | `docs/PRDs/regional-dynamic-pricing.md`     |
| Proration Preview        | Show cost before plan change                  | **Implemented** | -                                           |
| Credit History API       | GET /api/credits/history endpoint             | **Implemented** | -                                           |
| Dispute Handling         | charge.dispute.* webhook handlers             | **Implemented** | -                                           |
| Credit History UI        | Frontend component for transaction history    | Pending       | -                                           |
| Low Credit Warnings      | Email/in-app notifications when credits low   | Pending       | -                                           |
| Refund Credit Clawback   | Automatic credit deduction on refund          | Pending       | -                                           |
| Annual Billing           | Yearly plans with discount                    | Pending       | -                                           |

### 14.3 Completed Features (Recently)

| Feature                       | Completed   | Notes                                             |
| ----------------------------- | ----------- | ------------------------------------------------- |
| Regional Dynamic Pricing      | Mar 2025    | 5 regions with 40-65% discounts                   |
| Credit Pack Purchases         | Feb 2025    | One-time purchases via unified checkout           |
| Proration Preview             | Jan 2025    | `/api/subscription/preview-change` endpoint       |
| Credit History API            | Jan 2025    | `/api/credits/history` with pagination            |
| Dispute Handling              | Feb 2025    | Created/Updated/Closed webhook handlers           |
| Scheduled Cancellation        | Jan 2025    | Downgrades scheduled at period end                |
| Cancel Scheduled Change       | Jan 2025    | `/api/subscription/cancel-scheduled` endpoint     |

---

## Appendix: File Index

### API Routes

- `app/api/checkout/route.ts` - Creates Stripe Checkout Session (subscriptions & credit packs)
- `app/api/portal/route.ts` - Creates Stripe Customer Portal session
- `app/api/webhooks/stripe/route.ts` - Main webhook handler
- `app/api/subscription/change/route.ts` - Plan upgrade/downgrade with proration
- `app/api/subscription/preview-change/route.ts` - Proration preview before plan change
- `app/api/subscription/cancel-scheduled/route.ts` - Cancel scheduled downgrade
- `app/api/subscriptions/cancel/route.ts` - Cancel subscription at period end
- `app/api/credits/history/route.ts` - Paginated credit transaction history
- `app/api/admin/subscription/route.ts` - Admin subscription management
- `app/api/admin/credits/adjust/route.ts` - Admin credit adjustments
- `app/api/cron/recover-webhooks/route.ts` - Webhook recovery cron (every 15 min)
- `app/api/cron/check-expirations/route.ts` - Expiration check cron (hourly)
- `app/api/cron/reconcile/route.ts` - Full reconciliation cron (daily 3 AM UTC)

### Pages

- `app/pricing/page.tsx` - Pricing page with 4 plans + 3 credit packs
- `app/dashboard/billing/page.tsx` - Billing management
- `app/success/page.tsx` - Post-checkout success
- `app/canceled/page.tsx` - Checkout canceled

### Components

- `client/components/stripe/CheckoutModal.tsx`
- `client/components/stripe/PricingCard.tsx`
- `client/components/stripe/CreditsDisplay.tsx`
- `client/components/stripe/SubscriptionStatus.tsx`

### Services

- `server/stripe/stripeService.ts`
- `server/stripe/config.ts`
- `server/stripe/types.ts`
- `server/services/subscription-sync.service.ts` - Shared sync helper functions

### Configuration

- `shared/config/subscription.config.ts` - Plans, credit packs, free tier, warnings
- `shared/config/subscription.types.ts` - TypeScript interfaces
- `shared/config/subscription.utils.ts` - Helper functions
- `shared/config/credits.config.ts` - Credit costs per model/mode
- `shared/config/pricing-regions.ts` - Regional discount mapping
- `shared/config/stripe.ts` - Stripe Price ID mapping

### Database Migrations

- `supabase/migrations/20250120_create_profiles_table.sql`
- `supabase/migrations/20250120_create_subscriptions_table.sql`
- `supabase/migrations/20250121_create_credit_transactions_table.sql`
- `supabase/migrations/20250120_create_rpc_functions.sql`
- `supabase/migrations/20250302_add_sync_tables.sql` - sync_runs table
- `supabase/migrations/20251205_add_trial_end_to_subscriptions.sql`
