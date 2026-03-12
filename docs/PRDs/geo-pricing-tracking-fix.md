# Geo-Pricing Tracking Fix & Analysis

**Complexity: 5 -> MEDIUM mode**
**Date:** 2026-03-11
**Status:** Draft
**Related:** `docs/PRDs/regional-dynamic-pricing.md`

---

## 1. Context

**Problem:** Regional dynamic pricing is live, but the `pricingRegion` property is missing on ~90% of pricing page views. We launched regional pricing with PPP-adjusted discounts (65% for South Asia, 60% for Southeast Asia, 50% for LatAm, 40% for Eastern Europe, 65% for Africa), but we can't answer the core business question: **"Do discounted regions convert better?"**

**Current State Analysis:**

- `pricingRegion` tracking only started March 10-11, 2026
- ~90% of `pricing_page_viewed` events have `pricingRegion = null` or `undefined`
- `upgrade_prompt_shown` and `upgrade_prompt_clicked` events do NOT include `pricingRegion`
- `checkout_started` and `checkout_completed` events have `pricingRegion` as optional, but implementation is incomplete
- No visibility into whether PPP discounts actually improve conversion
- Can't optimize pricing by region or measure ROI of regional discounts

**Files Analyzed:**

- `server/analytics/types.ts` — analytics event taxonomy (`pricingRegion` exists as optional on some events)
- `app/[locale]/pricing/PricingPageClient.tsx` — pricing page tracking (has `pricingRegion` fallback)
- `client/hooks/useRegionTier.ts` — client-side geo hook (returns `pricingRegion`)
- `client/components/features/image-processing/ImageComparison.tsx` — upgrade prompt example (missing `pricingRegion`)
- `server/analytics/analyticsService.ts` — server-side analytics service

**Why This Matters:**

We're offering significant discounts (up to 65% off) without data to validate they work. If discounted regions don't convert better, we're leaving revenue on the table. If they do convert better, we need to know by how much to optimize further. The current ~90% missing data gap makes any analysis impossible.

---

## 2. Root Cause Analysis

**Why is `pricingRegion` missing?**

1. **Late addition to tracking:** `pricingRegion` was added to analytics types AFTER the regional pricing feature launched, so historical data is missing the property.

2. **Upgrade prompt events don't include region:** `upgrade_prompt_shown`, `upgrade_prompt_clicked`, and `upgrade_prompt_dismissed` events are fired from multiple components that don't have access to `useRegionTier()` hook:
   - `ImageComparison.tsx` (after_comparison trigger)
   - `ModelGalleryModal.tsx` (model_gate trigger)
   - `PremiumUpsellModal.tsx` (premium_upsell trigger)
   - `AfterUpscaleBanner.tsx` (after_upscale trigger)
   - `OutOfCreditsModal.tsx` (out_of_credits trigger)
   - `PostDownloadPrompt.tsx` (after_download trigger)

3. **No server-side validation:** The analytics API (`/api/analytics/event`) doesn't validate that `pricingRegion` is present for pricing-related events.

4. **Racing condition on pricing page:** `PricingPageClient.tsx` tracks `pricing_page_viewed` before `useRegionTier()` has finished loading, resulting in `pricingRegion = undefined` in many cases.

---

## 3. Solution

### Approach A: Tracking Fix (Required)

Ensure **100% of pricing-related events** include `pricingRegion`:

1. **Add `pricingRegion` to upgrade prompt events**
   - Modify `IUpgradePromptShownProperties`, `IUpgradePromptClickedProperties`, `IUpgradePromptDismissedProperties` to include `pricingRegion?: string`
   - Pass `pricingRegion` through all upgrade prompt components

2. **Fix racing condition on pricing page**
   - Ensure `pricing_page_viewed` only fires after `useRegionTier()` has loaded
   - Make `pricingRegion` required, not optional, for this event

3. **Add server-side validation**
   - Validate `pricingRegion` is present in pricing-related events
   - Log warnings when missing (for debugging)

4. **Add `pricingRegion` to user properties**
   - Set `pricingRegion` as a user property via `$identify` event
   - Enables regional cohort analysis even if individual events are missing data

### Approach B: Analysis Dashboard (Required)

Create an Amplitude dashboard for regional pricing analysis:

1. **Conversion rate by pricingRegion**
   - Funnel: `pricing_page_viewed` -> `checkout_started` -> `checkout_completed`
   - Segmented by `pricingRegion` (standard, south_asia, southeast_asia, latam, eastern_europe, africa)

2. **Revenue per user by region**
   - ARPU (Average Revenue Per User) by `pricingRegion`
   - LTV (Lifetime Value) comparison

3. **Discount sensitivity analysis**
   - Compare conversion rates between regions with different discount levels
   - Correlation between discount % and conversion rate

4. **Alerting**
   - Alert when conversion by region deviates >20% from baseline
   - Alert when `pricingRegion` coverage drops below 95%

**Architecture Diagram:**

```mermaid
flowchart LR
    subgraph Client
        A[Upgrade Prompt Components] -->|fires| B[analytics.track]
        C[Pricing Page] -->|fires| B
        D[useRegionTier Hook] -->|provides| A
        D -->|provides| C
    end

    subgraph Server
        B -->|POST| E[/api/analytics/event]
        E -->|validates| F[Validation Layer]
        F -->|pricingRegion required| G[Amplitude]
    end

    subgraph Amplitude
        G -->|$identify| H[User Properties]
        G -->|events| I[Regional Dashboard]
    end

    I -->|alerts| J[Conversion Deviation]
```

**Key Decisions:**

- **Make `pricingRegion` required for pricing events** — not optional. If missing, the event should not fire.
- **Set as user property** — once set, enables historical analysis even if some events are missing
- **No backfill** — historical events can't be reliably backfilled (CF-IPCountry not stored), but we can analyze going forward
- **Graceful fallback** — if `useRegionTier()` fails to load, use `'standard'` as default (conservative, assumes no discount)

---

## 4. Execution Phases

### Phase 1: Analytics Type Updates — "All pricing events have pricingRegion"

**Files (2):**

- `server/analytics/types.ts` — add `pricingRegion` to upgrade prompt properties
- `tests/unit/analytics/analytics-types.unit.spec.ts` — NEW: validate type updates

**Implementation:**

- [ ] Update `IUpgradePromptShownProperties`:
  ```typescript
  export interface IUpgradePromptShownProperties {
    trigger: IUpgradePromptTrigger;
    imageVariant?: string;
    currentPlan: 'free' | 'starter' | 'hobby' | 'pro' | 'business';
    pricingRegion: string; // Changed from optional to required
  }
  ```
- [ ] Update `IUpgradePromptClickedProperties` — add `pricingRegion: string` (required)
- [ ] Update `IUpgradePromptDismissedProperties` — add `pricingRegion: string` (required)
- [ ] Change `IPricingPageViewedProperties.pricingRegion` from optional to required
- [ ] Change `ICheckoutStartedProperties.pricingRegion` from optional to required
- [ ] Change `ICheckoutCompletedProperties.pricingRegion` from optional to required
- [ ] Change `ICheckoutAbandonedProperties.pricingRegion` from optional to required

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `tests/unit/analytics/analytics-types.unit.spec.ts` | `should require pricingRegion on pricing events` | TypeScript compilation fails if missing |
| same | `should require pricingRegion on upgrade prompt events` | TypeScript compilation fails if missing |

**Verification Plan:**

1. TypeScript compilation fails if `pricingRegion` is missing from any pricing event
2. Unit tests validate type definitions

---

### Phase 2: Upgrade Prompt Components — "All prompts include pricingRegion"

**Files (7):**

- `client/components/features/image-processing/ImageComparison.tsx` — add `pricingRegion` to upgrade prompt
- `client/components/features/workspace/ModelGalleryModal.tsx` — add `pricingRegion` to upgrade prompt
- `client/components/features/workspace/PremiumUpsellModal.tsx` — add `pricingRegion` to upgrade prompt
- `client/components/features/workspace/AfterUpscaleBanner.tsx` — add `pricingRegion` to upgrade prompt
- `client/components/stripe/OutOfCreditsModal.tsx` — add `pricingRegion` to upgrade prompt
- `client/components/features/workspace/PostDownloadPrompt.tsx` — add `pricingRegion` to upgrade prompt
- `tests/unit/client/upgrade-prompts-with-region.unit.spec.ts` — NEW: validate region tracking

**Implementation:**

For each component:

- [ ] Import `useRegionTier` hook
- [ ] Call `const { pricingRegion } = useRegionTier()`
- [ ] Pass `pricingRegion` to all `analytics.track('upgrade_prompt_shown')` calls
- [ ] Pass `pricingRegion` to all `analytics.track('upgrade_prompt_clicked')` calls
- [ ] Pass `pricingRegion` to all `analytics.track('upgrade_prompt_dismissed')` calls
- [ ] Use fallback: `pricingRegion || 'standard'` to handle loading state

**Example Pattern:**

```typescript
// Before
analytics.track('upgrade_prompt_shown', {
  trigger: 'after_comparison',
  currentPlan: 'free',
});

// After
const { pricingRegion } = useRegionTier();
analytics.track('upgrade_prompt_shown', {
  trigger: 'after_comparison',
  currentPlan: 'free',
  pricingRegion: pricingRegion || 'standard',
});
```

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `tests/unit/client/upgrade-prompts-with-region.unit.spec.ts` | `should include pricingRegion in upgrade_prompt_shown` | Property present in event |
| same | `should include pricingRegion in upgrade_prompt_clicked` | Property present in event |
| same | `should fallback to standard when pricingRegion is undefined` | Uses `'standard'` |
| same | `should not fire upgrade_prompt_shown for paid users` | Existing behavior preserved |

**Verification Plan:**

1. All upgrade prompt unit tests pass
2. `yarn verify` passes

---

### Phase 3: Pricing Page Race Condition Fix — "pricing_page_viewed always has region"

**Files (2):**

- `app/[locale]/pricing/PricingPageClient.tsx` — fix race condition
- `tests/unit/pricing/pricing-page-tracking.unit.spec.ts` — NEW: validate tracking

**Implementation:**

- [ ] Modify the `useEffect` that tracks `pricing_page_viewed`:
  - Add `pricingRegion` to dependency array
  - Only fire when `pricingRegion` is defined (not `undefined`)
  - Remove fallback to `'standard'` — wait for actual region

```typescript
// Current (buggy) — fires before region is loaded
useEffect(() => {
  if (loading) return;
  if (hasTrackedPageView.current) return;
  hasTrackedPageView.current = true;
  // ... tracking code with fallback
  pricingRegion: pricingRegion || 'standard',
}, [loading]);

// Fixed — waits for region
useEffect(() => {
  if (loading) return;
  if (hasTrackedPageView.current) return;
  if (!pricingRegion) return; // Wait for region to load
  hasTrackedPageView.current = true;
  // ... tracking code
  pricingRegion: pricingRegion, // No fallback needed
}, [loading, pricingRegion]);
```

- [ ] Add timeout fallback: if `pricingRegion` is still undefined after 3 seconds, use `'standard'` and log warning

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `tests/unit/pricing/pricing-page-tracking.unit.spec.ts` | `should wait for pricingRegion before tracking` | Event not fired until region loaded |
| same | `should include pricingRegion in pricing_page_viewed` | Property present |
| same | `should fallback to standard after timeout` | Uses `'standard'` after 3s |
| same | `should only track once per session` | Existing behavior preserved |

**Verification Plan:**

1. Unit tests pass
2. Manual: Open pricing page, verify `pricing_page_viewed` has `pricingRegion` in Amplitude

---

### Phase 4: Server-Side Validation — "Analytics API enforces pricingRegion"

**Files (2):**

- `app/api/analytics/event/route.ts` — add validation
- `tests/unit/api/analytics-validation.unit.spec.ts` — NEW: validation tests

**Implementation:**

- [ ] Define pricing-related events that require `pricingRegion`:
  ```typescript
  const PRICING_EVENTS_REQUIRING_REGION = [
    'pricing_page_viewed',
    'upgrade_prompt_shown',
    'upgrade_prompt_clicked',
    'upgrade_prompt_dismissed',
    'checkout_started',
    'checkout_completed',
    'checkout_abandoned',
  ] as const;
  ```
- [ ] Add validation in analytics event handler:
  - If event name is in `PRICING_EVENTS_REQUIRING_REGION` and `pricingRegion` is missing:
    - Log warning to console
    - Track to Baselime (in production)
    - Still accept the event (don't break tracking), but with `'standard'` as default
- [ ] Add validation for `pricingRegion` value: must be one of valid regions

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `tests/unit/api/analytics-validation.unit.spec.ts` | `should warn when pricingRegion missing on pricing events` | Warning logged |
| same | `should default to standard when pricingRegion missing` | Event accepted with default |
| same | `should reject invalid pricingRegion values` | Returns 400 for invalid region |

**Verification Plan:**

1. Unit tests pass
2. Manual: Send analytics event without `pricingRegion`, verify warning logged

---

### Phase 5: User Property & Dashboard — "Regional analysis is actionable"

**Files (3):**

- `app/api/geo/route.ts` — return `pricingRegion` for user property
- `server/analytics/analyticsService.ts` — add helper for user property
- `docs/analysis/regional-pricing-dashboard.md` — NEW: dashboard spec

**Implementation:**

- [ ] Create `setPricingRegionUserProperty(userId, pricingRegion)` helper in `analyticsService.ts`:
  ```typescript
  export async function setPricingRegionUserProperty(
    userId: string,
    pricingRegion: string,
    options: IServerTrackOptions
  ): Promise<boolean> {
    return trackServerEvent(
      '$identify',
      {
        $set: { pricing_region: pricingRegion },
      },
      { ...options, userId }
    );
  }
  ```
- [ ] Call `$identify` with `pricing_region` when:
  - User first visits pricing page (client-side)
  - User completes checkout (server-side)
- [ ] Create Amplitude dashboard spec document with:
  - Conversion funnel by region
  - Revenue comparison charts
  - Alert configuration
- [ ] Build the dashboard in Amplitude (manual step, outside code)

**Dashboard Specification:**

| Chart Type | Query | Purpose |
|------------|-------|---------|
| Funnel | `pricing_page_viewed` -> `checkout_completed` segmented by `pricing_region` | Compare conversion rates |
- | Revenue per user by `pricing_region` | ARPU comparison |
- | Revenue per user by `pricing_region` | LTV comparison |
- | Cohort analysis by `pricing_region` | Retention comparison |
- | Alert | Conversion rate deviation >20% | Anomaly detection |

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `tests/unit/analytics/user-properties.unit.spec.ts` | `should set pricing_region user property via $identify` | Property set correctly |
| same | `should only set once per user` | `$setOnce` used |

**Verification Plan:**

1. Unit tests pass
2. Manual: Check Amplitude user properties after visiting pricing page
3. Dashboard is created in Amplitude

---

### Phase 6: Checkout Events Region Fix — "Checkout has complete regional data"

**Files (2):**

- `app/api/checkout/route.ts` — ensure `pricingRegion` is always included
- `tests/unit/api/checkout-region-tracking.unit.spec.ts` — NEW: checkout tests

**Implementation:**

- [ ] In `checkout/route.ts` POST handler:
  - Ensure `pricingRegion` is always derived from `CF-IPCountry` via `getPricingRegion()`
  - Pass `pricingRegion` to `trackServerEvent('checkout_started')`
  - Include `pricingRegion` in Stripe session metadata
- [ ] In webhook handler (`webhooks/stripe`):
  - Extract `pricingRegion` from session metadata
  - Pass to `trackServerEvent('checkout_completed')`

**Tests Required:**

| Test File | Test Name | Assertion |
|-----------|-----------|-----------|
| `tests/unit/api/checkout-region-tracking.unit.spec.ts` | `should include pricingRegion in checkout_started` | Property present |
| same | `should derive pricingRegion from CF-IPCountry` | Correct region mapped |
| same | `should include pricingRegion in session metadata` | Metadata includes region |

**Verification Plan:**

1. Unit tests pass
2. Manual: Test checkout from different regions (via test headers)

---

## 5. Decision Criteria

**4 weeks after full implementation:**

| Scenario | Action |
|----------|--------|
| Discounted regions convert **2x+ better** than standard | Keep pricing, consider expanding to more countries |
| Discounted regions convert **1.2x-2x better** than standard | Keep pricing, monitor for optimization |
| Discounted regions convert **same or worse** than standard | Investigate UX issues or adjust discounts |
| **No data** (coverage <95%) | Investigate tracking implementation |

**ROI Calculation:**

```
ROI = (Revenue from discounted regions - Revenue at standard pricing) / Discount amount given

If ROI > 1: Discounts are profitable
If ROI < 1: We're losing money vs. standard pricing
```

---

## 6. Success Metrics

**Technical Metrics (immediate):**

- [ ] 100% of `pricing_page_viewed` events have `pricingRegion` (within 1 week)
- [ ] 100% of `upgrade_prompt_shown` events have `pricingRegion` (within 1 week)
- [ ] 100% of `checkout_started` events have `pricingRegion` (within 1 week)
- [ ] 95%+ of users have `pricing_region` user property set (within 2 weeks)

**Business Metrics (4 weeks):**

- [ ] Clear visibility into conversion rate by `pricingRegion`
- [ ] Data-driven decision on whether to keep/adjust/expand regional pricing
- [ ] Amplitude dashboard created and monitored
- [ ] Alerting configured for conversion anomalies

**Long-term:**

- [ ] Regional pricing optimization based on actual conversion data
- [ ] Potential expansion to additional countries if ROI positive

---

## 7. Acceptance Criteria

- [ ] All 6 phases complete
- [ ] All specified tests pass
- [ ] `yarn verify` passes
- [ ] 100% of pricing-related events include `pricingRegion` (measured in Amplitude)
- [ ] Amplitude dashboard created with all specified charts
- [ ] Data-driven pricing decision made within 4 weeks of implementation
- [ ] No regression in existing tracking functionality

---

## 8. Open Questions

1. **Backfill strategy:** Should we attempt to backfill `pricingRegion` for users who have visited pricing page but have no `pricing_region` user property? (Probably not worth it — CF-IPCountry not stored, can't reliably infer)

2. **Privacy:** Is storing `pricingRegion` as a user property compliant with our privacy policy? (Yes — it's derived from country, not PII, and used for pricing only)

3. **VPN users:** Should we alert on `pricing_region_mismatch` events where detected region differs from previous visits? (Already tracked, but no dashboard yet — add to Phase 5)

4. **Standard region dominance:** If 80%+ of users are `standard`, how do we ensure statistical significance for regional analysis? (May need longer data collection period)

---

## 9. Related Work

- **Regional Dynamic Pricing PRD:** `docs/PRDs/regional-dynamic-pricing.md` — Describes the regional pricing system this PRD aims to measure
- **Analytics Improvements:** `docs/PRDs/analytics-improvements.md` — General analytics gaps and improvements

---

## 10. Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 1: Analytics Types | 2 hours | None |
| Phase 2: Upgrade Prompts | 4 hours | Phase 1 |
| Phase 3: Pricing Page Fix | 3 hours | Phase 1 |
| Phase 4: Server Validation | 2 hours | Phase 1 |
| Phase 5: User Property & Dashboard | 4 hours | Phase 1 |
| Phase 6: Checkout Events | 2 hours | None |
| **Total Implementation** | **17 hours** | ~2-3 days |
| Data Collection | 4 weeks | After implementation |
| Analysis & Decision | 1 week | After data collection |

**Total: ~5-6 weeks from start to decision**
