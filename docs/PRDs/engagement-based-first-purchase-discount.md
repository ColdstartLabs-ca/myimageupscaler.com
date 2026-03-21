# PRD: Engagement-Based First-Purchase Discount

**Status:** Ready
**Complexity:** HIGH (Score: 7+)
**GitHub Issue:** #41

---

## Summary

Target Path 2 "Feature-Engaged" free users at peak engagement with a 20% off credit pack offer via a slide-in toast with 30-minute countdown.

---

## Problem Statement

Free users who actively engage with the product (multiple upscales, downloads, model switches) demonstrate high intent but may not convert due to price sensitivity. We need a targeted discount mechanism to capture these "hot" leads at their peak engagement moment.

---

## How It Works

1. Track 3 engagement signals per session: upscales (3+), downloads (2+), model switches (1+)
2. When 2/3 thresholds met → server validates eligibility (free user, never offered before)
3. Slide-in toast with 30-min countdown showing Medium Pack at $11.99 (was $14.99)
4. CTA → Stripe checkout with visible "Welcome Discount -20%" coupon line
5. Stacks with regional pricing (e.g., Indian user sees $5.25 → $4.20)
6. One-time per user, server-enforced, 30-min strict expiry

---

## Target Segment

**Path 2: Feature-Engaged Free Users**

- Active in current session
- Free tier users who have never purchased
- Triggered by behavioral signals, not time-based

---

## Engagement Signals

| Signal         | Threshold      | Rationale                 |
| -------------- | -------------- | ------------------------- |
| Upscales       | 3+ per session | Shows active usage        |
| Downloads      | 2+ per session | Shows value extraction    |
| Model switches | 1+ per session | Shows feature exploration |

**Trigger condition:** 2 out of 3 thresholds met

---

## User Experience

### Toast Design

- Slide-in from right edge
- 30-minute countdown timer
- Shows: "Medium Pack - $11.99 (was $14.99)"
- "Get 20% Off" CTA button
- Dismissible (X button) but offer persists in session
- Mobile-responsive positioning

### Checkout Flow

- Clicks CTA → Stripe checkout
- Coupon line visible: "Welcome Discount -20%"
- Regional pricing stacks: 20% off already-discounted regional price
- 30-min expiry enforced server-side

---

## Phase 1: Config + DB

### Files to Create/Modify

1. **`shared/config/engagement-discount.ts`** (NEW)
   - Threshold constants
   - Discount percentage (20%)
   - Countdown duration (30 min)
   - Credit pack target (Medium Pack)
   - Type definitions

2. **`shared/types/engagement-discount.ts`** (NEW)
   - `IEngagementSignals` interface
   - `IEngagementDiscountEligibility` interface
   - `IEngagementDiscountState` interface

3. **`supabase/migrations/YYYYMMDD_engagement_discount.sql`** (NEW)
   - Add `engagement_discount_offered_at` (timestamptz, nullable) to profiles
   - Add `engagement_discount_expires_at` (timestamptz, nullable) to profiles

### Implementation Steps

1. Define engagement thresholds as configurable constants
2. Create TypeScript interfaces for all engagement-related types
3. Create Supabase migration for profile columns
4. Export types from `shared/types/index.ts`

### Tests Required

- [ ] Config constants are valid (thresholds positive, discount reasonable)
- [ ] Types compile without errors
- [ ] Migration runs successfully (can be verified manually)

---

## Phase 2: Tracking + API

### Files to Create/Modify

1. **`client/hooks/useEngagementTracker.ts`** (NEW)
   - Track upscales, downloads, model switches
   - Session-based tracking (reset on session end)
   - Check eligibility when thresholds approached
   - Return: `{ signals, isEligible, checkEligibility }`

2. **`app/api/engagement-discount/eligibility/route.ts`** (NEW)
   - GET endpoint
   - Validate: user is free tier, never offered before
   - Return: `{ eligible: boolean, discountExpiresAt?: string, couponId?: string }`
   - Set `engagement_discount_offered_at` and `engagement_discount_expires_at` on profile

3. **`app/api/engagement-discount/redeem/route.ts`** (NEW)
   - POST endpoint (called by Stripe webhook)
   - Mark discount as redeemed
   - Clear expiry timestamp

4. **`server/services/engagement-discount.service.ts`** (NEW)
   - `checkEligibility(userId)` - server-side validation
   - `offerDiscount(userId)` - set offered_at and expires_at
   - `redeemDiscount(userId)` - mark as redeemed
   - `isDiscountValid(userId)` - check if still within 30-min window

### Implementation Steps

1. Create service layer with all business logic
2. Create eligibility API endpoint
3. Create redeem API endpoint
4. Create client-side hook for tracking
5. Integrate hook with existing upscale/download/model-switch code paths

### Tests Required

- [ ] Service: eligibility check returns correct status
- [ ] Service: offerDiscount sets timestamps correctly
- [ ] Service: redeemDiscount clears expiry
- [ ] Service: isDiscountValid respects 30-min window
- [ ] API: eligibility endpoint returns 401 for unauthenticated
- [ ] API: eligibility endpoint returns correct response for eligible user
- [ ] API: eligibility endpoint returns ineligible for already-offered user
- [ ] Hook: tracks signals correctly

---

## Phase 3: Toast UI

### Files to Create/Modify

1. **`client/components/engagement-discount/EngagementDiscountToast.tsx`** (NEW)
   - Slide-in animation
   - 30-minute countdown timer
   - Price display (original + discounted)
   - CTA button
   - Dismiss button
   - Mobile-responsive

2. **`client/components/engagement-discount/index.ts`** (NEW)
   - Export all components

3. **`client/stores/engagement-discount-store.ts`** (NEW)
   - Zustand store for discount state
   - Persist countdown end time to sessionStorage
   - Actions: show, hide, startCountdown

4. **`client/components/workspace/Workspace.tsx`** (MODIFY)
   - Add EngagementDiscountToast component
   - Connect to useEngagementTracker hook

### Implementation Steps

1. Create Zustand store for toast state
2. Build toast component with countdown
3. Integrate with Workspace component
4. Wire up CTA to navigate to checkout with discount params
5. Handle dismissal (store preference, don't re-show in session)

### Tests Required

- [ ] Toast renders with correct price
- [ ] Countdown decrements correctly
- [ ] Toast dismisses on X click
- [ ] Toast doesn't reappear after dismiss in same session
- [ ] CTA navigates to checkout with correct params

---

## Phase 4: Checkout + Analytics

### Files to Create/Modify

1. **`app/api/checkout/route.ts`** (MODIFY)
   - Accept `engagementDiscountId` param
   - Attach Stripe coupon if valid discount exists
   - Validate discount hasn't expired

2. **`app/api/webhooks/stripe/route.ts`** (MODIFY)
   - On checkout.session.completed, call redeem endpoint if discount was used
   - Track analytics event

3. **`shared/config/env.ts`** (MODIFY)
   - Add `STRIPE_ENGAGEMENT_DISCOUNT_COUPON_ID` env var

4. **`shared/analytics/events.ts`** (MODIFY)
   - Add 6 new funnel events:
     - `engagement_discount_eligible` - User qualified for discount
     - `engagement_discount_toast_shown` - Toast appeared
     - `engagement_discount_toast_dismissed` - User dismissed toast
     - `engagement_discount_cta_clicked` - User clicked CTA
     - `engagement_discount_checkout_started` - Checkout with discount
     - `engagement_discount_redeemed` - Purchase completed with discount

### Implementation Steps

1. Add env var for Stripe coupon ID
2. Modify checkout to attach coupon when valid
3. Modify webhook to redeem discount on purchase
4. Add all analytics events
5. Wire analytics events into each touchpoint

### Tests Required

- [ ] Checkout attaches coupon when discount valid
- [ ] Checkout rejects expired discount
- [ ] Webhook redeems discount on successful payment
- [ ] All analytics events fire correctly

---

## Pre-deployment Checklist

- [ ] Create Stripe coupon ("Welcome Discount", 20% off, once per customer)
- [ ] Set `STRIPE_ENGAGEMENT_DISCOUNT_COUPON_ID` in `.env.api`
- [ ] Run Supabase migration
- [ ] Verify regional pricing stacking works
- [ ] Test end-to-end flow on staging

---

## Acceptance Criteria

1. **Tracking:** Engagement signals tracked correctly per session
2. **Eligibility:** Only free users who haven't been offered see the toast
3. **Toast:** Appears when 2/3 thresholds met, shows countdown, dismissible
4. **Checkout:** Stripe shows visible "-20%" line item
5. **Regional Stacking:** Discount applies to regional price (e.g., $5.25 → $4.20)
6. **One-time:** Server enforces single offer per user
7. **Expiry:** 30-minute countdown enforced server-side
8. **Analytics:** All 6 events tracked in funnel
9. **Redemption:** Webhook marks discount as used on purchase

---

## Analytics Events

| Event                                  | Trigger                   | Properties                                        |
| -------------------------------------- | ------------------------- | ------------------------------------------------- |
| `engagement_discount_eligible`         | User meets 2/3 thresholds | thresholds_met                                    |
| `engagement_discount_toast_shown`      | Toast appears             | discount_amount, original_price, discounted_price |
| `engagement_discount_toast_dismissed`  | User clicks X             | time_remaining_seconds                            |
| `engagement_discount_cta_clicked`      | User clicks CTA           | time_remaining_seconds                            |
| `engagement_discount_checkout_started` | Checkout with coupon      | coupon_id                                         |
| `engagement_discount_redeemed`         | Payment successful        | coupon_id, amount_saved                           |

---

## Out of Scope

- Multiple discount tiers
- A/B testing different percentages
- Email reminders for unused discounts
- Extending expired discounts
