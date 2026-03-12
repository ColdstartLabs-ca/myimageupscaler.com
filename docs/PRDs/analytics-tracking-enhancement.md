# Analytics Tracking Enhancement PRD

**Status:** Draft
**Priority:** High
**Created:** 2026-03-11
**Author:** Claude

---

## Problem Statement

Current analytics coverage has critical gaps in the revenue funnel and user lifecycle tracking:
- **88 upgrade clicks → only 2 purchases** with no visibility into why users drop off
- **Day 1 retention ~2%** with no tools to understand why users don't return
- **40% of uploaders never download** with no insight into failure reasons
- **Regional pricing** implemented but not measurable across the funnel

---

## Complexity Assessment

```
Score: 6 → MEDIUM mode
+2  Touches 10+ files (types, client, server, webhooks, tests)
+2  Complex state logic (payment flows, user identity)
+1  External API integration (Amplitude)
+1  Database schema changes (none, uses existing)
```

---

## Solution Overview

Implement missing tracking events in 4 phases prioritized by business impact:

1. **Phase 1: Revenue Leak Detection** - Track payment failures and checkout abandonment
2. **Phase 2: User Lifecycle** - Track signups, onboarding, and user properties
3. **Phase 3: Feature Depth** - Track upload/upscale failures and comparison engagement
4. **Phase 4: Acquisition Attribution** - Connect SEO landing pages to conversions

---

## Architecture

```mermaid
flowchart TB
    subgraph Client
        A[User Action] --> B[analytics.track]
        B --> C[/api/analytics/event]
    end

    subgraph Server
        D[Stripe Webhook] --> E[trackServerEvent]
        F[API Route] --> E
        E --> G[Amplitude HTTP API]
    end

    C --> G

    subgraph Events
        H[Revenue Events]
        I[User Events]
        J[Feature Events]
    end

    G --> H
    G --> I
    G --> J
```

---

## Files Analyzed

- `server/analytics/types.ts` - Event type definitions
- `server/analytics/analyticsService.ts` - Server-side tracking
- `client/analytics/analyticsClient.ts` - Client-side tracking
- `app/api/analytics/event/route.ts` - Client event whitelist
- `app/api/checkout/route.ts` - Checkout flow
- `app/api/webhooks/stripe/handlers/payment.handler.ts` - Payment processing
- `app/api/webhooks/stripe/handlers/subscription.handler.ts` - Subscription events
- `client/store/userStore.ts` - Auth state management
- `tests/unit/bugfixes/analytics-event-whitelist.unit.spec.ts` - Test patterns

---

## Phase 1: Revenue Leak Detection

**Goal:** Identify why 88 upgrade clicks → only 2 purchases

### 1.1 Track Payment Failures

**Event:** `payment_failed`

**Files:**
- `server/analytics/types.ts` - Add `IPaymentFailedProperties` interface
- `app/api/webhooks/stripe/handlers/invoice.handler.ts` - Track `invoice.payment_failed`
- `tests/unit/analytics/payment-failed.unit.spec.ts` - Test event tracking

**Implementation:**

```typescript
// server/analytics/types.ts
export interface IPaymentFailedProperties {
  priceId?: string;
  plan?: string;
  errorType: 'card_declined' | 'insufficient_funds' | 'expired_card' | 'generic';
  errorMessage: string; // Sanitized
  attemptCount: number;
  customerId: string;
}
```

**Trigger:** Stripe webhook `invoice.payment_failed`

**Tests:**
| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `tests/unit/analytics/payment-failed.unit.spec.ts` | `should track payment_failed on invoice.payment_failed webhook` | `expect(trackServerEvent).toHaveBeenCalledWith('payment_failed', ...)` |

### 1.2 Enhance checkout_abandoned with Abandonment Rate

**Current State:** `checkout_abandoned` exists but `checkout_started` is needed for rate calculation.

**Status:** `checkout_started` already implemented in `app/api/checkout/route.ts:527`

**Action:** Verify `checkout_abandoned` tracking is working correctly.

### 1.3 Track Plan Selection

**Event:** `plan_selected`

**Files:**
- `server/analytics/types.ts` - Add `IPlanSelectedProperties`
- `app/[locale]/pricing/PricingPageClient.tsx` - Track when user clicks plan CTA
- `app/api/analytics/event/route.ts` - Add to whitelist
- `tests/unit/analytics/plan-selected.unit.spec.ts` - Test tracking

**Implementation:**

```typescript
// server/analytics/types.ts
export interface IPlanSelectedProperties {
  planName: 'starter' | 'hobby' | 'pro' | 'business';
  priceId: string;
  price: number;
  billingInterval: 'monthly' | 'yearly';
  pricingRegion?: string;
  discountPercent?: number;
  source: 'pricing_page' | 'upgrade_modal' | 'batch_limit';
}
```

**Verification:**
- Action: Click plan card on pricing page
- Expected: `plan_selected` event fired with plan details

---

## Phase 2: User Lifecycle & Properties

**Goal:** Enable re-engagement and retention analysis

### 2.1 Add pricingRegion as User Property

**Files:**
- `client/analytics/analyticsClient.ts` - Add `pricingRegion` to `IUserIdentity`
- `client/store/userStore.ts` - Set `pricingRegion` on identify
- `server/analytics/types.ts` - Update `IUserIdentity` interface
- `tests/unit/analytics/pricing-region-user-property.unit.spec.ts` - Test

**Implementation:**

```typescript
// server/analytics/types.ts
export interface IUserIdentity {
  userId: string;
  email?: string;
  emailHash?: string;
  createdAt?: string;
  subscriptionTier?: string;
  pricingRegion?: string; // NEW
  imagesUpscaledLifetime?: number; // NEW
  accountAgeDays?: number; // NEW
}
```

**Trigger:** On `analytics.identify()` calls

### 2.2 Track Account Creation

**Event:** `account_created`

**Files:**
- `server/analytics/types.ts` - Add `IAccountCreatedProperties`
- `app/api/users/setup/route.ts` - Track on user setup
- `app/api/analytics/event/route.ts` - Add to whitelist
- `tests/unit/analytics/account-created.unit.spec.ts` - Test

**Implementation:**

```typescript
export interface IAccountCreatedProperties {
  method: 'email' | 'google' | 'facebook' | 'azure';
  hasEmail: boolean;
  fingerprintHash?: string;
  pricingRegion?: string;
}
```

### 2.3 Track Email Captured

**Event:** `email_captured`

**Files:**
- `server/analytics/types.ts` - Add interface
- Client components with email capture forms
- `tests/unit/analytics/email-captured.unit.spec.ts`

**Implementation:**

```typescript
export interface IEmailCapturedProperties {
  source: 'newsletter' | 'support_form' | 'waitlist' | 'upgrade_prompt';
  hasAccount: boolean;
}
```

### 2.4 Track Onboarding Completion

**Event:** `onboarding_completed`

**Files:**
- `server/analytics/types.ts` - Add interface
- Dashboard component - Track when user completes first upscale
- `tests/unit/analytics/onboarding.unit.spec.ts`

**Implementation:**

```typescript
export interface IOnboardingCompletedProperties {
  firstAction: 'upscale' | 'batch' | 'download';
  timeToCompleteMs: number;
  imagesProcessed: number;
}
```

---

## Phase 3: Feature Depth Tracking

**Goal:** Understand feature usage and failure points

### 3.1 Enhanced Error Tracking

**Current:** Generic `error_occurred` with `errorType`

**Enhancement:** Add specific error subtypes

**Files:**
- `server/analytics/types.ts` - Extend `IErrorOccurredProperties.errorType`
- `client/components/features/image-processing/Dropzone.tsx` - Track upload failures
- `app/api/upscale/route.ts` - Track upscale failures
- `tests/unit/analytics/error-tracking.unit.spec.ts`

**New Error Types:**
```typescript
export type IErrorType =
  | 'upload_failed'
  | 'upload_file_too_large'
  | 'upload_invalid_format'
  | 'upscale_failed'
  | 'upscale_timeout'
  | 'download_failed'
  | 'validation_failed'
  | 'rate_limited'
  | 'insufficient_credits'
  | 'unknown';
```

### 3.2 Track Comparison Viewed

**Event:** `comparison_viewed`

**Files:**
- `server/analytics/types.ts` - Add interface
- `client/components/features/image-processing/ImageComparison.tsx` - Track slider interaction
- `app/api/analytics/event/route.ts` - Add to whitelist
- `tests/unit/analytics/comparison-viewed.unit.spec.ts`

**Implementation:**

```typescript
export interface IComparisonViewedProperties {
  upscaleFactor: number;
  modelUsed: string;
  interactionType: 'slider_move' | 'toggle' | 'zoom';
  timeViewedMs: number;
}
```

### 3.3 Enhance image_download Properties

**Current:** Has `mode`, `filename`, `count`, `fileSize`, `outputWidth`, `outputHeight`, `modelUsed`

**Enhancement:** Add `upscaleFactor`, `inputResolution`

**Files:**
- `server/analytics/types.ts` - Extend `IImageDownloadProperties`
- `client/utils/download.ts` - Pass additional properties
- `tests/unit/analytics/image-download.unit.spec.ts`

---

## Phase 4: Acquisition Attribution

**Goal:** Connect SEO landing pages to conversions

### 4.1 Track pSEO Entry Point in Funnels

**Enhancement:** Add `entryPage` property to conversion events

**Files:**
- `client/analytics/analyticsClient.ts` - Track entry page on first page view
- Store entry page in localStorage for session attribution
- Include in `purchase_confirmed`, `checkout_started` events

**Implementation:**

```typescript
// Store first page on session start
if (!localStorage.getItem('miu_entry_page')) {
  localStorage.setItem('miu_entry_page', window.location.pathname);
}

// Include in conversion events
analytics.track('purchase_confirmed', {
  purchaseType: 'subscription',
  sessionId,
  entryPage: localStorage.getItem('miu_entry_page'),
});
```

### 4.2 Track UTM on Purchase Events

**Current:** UTM stored as user properties via `setOnce`

**Enhancement:** Include UTM on `checkout_completed` server-side event

**Files:**
- `app/api/webhooks/stripe/handlers/payment.handler.ts` - Include UTM from session metadata

---

## User Properties Summary

| Property | Type | Source | Purpose |
|----------|------|--------|---------|
| `subscription_tier` | string | Already tracked | Segment by plan |
| `pricing_region` | string | CF-IPCountry | Measure regional pricing impact |
| `images_upscaled_lifetime` | number | Credit transactions | Identify power users |
| `account_age_days` | number | created_at | Segment by tenure |
| `first_touch_source` | string | UTM/Referrer | Attribution |
| `first_touch_campaign` | string | UTM | Campaign attribution |

---

## Event Summary

### New Events (Client-side)

| Event | Phase | Priority |
|-------|-------|----------|
| `plan_selected` | 1 | Critical |
| `account_created` | 2 | High |
| `email_captured` | 2 | High |
| `onboarding_completed` | 2 | Medium |
| `comparison_viewed` | 3 | Medium |

### New Events (Server-side)

| Event | Phase | Priority |
|-------|-------|----------|
| `payment_failed` | 1 | Critical |
| `subscription_renewed` | 2 | Medium |

### Enhanced Events

| Event | Enhancement |
|-------|-------------|
| `error_occurred` | More specific error types |
| `image_download` | Add upscaleFactor, inputResolution |
| `purchase_confirmed` | Add entryPage |
| `checkout_completed` | Add UTM params |

---

## Execution Phases

### Phase 1: Revenue Leak Detection (2-3 days)

**Files (max 5 per sub-phase):**

Sub-phase 1.1 - Payment Failed:
- `server/analytics/types.ts`
- `app/api/webhooks/stripe/handlers/invoice.handler.ts`
- `tests/unit/analytics/payment-failed.unit.spec.ts`

Sub-phase 1.2 - Plan Selected:
- `server/analytics/types.ts`
- `app/[locale]/pricing/PricingPageClient.tsx`
- `app/api/analytics/event/route.ts`
- `tests/unit/analytics/plan-selected.unit.spec.ts`

**User Verification:**
1. Trigger failed payment in Stripe test mode
2. Check Amplitude for `payment_failed` event with error details

### Phase 2: User Lifecycle (2 days)

**Files:**
- `server/analytics/types.ts`
- `client/analytics/analyticsClient.ts`
- `client/store/userStore.ts`
- `app/api/users/setup/route.ts`
- `tests/unit/analytics/user-lifecycle.unit.spec.ts`

**User Verification:**
1. Create new account
2. Verify `account_created` event in Amplitude
3. Check user properties include `pricingRegion`

### Phase 3: Feature Depth (1-2 days)

**Files:**
- `server/analytics/types.ts`
- `client/components/features/image-processing/Dropzone.tsx`
- `client/components/features/image-processing/ImageComparison.tsx`
- `client/utils/download.ts`
- `tests/unit/analytics/feature-depth.unit.spec.ts`

**User Verification:**
1. Upload invalid file → verify `error_occurred` with `upload_invalid_format`
2. Use comparison slider → verify `comparison_viewed` event

### Phase 4: Acquisition Attribution (1 day)

**Files:**
- `client/analytics/analyticsClient.ts`
- `app/api/webhooks/stripe/handlers/payment.handler.ts`
- `tests/unit/analytics/attribution.unit.spec.ts`

**User Verification:**
1. Land on pSEO page → navigate to pricing → purchase
2. Verify `purchase_confirmed` includes `entryPage` matching pSEO URL

---

## Verification Strategy

### Unit Tests

Each new event must have unit tests covering:
- Event is tracked with correct properties
- Event passes schema validation
- Error cases don't crash the app

### Integration Tests

- Payment flow from checkout to `payment_failed` or `checkout_completed`
- User lifecycle from signup to `onboarding_completed`

### Manual Verification

After each phase:
1. Check Amplitude dashboard for new events appearing
2. Verify event properties are correctly populated
3. Create charts to validate business insights

---

## Acceptance Criteria

- [ ] `payment_failed` event tracked on Stripe invoice.payment_failed
- [ ] `plan_selected` event tracked on pricing page CTA clicks
- [ ] `account_created` event tracked on user signup
- [ ] `pricingRegion` user property set on identify
- [ ] `comparison_viewed` event tracked on slider interaction
- [ ] Enhanced error types for upload/upscale failures
- [ ] `entryPage` included in conversion events
- [ ] All new events in client whitelist
- [ ] All unit tests passing
- [ ] `yarn verify` passes
- [ ] Events visible in Amplitude dashboard

---

## Out of Scope

- Real-time analytics dashboards
- Custom Amplitude dashboards/charts
- A/B test tracking
- Feature flag integration
- Mobile app tracking
