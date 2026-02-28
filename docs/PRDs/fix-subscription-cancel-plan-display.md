# PRD: Fix Subscription Cancellation Plan Display Bug

**Complexity: 3 → LOW mode**

| Item         | Detail                      |
| ------------ | --------------------------- |
| Touches      | ~5 files                    |
| New module   | No                          |
| DB migration | Yes (data fix, one-off SQL) |
| External API | No                          |

---

## 1. Context

**Problem:** After canceling a subscription, the sidebar displays "Starter Plan" while the billing page correctly shows "Free Plan", because `profiles.subscription_tier` is not reset to `null` on cancellation.

**Files Analyzed:**

- `app/api/webhooks/stripe/handlers/subscription.handler.ts` — cancellation handler (lines 578-700)
- `client/components/dashboard/DashboardSidebar.tsx` — sidebar plan badge (lines 49-53)
- `shared/config/stripe.ts` — `getPlanDisplayName()` (lines 372-447)
- `app/[locale]/dashboard/billing/page.tsx` — billing page plan display (lines 194-199)
- `client/store/userStore.ts` — user data fetch via `get_user_data` RPC
- `supabase/migrations/20251209_get_user_data_rpc.sql` — RPC filters subscriptions to `active`/`trialing` only
- `shared/constants/billing.ts` — `BILLING_COPY.freePlan`

**Current Behavior:**

- `handleSubscriptionDeleted()` sets `profiles.subscription_status = 'canceled'` but leaves `subscription_tier = 'starter'`
- `get_user_data` RPC returns `subscription: null` for canceled users (correct — filters `active`/`trialing`)
- Sidebar calls `getPlanDisplayName({ subscriptionTier: 'starter' })` → returns "Starter Plan"
- Billing page checks `subscription ? getPlanDisplayName(...) : 'Free Plan'` → returns "Free Plan" since subscription is null
- Database for user `4819550f`: `subscription_status: 'canceled'`, `subscription_tier: 'starter'`, `subscription_credits_balance: 95`

**Credits note:** Subscription credits (95) are NOT zeroed on cancel. This is intentional — the cancellation email says "Your remaining credits will be available until the end of your billing period." No change needed here.

---

## 2. Solution

**Approach:**

- Reset `subscription_tier` to `null` in the webhook handler when a subscription is deleted
- Add a defensive check in the sidebar so that even if tier is stale, canceled status produces "Free Plan"
- Fix existing stale data with a one-off SQL update
- Add unit tests for the webhook handler cancellation path and sidebar display logic

**Key Decisions:**

- Fix at the source (webhook) AND add defensive UI check (belt-and-suspenders)
- Don't change `getPlanDisplayName()` — it already returns "Free Plan" when `subscriptionTier` is null. The problem is the caller passing stale data
- No credit zeroing — current behavior is correct per the cancellation email copy

**Data Changes:** One-off SQL to fix existing users with `subscription_status = 'canceled'` but non-null `subscription_tier`

---

## 3. Execution Phases

### Phase 1: Fix webhook handler + data migration

**Files (3):**

- `app/api/webhooks/stripe/handlers/subscription.handler.ts` — add `subscription_tier: null` to the profile update in `handleSubscriptionDeleted`
- `tests/unit/webhooks/subscription-cancel-tier-reset.unit.spec.ts` — new test file
- One-off SQL via Supabase MCP (not a migration file — this is a data fix for existing records)

**Implementation:**

- [ ] In `handleSubscriptionDeleted()` (line 640), add `subscription_tier: null` to the profile update object:
  ```typescript
  .update({
    subscription_status: 'canceled',
    subscription_tier: null,
  })
  ```
- [ ] Run one-off SQL to fix existing stale data:
  ```sql
  UPDATE profiles
  SET subscription_tier = null, updated_at = now()
  WHERE subscription_status = 'canceled'
    AND subscription_tier IS NOT NULL;
  ```
- [ ] Write unit tests verifying the handler resets `subscription_tier`

**Tests Required:**

| Test File                                                         | Test Name                                                             | Assertion                                                 |
| ----------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------- |
| `tests/unit/webhooks/subscription-cancel-tier-reset.unit.spec.ts` | `should reset subscription_tier to null when subscription is deleted` | Profile update includes `subscription_tier: null`         |
| `tests/unit/webhooks/subscription-cancel-tier-reset.unit.spec.ts` | `should set subscription_status to canceled`                          | Profile update includes `subscription_status: 'canceled'` |

**Verification Plan:**

1. Unit tests pass
2. `yarn verify` passes

---

### Phase 2: Fix sidebar defensive check

**Files (2):**

- `client/components/dashboard/DashboardSidebar.tsx` — add defensive check for canceled status
- `tests/unit/client/components/DashboardSidebar.unit.spec.ts` — new test for plan display after cancel

**Implementation:**

- [ ] Update sidebar plan resolution (line 49-53) to check subscription status:
  ```typescript
  const isCanceled = user?.profile?.subscription_status === 'canceled';
  const planDisplayName = isCanceled
    ? BILLING_COPY.freePlan
    : getPlanDisplayName({
        subscriptionTier: user?.profile?.subscription_tier,
        priceId: subscription?.price_id,
      });
  ```
- [ ] Import `BILLING_COPY` from `@shared/constants/billing`
- [ ] Write test verifying sidebar shows "Free Plan" when `subscription_status` is `canceled` even if `subscription_tier` is non-null

**Tests Required:**

| Test File                                                    | Test Name                                                    | Assertion                         |
| ------------------------------------------------------------ | ------------------------------------------------------------ | --------------------------------- |
| `tests/unit/client/components/DashboardSidebar.unit.spec.ts` | `should show Free Plan when subscription_status is canceled` | Plan badge text is "Free Plan"    |
| `tests/unit/client/components/DashboardSidebar.unit.spec.ts` | `should show Starter Plan when subscription is active`       | Plan badge text is "Starter Plan" |

**Verification Plan:**

1. Unit tests pass
2. `yarn verify` passes

---

## 4. Acceptance Criteria

- [ ] Phase 1: Webhook handler resets `subscription_tier` to null on cancel
- [ ] Phase 1: Existing stale data fixed via SQL
- [ ] Phase 2: Sidebar shows "Free Plan" for canceled subscriptions
- [ ] All tests pass
- [ ] `yarn verify` passes
