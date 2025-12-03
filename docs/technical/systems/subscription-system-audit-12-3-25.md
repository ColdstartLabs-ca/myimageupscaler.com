# Subscription System Security Audit

**Audit Date:** December 3, 2025
**Auditor:** Claude (Automated Code Review)
**System Version:** 2.0 (Subscription-Only Model)
**Overall Risk Assessment:** MEDIUM

---

## Executive Summary

The subscription system is **largely production-ready** with solid foundational architecture. The recent implementation of cron-based synchronization (December 2, 2025) significantly improved system resilience. However, this audit identified **5 critical issues** and **8 medium-priority gaps** that require attention.

| Category                   | Count | Max Severity |
| -------------------------- | ----- | ------------ |
| Critical Security Issues   | 2     | HIGH         |
| Critical Functional Issues | 3     | MEDIUM       |
| Medium Priority Gaps       | 8     | MEDIUM       |
| Low Priority Issues        | 6     | LOW          |

**Implementation Completeness:** ~85%

---

## Effort vs Impact Matrix (Quick Wins First)

### Legend

- **Effort:** Low (< 1 hour), Medium (1-4 hours), High (4+ hours)
- **Impact:** How much risk/value the fix addresses

```
                    HIGH IMPACT
                         │
    ┌────────────────────┼────────────────────┐
    │                    │                    │
    │   QUICK WINS       │   BIG BETS         │
    │   (Do First)       │   (Plan & Execute) │
    │                    │                    │
    │ • CRITICAL-1       │ • CRITICAL-2       │
    │ • CRITICAL-3       │ • MEDIUM-1         │
    │ • CRITICAL-4       │ • MEDIUM-7         │
    │ • MEDIUM-3         │ • MEDIUM-8         │
    │                    │                    │
LOW ─┼────────────────────┼────────────────────┼─ HIGH
EFFORT                   │                    │  EFFORT
    │                    │                    │
    │   FILL-INS         │   DEPRIORITIZE     │
    │   (When Time)      │   (Maybe Later)    │
    │                    │                    │
    │ • CRITICAL-5       │ • LOW-1 to LOW-6   │
    │ • MEDIUM-2         │                    │
    │ • MEDIUM-4         │                    │
    │ • MEDIUM-5         │                    │
    │ • MEDIUM-6         │                    │
    │                    │                    │
    └────────────────────┼────────────────────┘
                         │
                    LOW IMPACT
```

### Prioritized Action List

| Priority | Issue                                  | Effort             | Impact       | Fix                                            |
| -------- | -------------------------------------- | ------------------ | ------------ | ---------------------------------------------- |
| **1**    | CRITICAL-1: RPC Cross-User Credit      | **LOW** (15 min)   | **CRITICAL** | Single SQL migration to revoke `authenticated` |
| **2**    | CRITICAL-3: Silent Event Completion    | **LOW** (10 min)   | **HIGH**     | Change `console.error` to `throw`              |
| **3**    | CRITICAL-4: Test Mode OR Conditions    | **LOW** (15 min)   | **HIGH**     | Change OR to AND, add production guard         |
| **4**    | MEDIUM-3: No Amount Validation         | **LOW** (20 min)   | **MEDIUM**   | Add `IF amount <= 0` check to RPC              |
| **5**    | CRITICAL-2: Refund Clawback            | **MEDIUM** (2 hrs) | **CRITICAL** | Wire existing RPC to webhook handler           |
| **6**    | CRITICAL-5: Stale Subscription Data    | **MEDIUM** (1 hr)  | **MEDIUM**   | Re-fetch before Stripe update                  |
| **7**    | MEDIUM-2: Unhandled Webhook Types      | **LOW** (30 min)   | **LOW**      | Mark as `unhandled` status                     |
| **8**    | MEDIUM-1: Test/Prod Duplication        | **MEDIUM** (2 hrs) | **MEDIUM**   | Extract shared logic                           |
| **9**    | MEDIUM-7: Sync Failure Monitoring      | **MEDIUM** (3 hrs) | **MEDIUM**   | Add alerting integration                       |
| **10**   | MEDIUM-4: Stripe Error Differentiation | **MEDIUM** (1 hr)  | **LOW**      | Add error type handling                        |
| **11**   | MEDIUM-5: Invoice Reference            | **LOW** (30 min)   | **LOW**      | Add invoice ID to ref_id                       |
| **12**   | MEDIUM-6: Portal URL Logging           | **LOW** (10 min)   | **LOW**      | Reduce log verbosity                           |
| **13**   | MEDIUM-8: Hardcoded Price IDs          | **HIGH** (4+ hrs)  | **LOW**      | Implement Stripe sync                          |
| **14**   | LOW-1 to LOW-6                         | Various            | **LOW**      | See Low Priority section                       |

### Quick Wins Summary (Do Today)

These 4 fixes can be completed in **~1 hour total** and address **3 critical + 1 medium** issues:

1. **CRITICAL-1** - Run single migration:

   ```sql
   REVOKE EXECUTE ON FUNCTION public.increment_credits FROM authenticated;
   REVOKE EXECUTE ON FUNCTION public.increment_credits_with_log FROM authenticated;
   REVOKE EXECUTE ON FUNCTION public.decrement_credits FROM authenticated;
   REVOKE EXECUTE ON FUNCTION public.decrement_credits_with_log FROM authenticated;
   REVOKE EXECUTE ON FUNCTION public.refund_credits FROM authenticated;
   ```

2. **CRITICAL-3** - One line change in `markEventCompleted()`:

   ```typescript
   // Change: console.error(...) to throw new Error(...)
   ```

3. **CRITICAL-4** - Change OR to AND in webhook handler:

   ```typescript
   const isTestMode =
     serverEnv.ENV === 'test' && serverEnv.STRIPE_SECRET_KEY?.includes('dummy_key');
   ```

4. **MEDIUM-3** - Add validation to RPC functions:
   ```sql
   IF amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
   ```

---

## Table of Contents

1. [Critical Issues - Immediate Action Required](#1-critical-issues---immediate-action-required)
2. [End-to-End Flow Analysis](#2-end-to-end-flow-analysis)
3. [Security Vulnerabilities](#3-security-vulnerabilities)
4. [Race Conditions & Concurrency](#4-race-conditions--concurrency)
5. [Documentation vs Implementation Gaps](#5-documentation-vs-implementation-gaps)
6. [Medium Priority Issues](#6-medium-priority-issues)
7. [Low Priority Issues](#7-low-priority-issues)
8. [Recommendations](#8-recommendations)
9. [Files Audited](#9-files-audited)

---

## 1. Critical Issues - Immediate Action Required

### CRITICAL-1: RPC Functions Allow Cross-User Credit Manipulation

**Severity:** HIGH
**File:** `supabase/migrations/20250120_create_rpc_functions.sql:3-16`
**File:** `supabase/migrations/20250121_enhanced_credit_functions.sql:5-39`

**Problem:**

The `increment_credits`, `increment_credits_with_log`, and related functions are granted to `authenticated` role but do NOT validate that `target_user_id` matches `auth.uid()`.

```sql
-- Current: No authorization check
CREATE OR REPLACE FUNCTION public.increment_credits(target_user_id UUID, amount INTEGER)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.profiles
  SET credits_balance = credits_balance + amount
  WHERE id = target_user_id;  -- ANY user ID accepted!
$$;

GRANT EXECUTE ON FUNCTION public.increment_credits(UUID, INTEGER) TO authenticated;
```

**Attack Vector:**

An authenticated user can call from client-side:

```typescript
await supabase.rpc('increment_credits', {
  target_user_id: 'other-users-uuid',
  amount: 10000,
});
```

This bypasses RLS because `SECURITY DEFINER` runs with the function owner's privileges.

**Impact:** Any authenticated user can grant unlimited credits to any account, including their own.

**Recommended Fix:**

Option A - Restrict to service_role only:

```sql
REVOKE EXECUTE ON FUNCTION public.increment_credits FROM authenticated;
-- Only webhooks and server-side code can call it
```

Option B - Add authorization check:

```sql
CREATE OR REPLACE FUNCTION public.increment_credits(target_user_id UUID, amount INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only allow self-modification or service role
  IF auth.uid() IS NOT NULL AND auth.uid() != target_user_id THEN
    RAISE EXCEPTION 'Not authorized to modify other users credits';
  END IF;

  UPDATE public.profiles
  SET credits_balance = credits_balance + amount
  WHERE id = target_user_id;
END;
$$;
```

**Note:** This affects ALL credit RPC functions:

- `increment_credits`
- `increment_credits_with_log`
- `decrement_credits`
- `decrement_credits_with_log`
- `refund_credits`

---

### CRITICAL-2: Refund Credit Clawback Not Implemented

**Severity:** HIGH (Financial Impact)
**File:** `app/api/webhooks/stripe/route.ts:567-595`

**Problem:**

The `handleChargeRefunded` function logs refunds but does NOT deduct credits:

```typescript
async function handleChargeRefunded(charge: any) {
  // ... gets user ID ...

  // For now, log the refund - the clawback logic will be implemented later
  console.log(`Charge ${charge.id} refunded ${refundAmount} cents for user ${userId}`);

  // TODO: Implement credit clawback logic when database migrations are applied
}
```

**However**, the clawback RPC function **already exists**:

```sql
-- File: supabase/migrations/20250202_add_credit_clawback_rpc.sql
CREATE OR REPLACE FUNCTION clawback_credits(
  p_target_user_id UUID,
  p_amount INTEGER,
  ...
)
```

**Impact:**

- Users keep credits after refunds
- Direct revenue leak
- Abuse potential: User subscribes, uses credits, requests refund, keeps credits

**Recommended Fix:**

Update `handleChargeRefunded` to call the existing RPC:

```typescript
async function handleChargeRefunded(charge: any) {
  // ... existing user lookup ...

  // Calculate credits to clawback (proportional to refund)
  const originalAmount = charge.amount || 0;
  const refundAmount = charge.amount_refunded || 0;

  // Get the invoice/subscription to determine original credits added
  const invoiceId = charge.invoice;
  if (invoiceId) {
    const { data: result, error } = await supabaseAdmin.rpc('clawback_credits_from_transaction', {
      p_target_user_id: userId,
      p_original_ref_id: `invoice_${invoiceId}`,
      p_reason: `Refund for charge ${charge.id}`,
    });

    if (error) {
      console.error('Failed to clawback credits:', error);
      throw error;
    }

    console.log(`Clawed back credits for refund: ${JSON.stringify(result)}`);
  }
}
```

---

### CRITICAL-3: Silent Failure in Webhook Event Completion

**Severity:** MEDIUM
**File:** `app/api/webhooks/stripe/route.ts:62-75`

**Problem:**

```typescript
async function markEventCompleted(eventId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('webhook_events')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('event_id', eventId);

  if (error) {
    console.error(`Failed to mark event ${eventId} as completed:`, error);
    // Don't throw - event was processed successfully  <-- PROBLEM
  }
}
```

**Impact:**

If the database update fails but the webhook was processed:

1. Event status remains `processing` forever
2. Webhook returns 200 OK to Stripe
3. Recovery cron will never retry it (it's not `failed`)
4. Creates orphaned "ghost" events

**Recommended Fix:**

```typescript
async function markEventCompleted(eventId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('webhook_events')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('event_id', eventId);

  if (error) {
    console.error(`Failed to mark event ${eventId} as completed:`, error);
    // Throw to trigger 500 response - Stripe will retry
    throw new Error(`Database error marking event completed: ${error.message}`);
  }
}
```

---

### CRITICAL-4: Test Mode OR Conditions Too Permissive

**Severity:** MEDIUM
**File:** `app/api/webhooks/stripe/route.ts:113-116`

**Problem:**

```typescript
const isTestMode =
  serverEnv.STRIPE_SECRET_KEY?.includes('dummy_key') ||
  serverEnv.ENV === 'test' ||
  STRIPE_WEBHOOK_SECRET === 'whsec_test_secret'; // <-- Dangerous
```

If `STRIPE_WEBHOOK_SECRET` is accidentally left as `whsec_test_secret` in production (misconfiguration), signature verification is completely bypassed.

**Impact:**

Attackers could send fake webhook events without valid signatures to:

- Add credits to any account
- Activate subscriptions without payment
- Manipulate subscription status

**Recommended Fix:**

Use AND conditions, not OR:

```typescript
const isTestMode = serverEnv.ENV === 'test' && serverEnv.STRIPE_SECRET_KEY?.includes('dummy_key');

// Webhook secret should NEVER be the test value in production
if (STRIPE_WEBHOOK_SECRET === 'whsec_test_secret' && serverEnv.ENV !== 'test') {
  console.error('CRITICAL: Test webhook secret detected in non-test environment!');
  return NextResponse.json({ error: 'Misconfigured webhook secret' }, { status: 500 });
}
```

---

### CRITICAL-5: Stale Subscription Item IDs in Plan Changes

**Severity:** MEDIUM
**File:** `app/api/subscription/change/route.ts:95-225`

**Problem:**

Subscription data is fetched at line 96, but used to update Stripe ~130 lines later:

```typescript
// Line 96: Fetch subscription
const { data: currentSubscription } = await supabaseAdmin
  .from('subscriptions')
  .select('*')
  .eq('user_id', user.id)
  .in('status', ['active', 'trialing'])
  .single();

// ... validation, credit calculations ...

// Line 220+: Use stale item ID
const subscription = await stripe.subscriptions.retrieve(currentSubscription.id);
const updatedSubscription = await stripe.subscriptions.update(currentSubscription.id, {
  items: [
    {
      id: subscription.items.data[0]?.id, // Could be stale!
      price: body.targetPriceId,
    },
  ],
});
```

**Impact:**

If user initiates plan change in Stripe Portal while our API is processing:

- Our update may fail with confusing errors
- Could create unexpected prorations
- Race condition in concurrent requests

**Recommended Fix:**

Fetch fresh data immediately before the Stripe update:

```typescript
// Immediately before update, get fresh state
const latestSubscription = await stripe.subscriptions.retrieve(currentSubscription.id);

// Validate it hasn't changed
if (latestSubscription.items.data[0]?.price.id !== currentSubscription.price_id) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'SUBSCRIPTION_MODIFIED',
        message: 'Subscription was modified. Please refresh and try again.',
      },
    },
    { status: 409 }
  );
}

const updatedSubscription = await stripe.subscriptions.update(currentSubscription.id, {
  items: [
    {
      id: latestSubscription.items.data[0]?.id, // Fresh ID
      price: body.targetPriceId,
    },
  ],
});
```

---

## 2. End-to-End Flow Analysis

### 2.1 New Subscription Purchase Flow

```
User → Pricing Page → Checkout API → Stripe Checkout → Webhook → Database
```

| Step                                   | Status    | Issues                                    |
| -------------------------------------- | --------- | ----------------------------------------- |
| Price validation                       | OK        | Hardcoded prices, not synced from Stripe  |
| Customer creation                      | OK        | Minor: orphaned customers on DB failure   |
| Checkout session                       | OK        | Properly creates embedded/hosted checkout |
| Webhook: checkout.session.completed    | OK        | Adds initial credits correctly            |
| Webhook: customer.subscription.created | OK        | Creates subscription record               |
| Credit allocation                      | **ISSUE** | RPC allows cross-user manipulation        |
| Idempotency                            | OK        | Proper atomic claim with 23505 handling   |

**Flow Rating:** MEDIUM RISK (due to RPC vulnerability)

---

### 2.2 Monthly Renewal Flow

```
Stripe Billing → invoice.payment_succeeded → Webhook → Credits Added
```

| Step               | Status    | Issues                         |
| ------------------ | --------- | ------------------------------ |
| Invoice generation | OK        | Stripe handles automatically   |
| Payment processing | OK        | Stripe handles automatically   |
| Webhook delivery   | OK        | With idempotency protection    |
| Credit calculation | OK        | Rollover cap properly enforced |
| Credit allocation  | **ISSUE** | Same RPC vulnerability         |
| Period update      | OK        | Updates current_period_end     |

**Rollover Logic Review:**

```typescript
// Correctly implements cap
const newBalance = currentBalance + creditsToAdd;
if (newBalance > maxRollover) {
  creditsToAdd = Math.max(0, maxRollover - currentBalance);
}
```

**Flow Rating:** LOW RISK (assuming RPC is fixed)

---

### 2.3 Plan Change Flow (Upgrade/Downgrade)

```
User → /api/subscription/change → Stripe Update → Webhook → Database
```

| Step                    | Status    | Issues                     |
| ----------------------- | --------- | -------------------------- |
| Authentication          | OK        | Bearer token validated     |
| Current plan validation | OK        | Prevents same-plan changes |
| Stale data fetch        | **ISSUE** | CRITICAL-5: stale item IDs |
| Stripe update           | OK        | Proper proration behavior  |
| Credit adjustment       | OK        | Only adds on upgrade       |
| Test/prod duplication   | **ISSUE** | Code maintenance risk      |

**Flow Rating:** MEDIUM RISK

---

### 2.4 Refund Flow

```
Stripe Refund → charge.refunded → Webhook → (No Credit Clawback)
```

| Step                   | Status       | Issues                   |
| ---------------------- | ------------ | ------------------------ |
| Webhook receipt        | OK           | Event is received        |
| Signature verification | OK           | Properly verified        |
| User lookup            | OK           | Finds user from customer |
| Credit clawback        | **CRITICAL** | Not implemented!         |
| Transaction logging    | PARTIAL      | Logs but no action       |

**Flow Rating:** HIGH RISK (revenue leak)

---

### 2.5 Subscription Cancellation Flow

```
User → Stripe Portal OR /api/subscriptions/cancel → Webhook → Database
```

| Step                 | Status | Issues                             |
| -------------------- | ------ | ---------------------------------- |
| Initiation           | OK     | Both paths work                    |
| Stripe update        | OK     | Sets cancel_at_period_end          |
| Webhook processing   | OK     | Updates local status               |
| Access continuation  | OK     | User keeps access until period_end |
| Expiration detection | OK     | Cron catches missed webhooks       |

**Flow Rating:** LOW RISK

---

### 2.6 Cron Synchronization Flow

```
Cloudflare Cron → API Endpoints → Stripe API → Database Sync
```

| Job                 | Schedule       | Status | Issues                  |
| ------------------- | -------------- | ------ | ----------------------- |
| Webhook Recovery    | Every 15 min   | OK     | No concurrent run guard |
| Expiration Check    | Hourly at :05  | OK     | No concurrent run guard |
| Full Reconciliation | Daily 3 AM UTC | OK     | No concurrent run guard |

**Cron Authentication:**

```typescript
const cronSecret = request.headers.get('x-cron-secret');
if (cronSecret !== serverEnv.CRON_SECRET) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

✅ Properly protected with secret header

**Flow Rating:** LOW RISK

---

## 3. Security Vulnerabilities

### 3.1 Authentication & Authorization

| Check               | Status      | Notes                        |
| ------------------- | ----------- | ---------------------------- |
| API authentication  | OK          | Bearer token validation      |
| Webhook signature   | **PARTIAL** | OR conditions too permissive |
| RPC authorization   | **FAIL**    | No user-level checks         |
| RLS policies        | OK          | Tables have proper policies  |
| Cron authentication | OK          | Secret header required       |

### 3.2 Input Validation

| Endpoint                 | Status   | Notes                     |
| ------------------------ | -------- | ------------------------- |
| /api/checkout            | OK       | Validates price ID        |
| /api/portal              | OK       | Validates customer exists |
| /api/subscription/change | OK       | Validates target price    |
| /api/webhooks/stripe     | OK       | Validates signature       |
| RPC functions            | **FAIL** | No amount validation      |

**Missing in `increment_credits_with_log`:**

```sql
-- Should validate:
IF amount <= 0 THEN
  RAISE EXCEPTION 'Amount must be positive';
END IF;
```

### 3.3 Data Exposure

| Risk                    | Status | Notes                   |
| ----------------------- | ------ | ----------------------- |
| Credit balance exposure | OK     | RLS protected           |
| Subscription details    | OK     | User can only see own   |
| Customer portal         | OK     | Stripe handles security |
| Webhook payloads        | OK     | Not exposed to client   |

---

## 4. Race Conditions & Concurrency

### 4.1 Webhook Event Claiming

**File:** `app/api/webhooks/stripe/route.ts:20-56`

**Pattern:** Check-then-act with unique constraint fallback

```typescript
// Check
const { data: existing } = await supabaseAdmin
  .from('webhook_events')
  .select('status')
  .eq('event_id', eventId)
  .single();

if (existing) return { isNew: false, existingStatus: existing.status };

// Insert (gap here allows race)
const { error: insertError } = await supabaseAdmin.from('webhook_events').insert({...});

// Catches race via unique constraint
if (insertError?.code === '23505') {
  return { isNew: false, existingStatus: 'processing' };
}
```

**Assessment:** ACCEPTABLE - The pattern handles races correctly via unique constraint violation. Could be optimized with upsert but current implementation is safe.

---

### 4.2 Credit Decrement Locking

**File:** `supabase/migrations/20250121_enhanced_credit_functions.sql:42-84`

**Pattern:** SELECT FOR UPDATE before decrement

```sql
SELECT credits_balance INTO current_balance
FROM public.profiles
WHERE id = target_user_id
FOR UPDATE;  -- Row lock!
```

**Assessment:** CORRECT - Proper pessimistic locking prevents double-spend.

---

### 4.3 Concurrent Cron Runs

**Files:** All `/api/cron/*` endpoints

**Issue:** No distributed lock to prevent concurrent execution if Cloudflare runs multiple instances.

**Assessment:** LOW RISK - Operations are idempotent, so concurrent runs cause inefficiency but not corruption.

**Improvement (optional):**

```sql
-- Add to sync_runs table
SELECT * FROM sync_runs
WHERE job_type = 'expiration_check'
  AND status = 'running'
  AND started_at > NOW() - INTERVAL '10 minutes'
FOR UPDATE SKIP LOCKED;
```

---

## 5. Documentation vs Implementation Gaps

| Documentation States                | Actual Implementation                | Gap                                  |
| ----------------------------------- | ------------------------------------ | ------------------------------------ |
| Refund handling: PARTIAL            | Handler exists but doesn't call RPC  | **CRITICAL** - RPC exists but unused |
| Admin endpoint not documented       | `/api/admin/subscription` exists     | Documentation missing                |
| Credit history UI: NOT IMPLEMENTED  | Data logged to `credit_transactions` | Correct - no UI                      |
| Low credit warning: NOT IMPLEMENTED | Not implemented                      | Correct                              |
| Cron jobs: Production Ready         | Fully implemented                    | Correct                              |
| Webhook idempotency: Implemented    | Fully implemented                    | Correct                              |

---

## 6. Medium Priority Issues

### MEDIUM-1: Test/Production Code Duplication

**File:** `app/api/subscription/change/route.ts:170-283`

The test mode path (lines 170-206) and production path (lines 221-283) have nearly identical logic.

**Risk:** Bugs fixed in one path won't apply to the other.

**Recommendation:** Extract common logic to shared function.

---

### MEDIUM-2: Unhandled Webhook Types Silently Completed

**File:** `app/api/webhooks/stripe/route.ts:198-203`

```typescript
default:
  console.log(`Unhandled event type: ${event.type}`);
```

Then immediately marks as completed. If Stripe adds new required events, they'll be silently ignored.

**Recommendation:** Mark as `unhandled` status, add monitoring/alerting.

---

### MEDIUM-3: No Negative Amount Validation

**File:** `supabase/migrations/20250121_enhanced_credit_functions.sql:5-36`

`increment_credits_with_log` doesn't validate that `amount > 0`.

**Recommendation:** Add input validation to all credit RPC functions.

---

### MEDIUM-4: Missing Stripe API Error Differentiation

**File:** `app/api/cron/recover-webhooks/route.ts`

All Stripe errors treated equally. Should distinguish:

- 404 = event deleted, unrecoverable
- 500 = transient, retry later
- Rate limit = backoff and retry

---

### MEDIUM-5: No Invoice Reference in Credit Transactions

When credits are added via `invoice.payment_succeeded`, the reference should include invoice ID for refund clawback correlation.

---

### MEDIUM-6: Customer Portal Session URL Exposure

The portal URL is returned to client and logged. While not a security issue (short-lived), consider reducing log verbosity.

---

### MEDIUM-7: Missing Monitoring for Sync Failures

No alerts when:

- Cron jobs fail
- Discrepancies found in reconciliation
- Webhook recovery exhausts retries

---

### MEDIUM-8: Hardcoded Price IDs

**File:** `shared/config/stripe.ts`

Prices are hardcoded rather than synced from Stripe `products` and `prices` tables.

**Risk:** Adding new plans requires code deployment.

---

## 7. Low Priority Issues

1. **Orphaned Stripe customers** - If DB update fails after customer creation, customer is orphaned in Stripe
2. **No rate limiting** - API endpoints don't have explicit rate limits (Cloudflare may handle)
3. **Log verbosity** - Some operations log sensitive-adjacent data
4. **Missing retry backoff** - Recovery cron uses fixed retry count without exponential backoff
5. **No health check endpoint** - `/api/health/stripe` documented but not implemented
6. **Duplicate subscription prevention** - Relies on check-then-create, could use unique constraint

---

## 8. Recommendations

### Immediate (This Week)

1. **Fix RPC Authorization** [CRITICAL-1]

   - Revoke `authenticated` role from credit modification functions
   - OR add `auth.uid()` validation

2. **Implement Credit Clawback** [CRITICAL-2]

   - Update `handleChargeRefunded` to call existing RPC
   - Test with Stripe test refunds

3. **Fix Event Completion** [CRITICAL-3]

   - Throw error if `markEventCompleted` fails
   - Let Stripe retry the webhook

4. **Tighten Test Mode Detection** [CRITICAL-4]
   - Use AND conditions instead of OR
   - Add production guard for test secrets

### Short Term (This Sprint)

5. Fix stale subscription data in plan changes [CRITICAL-5]
6. Add input validation to RPC functions [MEDIUM-3]
7. Extract duplicated test/production logic [MEDIUM-1]
8. Add monitoring for cron failures [MEDIUM-7]

### Medium Term (This Month)

9. Implement proper error differentiation in recovery cron [MEDIUM-4]
10. Add invoice reference to credit transactions [MEDIUM-5]
11. Document admin endpoint [Gap]
12. Consider products/prices sync from Stripe [MEDIUM-8]

---

## 9. Files Audited

| File                                                         | Lines | Issues Found    |
| ------------------------------------------------------------ | ----- | --------------- |
| `app/api/webhooks/stripe/route.ts`                           | 610   | 3               |
| `app/api/subscription/change/route.ts`                       | 333   | 2               |
| `app/api/checkout/route.ts`                                  | 250   | 1               |
| `app/api/cron/check-expirations/route.ts`                    | 154   | 1               |
| `app/api/cron/recover-webhooks/route.ts`                     | ~150  | 1               |
| `app/api/cron/reconcile/route.ts`                            | ~200  | 0               |
| `server/services/subscription-sync.service.ts`               | 348   | 0               |
| `supabase/migrations/20250120_create_rpc_functions.sql`      | 95    | 1               |
| `supabase/migrations/20250121_enhanced_credit_functions.sql` | 113   | 2               |
| `supabase/migrations/20250202_add_credit_clawback_rpc.sql`   | 118   | 0               |
| `shared/config/stripe.ts`                                    | ~100  | 1               |
| `docs/technical/systems/subscription-system.md`              | 1220  | Gaps documented |

---

## Audit Conclusion

The subscription system has a solid architectural foundation with proper idempotency handling, atomic credit operations, and comprehensive cron-based synchronization. However, **the RPC authorization vulnerability (CRITICAL-1) should be fixed immediately** as it allows any authenticated user to manipulate credits.

The refund clawback (CRITICAL-2) represents a financial risk and should be the second priority.

After addressing the critical issues, the system would be rated **LOW RISK** for production operation.

---

_This audit was generated by automated code analysis. Manual review and testing of fixes is recommended before deployment._
