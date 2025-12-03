# Subscription System - Gap Analysis

**Date:** December 2, 2025
**Status:** Audit Complete
**System Version:** Subscription-only payment model

---

## Executive Summary

The subscription system is **largely complete and production-ready**. However, there are several gaps ranging from minor UI/UX issues to potential edge cases that could affect user experience or system reliability.

This document organizes gaps using an **Effort x Impact Matrix** to prioritize work effectively.

---

## Priority Matrix

### 🎯 Quick Wins (Low Effort, High Impact)

_Target these first for maximum value_

1. ~~**Homepage Free Tier Mismatch**~~ - ✅ **FIXED** - Config text change
2. ~~**Low Credit Warning**~~ - ✅ **FIXED** - Simple UI indicator
3. ~~**Test Mode Detection Fix**~~ - ✅ **FIXED** - Remove unsafe string check
4. ~~**Credit Transaction History UI**~~ - ✅ **FIXED** - Query existing table

### 🚀 Major Projects (High Effort, High Impact)

_Schedule these strategically_

5. ~~**Upgrade/Downgrade Flow**~~ - ✅ **FIXED** - Full UI + API implementation
6. ~~**Webhook Idempotency**~~ - ✅ **FIXED** - Backend validation system
7. **Refund Handling** - Multiple webhook handlers

### 💡 Fill Ins (Low Effort, Low Impact)

_Do when time permits_

8. ~~**Portal Session Response Type**~~ - ✅ **FIXED** - Type signature fix
9. ~~**Health Check Endpoint**~~ - ✅ **FIXED** - Simple validation endpoint
10. ~~**Multiple Subscriptions Edge Case**~~ - ✅ **RESOLVED** (2025-12-02)

### 🤔 Thankless Tasks (High Effort, Low Impact)

_Defer or skip unless critical need_

11. **Subscription History Table** - Analytics infrastructure
12. **Product/Price Sync** - Database sync system
13. **Pause/Resume Support** - Feature most users won't use

---

## 🎯 Quick Wins (Low Effort, High Impact)

### ✅ QW-1: Homepage Free Tier Mismatch [RESOLVED]

**Effort:** 15 minutes | **Impact:** High (User confusion) | **Priority:** #1

**Location:** `shared/config/stripe.ts:215-233`

**Status:** ✅ **FIXED** - Updated "10 images per month" to "10 free images to start"

**Issue:** `HOMEPAGE_TIERS` showed "10 images per month" but free users only get 10 credits once on signup (no monthly renewal).

**Fix Applied:**

```typescript
// Changed from: "10 images per month"
// Changed to: "10 free images to start"
```

**Files:**

- ✅ `shared/config/stripe.ts` - `HOMEPAGE_TIERS[0]` - FIXED
- ✅ `client/components/pixelperfect/Pricing.tsx` - UPDATED

---

### ✅ QW-2: Low Credit Warning [RESOLVED]

**Effort:** 2-4 hours | **Impact:** High (Prevents user frustration) | **Priority:** #2

**Status:** ✅ **FIXED** - Complete low credit warning system implemented

**Issue:** Users discovered insufficient credits only when attempting an action.

**Fix Applied:**

- ✅ Added threshold check (< 5 credits triggers warning)
- ✅ Added visual warning indicator in CreditsDisplay component with:
  - Color-coded background (amber for low, red for empty)
  - Animated warning dot indicator
  - Hover tooltip with credit status
- ✅ Added toast notification system on dashboard load with:
  - Smart session-based notification (prevents spam)
  - Clear messaging with upgrade suggestions
  - Periodic credit checking (every 5 minutes)

**Files:**

- ✅ `client/components/stripe/CreditsDisplay.tsx` - Visual warning indicators ADDED
- ✅ `client/hooks/useLowCreditWarning.ts` - Toast notification hook CREATED
- ✅ `app/dashboard/layout.tsx` - Hook integration ADDED

---

### ✅ QW-3: Test Mode Detection Security Fix [RESOLVED]

**Effort:** 10 minutes | **Impact:** High (Security vulnerability) | **Priority:** #3

**Location:** `app/api/webhooks/stripe/route.ts:113-116`

**Status:** ✅ **FIXED** - Unsafe string check removed

**Issue:** Unsafe test mode detection checked for "invalid json" string in body, which could be exploited.

**Fix Applied:** Removed the unsafe `body.includes('invalid json')` check. Now uses only secure environment-based detection:

```typescript
const isTestMode =
  serverEnv.STRIPE_SECRET_KEY?.includes('dummy_key') ||
  serverEnv.ENV === 'test' ||
  STRIPE_WEBHOOK_SECRET === 'whsec_test_secret';
```

**Files:**

- ✅ `app/api/webhooks/stripe/route.ts` - SECURITY VULNERABILITY FIXED

---

### ✅ QW-4: Credit Transaction History UI [RESOLVED]

**Effort:** 4-6 hours | **Impact:** High (User transparency) | **Priority:** #4

**Location:** `app/dashboard/billing/page.tsx`

**Status:** ✅ **FIXED** - Credit transaction history fully implemented

**Issue:** `credit_transactions` table existed but wasn't exposed in UI. Users couldn't see:

- How credits were used
- When credits were added
- Credit consumption patterns

**Fix Applied:**

1. ✅ Created `GET /api/credits/history` endpoint
2. ✅ Added service method `StripeService.getCreditHistory()`
3. ✅ Added "Transaction History" section to billing page
4. ✅ Display: Date, Type (earned/used), Amount, Description, Balance

**Files:**

- ✅ `app/api/credits/history/route.ts` - IMPLEMENTED
- ✅ `server/stripe/stripeService.ts` - `getCreditHistory()` method ADDED
- ✅ `app/dashboard/billing/page.tsx` - Transaction history section ADDED
- ✅ `client/components/stripe/CreditHistory.tsx` - New component CREATED

---

## 🚀 Major Projects (High Effort, High Impact)

### ✅ MP-1: Upgrade/Downgrade Flow [RESOLVED]

**Effort:** 2-3 days | **Impact:** Very High (Core feature) | **Priority:** #5

**Status:** ✅ **FIXED** - Full upgrade/downgrade flow implemented

**Issue:** No in-app upgrade/downgrade flow. Users redirected to Stripe Portal for all plan changes.

**Requirements Met:**

1. ✅ API to preview proration costs
2. ✅ API to execute plan change
3. ✅ UI to compare current plan vs target plan
4. ✅ Confirmation modal with proration details
5. ✅ Success/error handling

**Implementation Completed:**

1. ✅ Backend:

   - `POST /api/subscription/preview-change` - Calculate proration
   - `POST /api/subscription/change` - Execute change
   - Added `StripeService.previewPlanChange()`
   - Added `StripeService.changePlan()`

2. ✅ Frontend:
   - Updated `PricingCard` to show "Upgrade" vs "Subscribe"
   - Added "Current Plan" badge
   - Created `PlanChangeModal` component
   - Show proration preview before confirmation

**Files:**

- ✅ `app/api/subscription/preview-change/route.ts` - IMPLEMENTED
- ✅ `app/api/subscription/change/route.ts` - IMPLEMENTED
- ✅ `server/stripe/stripeService.ts` - Methods ADDED
- ✅ `app/pricing/page.tsx` - Current plan logic ADDED
- ✅ `client/components/stripe/PricingCard.tsx` - Updated logic
- ✅ `client/components/stripe/PlanChangeModal.tsx` - New component CREATED

---

### ✅ MP-2: Webhook Idempotency [RESOLVED]

**Effort:** 1-2 days | **Impact:** High (Prevent double-crediting) | **Priority:** #6

**Status:** ✅ **FIXED** - Full webhook idempotency system implemented

**Issue:** No idempotency checks. If Stripe retries webhook, credits could be added twice.

**Current Mitigation:** `ref_id` in `credit_transactions` provides some protection at DB level, but not enforced in webhook handler.

**Fix Applied:**

1. ✅ Created `webhook_events` table:

   ```sql
   CREATE TABLE webhook_events (
     id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
     event_id text UNIQUE NOT NULL,
     event_type text NOT NULL,
     processed_at timestamptz DEFAULT now(),
     status text NOT NULL,
     payload jsonb,
     completed_at timestamptz
   );
   ```

2. ✅ Check `webhook_events` before processing via `checkAndClaimEvent()`
3. ✅ Insert event ID before processing (with status='processing')
4. ✅ Update status to 'completed' or 'failed' after via `markEventCompleted()`

**Files:**

- ✅ `supabase/migrations/20250120_add_webhook_events.sql` - IMPLEMENTED
- ✅ `app/api/webhooks/stripe/route.ts` - Idempotency checks ADDED

---

### MP-3: Refund Handling

**Effort:** 1-2 days | **Impact:** High (Revenue protection) | **Priority:** #7

**Location:** `app/api/webhooks/stripe/route.ts`

**Issue:** No handlers for refund events. Users keep credits after refund.

**Required Webhooks:**

- `charge.refunded` - Full or partial refund
- `charge.dispute.created` - Chargeback initiated
- `invoice.payment_refunded` - Subscription payment refunded

**Fix:**

1. Add webhook handlers for refund events
2. Create RPC function `clawback_credits(user_id, amount, reason)`
3. Handle partial vs full refunds
4. Log refund transactions in `credit_transactions`
5. Consider grace period before clawback

**Files:**

- `app/api/webhooks/stripe/route.ts` - Add handlers
- `supabase/migrations/[timestamp]_add_clawback_rpc.sql` - New RPC function

---

## 💡 Fill Ins (Low Effort, Low Impact)

### ✅ FI-1: Portal Session Response Type [RESOLVED]

**Effort:** 5 minutes | **Impact:** Low (Type consistency) | **Priority:** #8

**Location:** `client/services/stripeService.ts:308-309`

**Status:** ✅ **FIXED** - Type consistency resolved

**Issue:** Minor inconsistency between service return type and API response wrapper.

**Fix Applied:** Updated service layer to properly extract data from wrapped API response:

```typescript
// Before: return response.json(); // Returns { success, data: { url } }
// After:
const result = await response.json();
return result.data; // Extract { url } from { success, data: { url } }
```

**Files:**

- ✅ `client/services/stripeService.ts` - Response handling FIXED

---

### ✅ FI-2: Stripe Health Check Endpoint [RESOLVED]

**Effort:** 1-2 hours | **Impact:** Low (Ops convenience) | **Priority:** #9

**Status:** ✅ **FIXED** - Health check endpoint implemented

**Issue:** No way to verify Stripe configuration is valid.

**Fix Applied:**

```typescript
// GET /api/health/stripe
{
  stripe_configured: boolean,
  webhook_secret_valid: boolean,
  api_key_valid: boolean,
  test_mode: boolean,
  error: string | null
}
```

**Files:**

- ✅ `app/api/health/stripe/route.ts` - IMPLEMENTED

---

### ✅ FI-3: Multiple Active Subscriptions Edge Case [RESOLVED]

**Effort:** 30 minutes | **Impact:** Low (Rare edge case) | **Priority:** #10

**Location:** `app/api/checkout/route.ts:90-111`

**Status:** ✅ **FIXED** - Implemented on 2025-12-02

**Solution Implemented:**

- Added active subscription check in checkout endpoint before creating Stripe Checkout session
- Query checks for subscriptions with status 'active' or 'trialing'
- Returns 400 error with code 'ALREADY_SUBSCRIBED' if user has existing subscription
- Users are directed to billing portal for plan changes
- Includes comprehensive test coverage for active, trialing, and canceled subscription scenarios

**Test Coverage:**

- `tests/api/checkout.api.spec.ts:295-341` - Active subscription rejection
- `tests/api/checkout.api.spec.ts:343-389` - Trialing subscription rejection
- `tests/api/checkout.api.spec.ts:391-441` - Allows checkout for canceled subscriptions

---

## 🤔 Thankless Tasks (High Effort, Low Impact)

### TT-1: Subscription History Table

**Effort:** 1-2 days | **Impact:** Low (Analytics only) | **Priority:** #11

**Location:** Database schema

**Issue:** No history of past subscriptions (current design updates via upsert).

**Use Case:** Churn analysis, "Welcome back" messaging

**Defer Unless:** Analytics becomes critical business need.

---

### TT-2: Product/Price Sync from Stripe

**Effort:** 2-3 days | **Impact:** Low (Current approach works) | **Priority:** #12

**Location:** `supabase/migrations/20250120_create_subscriptions_table.sql`

**Issue:** `products` and `prices` tables unused. System uses hardcoded `SUBSCRIPTION_PRICE_MAP`.

**Defer Unless:** Frequent price changes or multi-product catalog needed.

---

### TT-3: Subscription Pause/Resume Support

**Effort:** 2-3 days | **Impact:** Low (Niche feature) | **Priority:** #13

**Location:** Webhooks, API, UI

**Issue:** No pause/resume functionality (though Stripe supports it).

**Defer Unless:** User research shows demand.

---

## Detailed Gap Documentation

### 1. UI/UX Gaps

### 1.1 Missing Plan Comparison View

**Severity:** Medium
**Location:** `/app/pricing/page.tsx`

**Issue:** When a user already has an active subscription, there's no clear comparison between their current plan and other plans. Users can see their current plan name but cannot easily compare features or understand upgrade/downgrade implications.

**Expected:** Show "Current Plan" badge, highlight differences, show what they'd gain/lose on change.

**Files Affected:**

- `app/pricing/page.tsx`
- `client/components/stripe/PricingCard.tsx`

---

### 1.2 No Upgrade/Downgrade Flow

**Severity:** High
**Location:** N/A (Missing)

**Issue:** The system only supports new subscriptions. There is no in-app flow for:

- Upgrading from Hobby to Pro/Business
- Downgrading from Business to Pro/Hobby
- Users are redirected to Stripe Portal for all changes

**Expected:** Dedicated upgrade/downgrade confirmation with proration preview before redirecting to Stripe.

**Files Affected:**

- `app/pricing/page.tsx` - No "Upgrade" vs "Subscribe" button differentiation
- `client/components/stripe/PricingCard.tsx` - Always shows "Subscribe Now"

---

### 1.3 No Trial Period Support in UI

**Severity:** Low
**Location:** `app/pricing/page.tsx`, `shared/config/stripe.ts`

**Issue:** While the database schema supports `trialing` status and the webhook handles it, there's no UI support for:

- Showing trial information on pricing cards
- Displaying trial end date on billing page
- Showing "Start Trial" instead of "Subscribe Now"

**Expected:** If plans have trial periods, UI should reflect this.

**Files Affected:**

- `shared/config/stripe.ts` - `SUBSCRIPTION_PLANS` has no trial metadata
- `client/components/stripe/PricingCard.tsx` - No trial display

---

### 1.4 Credit Usage History Missing

**Severity:** Medium
**Location:** `/app/dashboard/billing/page.tsx`

**Issue:** Users can see their current credit balance but cannot view:

- How credits were used (transaction history)
- When credits were added (renewal dates)
- Credit consumption patterns

The `credit_transactions` table exists but is not exposed in the UI.

**Expected:** Credit history/transaction log accessible from billing page.

**Files Affected:**

- `app/dashboard/billing/page.tsx` - No transaction history section
- `server/stripe/stripeService.ts` - No `getCreditHistory()` method

---

### 1.5 No Low Credit Warning

**Severity:** Medium
**Location:** N/A (Missing)

**Issue:** Users receive no warning when their credit balance is low. They discover insufficient credits only when attempting an action.

**Expected:**

- In-app notification when credits fall below threshold
- Email notification option
- Warning banner in dashboard

**Files Affected:**

- `client/components/stripe/CreditsDisplay.tsx` - No low balance indicator
- `app/dashboard/` - No warning banners

---

### 1.6 Cancellation Flow Lacks Retention

**Severity:** Low
**Location:** Stripe Portal (external)

**Issue:** Users cancel via Stripe Portal with no opportunity for:

- Feedback collection
- Pause subscription option
- Retention offers

This is acceptable since Stripe Portal handles cancellation, but consider custom cancellation flow.

---

### 1.7 Homepage Free Tier Mismatch

**Severity:** Low
**Location:** `shared/config/stripe.ts:215-233`

**Issue:** `HOMEPAGE_TIERS` includes a "Free Tier" with 10 images/month, but this doesn't match the actual free tier behavior (10 credits on signup, no monthly renewal).

**Current:** Free users get 10 credits once on signup.
**Displayed:** "10 images per month" implies monthly refresh.

**Files Affected:**

- `shared/config/stripe.ts` - `HOMEPAGE_TIERS[0]`
- `client/components/pixelperfect/Pricing.tsx`

---

## 2. API Gaps

### 2.1 No Subscription Change Endpoint

**Severity:** Medium
**Location:** N/A (Missing)

**Issue:** No API endpoint to preview or initiate subscription changes (upgrade/downgrade). Users must use Stripe Portal.

**Expected:**

- `POST /api/subscription/preview-change` - Get proration preview
- `POST /api/subscription/change` - Change plan with confirmation

---

### 2.2 StripeService.createPortalSession Response Mismatch

**Severity:** Low
**Location:** `server/stripe/stripeService.ts:250-273`

**Issue:** `createPortalSession()` returns `{ url }` but `redirectToPortal()` expects the same format. The API response is wrapped in `{ success, data: { url } }` but the service extracts correctly. Minor inconsistency in return type.

```typescript
// Returns { url: string } but API returns { success, data: { url } }
static async createPortalSession(): Promise<{ url: string }>
```

---

### 2.3 Missing Credit Transaction Endpoint

**Severity:** Medium
**Location:** N/A (Missing)

**Issue:** No API endpoint to retrieve credit transaction history for the authenticated user.

**Expected:** `GET /api/credits/history` - Returns paginated credit transactions

---

### 2.4 No Subscription Pause/Resume Support

**Severity:** Low
**Location:** Webhooks, API

**Issue:** Stripe supports subscription pausing, but the system has no:

- API endpoint to pause
- Webhook handler for pause events
- UI for pause status

---

### 2.5 Webhook Idempotency Not Enforced

**Severity:** Medium
**Location:** `app/api/webhooks/stripe/route.ts`

**Issue:** Webhook handlers don't check for duplicate event processing. If Stripe retries a webhook, credits could be added twice.

**Risk:** The `ref_id` in `credit_transactions` should prevent duplicates at the database level, but explicit idempotency checks are missing.

**Mitigation:** The RPC functions use `ref_id` for logging but don't prevent duplicate calls with the same `ref_id`.

---

### 2.6 No Health Check for Stripe Integration

**Severity:** Low
**Location:** N/A (Missing)

**Issue:** No endpoint to verify Stripe configuration is valid (keys work, webhook secret is correct).

**Expected:** `GET /api/health/stripe` - Validate configuration

---

## 3. Database/Backend Gaps

### 3.1 Products/Prices Tables Not Synced

**Severity:** Low
**Location:** `supabase/migrations/20250120_create_subscriptions_table.sql`

**Issue:** The `products` and `prices` tables exist but are never populated. The system uses hardcoded `SUBSCRIPTION_PRICE_MAP` instead.

**Impact:** Low - the current approach works, but Stripe product catalog changes require code updates.

---

### 3.2 No Subscription History Table

**Severity:** Low
**Location:** Database schema

**Issue:** When a user cancels and re-subscribes, the old subscription is updated (upsert). There's no history of past subscriptions.

**Impact:** Can't analyze churn or provide "Welcome back" experiences.

---

### 3.3 Credit Balance Can Go Negative

**Severity:** Medium
**Location:** `supabase/migrations/20250120_create_rpc_functions.sql`

**Issue:** The `decrement_credits` RPC checks for sufficient credits but the check and decrement aren't atomic in a transaction lock.

**Risk:** Race condition under high concurrency could result in negative balance.

**Mitigation:** The current implementation uses `SECURITY DEFINER` and updates atomically, but explicit locking may be needed.

---

### 3.4 No Refund Handling

**Severity:** Medium
**Location:** `app/api/webhooks/stripe/route.ts`

**Issue:** No webhook handler for:

- `charge.refunded`
- `charge.dispute.created`
- `invoice.payment_refunded`

Users could receive credits and then get refunded without credit clawback.

---

## 4. Security Gaps

### 4.1 Test Mode Detection Overly Broad

**Severity:** Medium
**Location:** `app/api/webhooks/stripe/route.ts:25-30`

**Issue:** Test mode is detected with multiple conditions including checking for "invalid json" in body:

```typescript
body.includes('invalid json');
```

This could potentially be exploited if an attacker crafts a request containing "invalid json" string.

**Recommendation:** Remove the `invalid json` check. Use only environment-based detection.

---

### 4.2 No Rate Limiting on Checkout

**Severity:** Low
**Location:** `app/api/checkout/route.ts`

**Issue:** No rate limiting on checkout session creation. A malicious user could spam checkout requests.

**Mitigation:** Stripe has its own rate limits, but app-level limits would be better.

---

### 4.3 Credit RPC Functions Accessible to All Authenticated Users

**Severity:** Low
**Location:** Database RPC functions

**Issue:** While the functions check `target_user_id = auth.uid()`, the functions themselves are callable by any authenticated user. Review RLS on function execution.

---

## 5. Edge Cases Not Handled

### 5.1 Multiple Active Subscriptions

**Severity:** Low
**Location:** `server/stripe/stripeService.ts:115-139`

**Issue:** `getActiveSubscription()` uses `.single()` which will error if a user somehow has multiple active subscriptions. Should use `.limit(1).single()` with proper ordering (already present, but edge case exists).

---

### 5.2 Currency Mismatch

**Severity:** Low
**Location:** `shared/config/stripe.ts`

**Issue:** All prices hardcoded in USD. No support for:

- Multi-currency pricing
- Currency display based on user locale

---

### 5.3 Annual Billing Not Supported

**Severity:** Medium
**Location:** `shared/config/stripe.ts`

**Issue:** Only monthly subscription plans are configured. Common SaaS practice includes annual plans with discounts.

---

## 6. Missing Features (Not Gaps)

These are common subscription features not present but may not be required:

| Feature                         | Status                  | Priority |
| ------------------------------- | ----------------------- | -------- |
| Annual billing plans            | Missing                 | Medium   |
| Team/organization subscriptions | Missing                 | Low      |
| Usage-based billing             | Missing                 | Low      |
| Coupon/promo code support       | Missing (Stripe has it) | Low      |
| Gift subscriptions              | Missing                 | Low      |
| Referral credits                | Missing                 | Low      |

---

## Implementation Roadmap

### Sprint 1: Quick Wins (1 week)

Execute all Quick Wins for immediate value:

- QW-1: Homepage Free Tier Mismatch (15 min)
- QW-3: Test Mode Detection Fix (10 min)
- QW-2: Low Credit Warning (2-4 hours)
- QW-4: Credit Transaction History UI (4-6 hours)

**Total effort:** ~1 week | **Value:** High user satisfaction improvements

### Sprint 2: Security & Reliability (1 week)

Address critical backend gaps:

- MP-2: Webhook Idempotency (1-2 days)
- MP-3: Refund Handling (1-2 days)

**Total effort:** 1 week | **Value:** Prevent revenue loss and data corruption

### Sprint 3: Core Feature (2-3 weeks)

Major feature implementation:

- MP-1: Upgrade/Downgrade Flow (2-3 days)

**Total effort:** 2-3 weeks | **Value:** Essential SaaS functionality

### Backlog: Fill Ins & Thankless Tasks

Handle when time permits or specific need arises:

- Fill Ins (FI-1, FI-2, FI-3): Low priority polish
- Thankless Tasks (TT-1, TT-2, TT-3): Only if business requirements change

---

## Effort x Impact Visual Matrix

```
High Impact
     ↑
     │  QW-1,2,3,4    │  MP-1,2,3
     │  Quick Wins    │  Major Projects
     │  DO FIRST      │  SCHEDULE NEXT
     ├───────────────┼─────────────────
     │  FI-1,2,3      │  TT-1,2,3
     │  Fill Ins      │  Thankless Tasks
     │  WHEN TIME     │  RECONSIDER
     │                │
Low Impact            →  High Effort
```

---

## Appendix: Files Reviewed

- `app/api/checkout/route.ts`
- `app/api/portal/route.ts`
- `app/api/webhooks/stripe/route.ts`
- `app/pricing/page.tsx`
- `app/dashboard/billing/page.tsx`
- `app/success/page.tsx`
- `client/components/stripe/CheckoutModal.tsx`
- `client/components/stripe/PricingCard.tsx`
- `client/components/stripe/CreditsDisplay.tsx`
- `client/components/stripe/SubscriptionStatus.tsx`
- `server/stripe/stripeService.ts`
- `shared/config/stripe.ts`
- `supabase/migrations/20250120_create_profiles_table.sql`
- `supabase/migrations/20250120_create_subscriptions_table.sql`
- `supabase/migrations/20250121_create_credit_transactions_table.sql`
