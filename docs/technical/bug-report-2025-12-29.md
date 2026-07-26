# Bug Report - December 29, 2025 (Validated)

## Executive Summary

Security and bug analysis across 6 core systems. Issues validated against actual codebase implementation.

**Validated Issues:** 5 CRITICAL, 8 HIGH, 8 MEDIUM, 5 LOW

---

## Critical Severity Issues

### 1. Dispute Handler Not Implemented

- **Systems:** Billing, Subscription
- **Location:** `app/api/webhooks/stripe/handlers/dispute.handler.ts`
- **Impact:** Users keep credits after chargebacks - direct financial loss
- **Current State:** Handler is a stub with TODO comments (lines 10-18)
- **Fix:** Implement credit clawback, account suspension, admin notification

### 2. Invoice Refund Handler Not Implemented

- **Systems:** Billing, Subscription
- **Location:** `app/api/webhooks/stripe/handlers/payment.handler.ts:241-248`
- **Impact:** Credits not clawed back on invoice refunds
- **Current State:** `handleInvoicePaymentRefunded` is empty stub
- **Fix:** Implement similar to `handleChargeRefunded`

### 3. Credit Clawback Uses Legacy Schema

- **System:** Credits
- **Location:** `supabase/migrations/20250202000400_add_credit_clawback_rpc.sql`
- **Impact:** Refund credit clawback completely broken
- **Issue:** References old `credits_balance` column instead of `subscription_credits_balance` / `purchased_credits_balance`
- **Fix:** Update `clawback_credits` and `clawback_credits_from_transaction` RPCs to use new dual-pool schema

### 4. Refund Credits Routes to Wrong Pool

- **System:** Credits
- **Location:** `supabase/migrations/20250221000000_secure_credits.sql:110-129`
- **Impact:** Processing failure refunds go to purchased pool instead of original pool
- **Issue:** `refund_credits` calls `increment_credits_with_log` which routes non-subscription types to purchased credits
- **Fix:** Track original pool in transaction metadata and restore to same pool

### 5. Rate Limit Bypass via Test Stripe Key

- **System:** Rate Limiting
- **Location:** `lib/middleware/rateLimit.ts:62`
- **Impact:** Complete rate limit bypass in production when `sk_test_` keys used
- **Issue:** `isTestEnvironment()` checks if `STRIPE_SECRET_KEY.startsWith('sk_test_')`
- **Fix:** Remove Stripe key check, use only explicit `ENV` variable checks

---

## High Severity Issues

### Authentication (1 issue)

| Issue                                            | Location                                  | Impact                                                       |
| ------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------ |
| CORS wildcard fallback for missing Origin header | `lib/middleware/securityHeaders.ts:35-38` | Requests without Origin get `Access-Control-Allow-Origin: *` |

### Billing (2 issues)

| Issue                                          | Location                       | Impact                                                        |
| ---------------------------------------------- | ------------------------------ | ------------------------------------------------------------- |
| Refund correlation incomplete for credit packs | `payment.handler.ts:199-206`   | Only checks `invoice_` references, not `session_` or `pi_`    |
| Race condition in plan change + webhook        | `subscription/change/route.ts` | DB updated before webhook, `previous_attributes` may be stale |

### Rate Limiting (2 issues)

| Issue                                   | Location                                   | Impact                                                |
| --------------------------------------- | ------------------------------------------ | ----------------------------------------------------- |
| Missing rate limits on public endpoints | `/api/analytics/event`, `/api/proxy-image` | Abuse vectors for flooding/bandwidth consumption      |
| Fallback to "unknown" identifier        | `lib/middleware/rateLimit.ts:30`           | All failed IP extractions share one rate limit bucket |

### Image Processing (3 issues)

| Issue                                    | Location                                                    | Impact                                                               |
| ---------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| Missing dimension validation server-side | `app/api/upscale/route.ts`                                  | Only validates file size, not pixel dimensions (64-8192px)           |
| MIME type validation bypass              | `upscale.schema.ts:150-159`                                 | Server trusts client-claimed MIME type without magic byte validation |
| Memory leak in some image utilities      | `image-preprocessing.ts:65`, `image-compression.ts:246,258` | Some `URL.createObjectURL()` calls not revoked                       |

---

## Medium Severity Issues

| System        | Issue                                               | Location                          |
| ------------- | --------------------------------------------------- | --------------------------------- |
| Billing       | Missing `balance_after` in credit transaction audit | `20251205000300_update_credit_rpcs.sql` |
| Billing       | Webhook returns success when profile not found      | `subscription.handler.ts:88-91`   |
| Billing       | Scheduled downgrade overwrites rollover credits     | `subscription.handler.ts:629-666` |
| Credits       | Scheduled downgrade bypasses trigger protection     | `subscription.handler.ts:643-650` |
| Subscription  | Reconciliation cron misses some statuses            | `cron/reconcile/route.ts:63-67`   |
| Subscription  | Scheduled downgrade not cleared on cancel           | `subscriptions/cancel/route.ts`   |
| Rate Limiting | No rate limit on `/api/analyze-image`               | `app/api/analyze-image/route.ts`  |
| Image         | No request timeout/AbortController                  | `app/api/upscale/route.ts`        |

---

## Low Severity Issues

| System       | Issue                                                   |
| ------------ | ------------------------------------------------------- |
| Auth         | Hardcoded webhook secret check string                   |
| Billing      | Hardcoded test price ID                                 |
| Credits      | Transaction type enum inconsistency across migrations   |
| Subscription | Batch size limit may leave subscriptions unreconciled   |
| Image        | 8x scale factor treated as 4x without user notification |

---

## Removed/Invalid Issues

The following issues from the original report were validated as NOT bugs:

| Issue                                                | Reason Removed                                                    |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| In-Memory Rate Limiting Not Distributed              | Documented architecture decision with explicit comment in code    |
| Auth cache in localStorage without encryption        | Caches display info only, not tokens or sensitive data            |
| `getSession()` vs `getUser()` misuse                 | Both are valid for different use cases                            |
| OAuth callback race condition                        | Protected by `hasRedirected.current` ref guard                    |
| Open redirect in returnTo parameter                  | Validates `url.origin === window.location.origin` before redirect |
| Auth bypass headers in production                    | Only affects redirect behavior, not authentication                |
| IP spoofing via X-Forwarded-For                      | Correctly prioritizes `cf-connecting-ip` header                   |
| Balance calculation includes purchased in expiration | Uses `expire_subscription_credits` which correctly handles pools  |
| Trial conversion may double-credit                   | Couldn't reproduce, needs specific scenario                       |
| `consume_credits_v2` granted to authenticated        | Intentional design for client-side credit consumption             |

---

## Priority Action Matrix

### Immediate (This Week)

1. Update `clawback_credits` RPC for dual credit pool schema
2. Update `refund_credits` RPC to restore to correct pool
3. Remove `sk_test_` check from `isTestEnvironment()`
4. Implement dispute handler with credit clawback
5. Implement invoice refund handler

### Next Sprint

6. Add rate limits to `/api/analytics/event` and `/api/proxy-image`
7. Add server-side image dimension validation
8. Fix CORS wildcard fallback (require explicit origin)
9. Add magic byte validation for MIME types
10. Clear `scheduled_price_id` on subscription cancel

---

## Systems Risk Summary

| System           | Critical | High | Medium | Low | Risk Level   |
| ---------------- | -------- | ---- | ------ | --- | ------------ |
| Credits          | 2        | 0    | 2      | 1   | **CRITICAL** |
| Billing          | 2        | 2    | 2      | 1   | **CRITICAL** |
| Rate Limiting    | 1        | 2    | 1      | 0   | HIGH         |
| Image Processing | 0        | 3    | 1      | 1   | MEDIUM       |
| Authentication   | 0        | 1    | 0      | 1   | LOW          |
| Subscription     | 0        | 0    | 2      | 1   | LOW          |

---

_Validated by code review on 2025-12-29_
