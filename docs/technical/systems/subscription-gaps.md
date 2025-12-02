# Subscription System - Gap Analysis

**Date:** December 2, 2025
**Status:** Audit Complete
**System Version:** Subscription-only payment model

---

## Executive Summary

The subscription system is **largely complete and production-ready**. However, there are several gaps ranging from minor UI/UX issues to potential edge cases that could affect user experience or system reliability.

---

## 1. UI/UX Gaps

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

| Feature | Status | Priority |
|---------|--------|----------|
| Annual billing plans | Missing | Medium |
| Team/organization subscriptions | Missing | Low |
| Usage-based billing | Missing | Low |
| Coupon/promo code support | Missing (Stripe has it) | Low |
| Gift subscriptions | Missing | Low |
| Referral credits | Missing | Low |

---

## 7. Recommendations Summary

### High Priority
1. Add subscription upgrade/downgrade flow with proration preview
2. Implement webhook idempotency checks
3. Add refund webhook handlers

### Medium Priority
4. Add credit transaction history UI
5. Add low credit warning notifications
6. Fix homepage free tier messaging
7. Add subscription change preview API

### Low Priority
8. Sync Stripe products/prices to database
9. Add annual billing option
10. Add trial period UI support
11. Add Stripe health check endpoint

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
