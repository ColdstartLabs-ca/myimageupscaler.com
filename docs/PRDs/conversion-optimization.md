# Conversion Optimization — From 0.30% to 1%+ Paid Conversion

## Context

**Current conversion funnel (Feb 2026):**

- 2,020 total users → 6 paying = **0.30% overall conversion**
- US: 1.18% conversion (5/424) — best geo
- UK: 1.56% conversion (1/64) — small sample
- Philippines: 0% (617 users, 37% download rate) — high engagement, zero revenue
- India: 0% (161 users, 28% download rate) — same pattern

**Paywall performance:**

- ~6% of active users hit the batch limit
- 12% of limit-hitters click upgrade
- Unclear how many view pricing → start checkout → complete

**Key insight:** The users who paid likely converted via direct paths (pSEO CTA, pricing page), not the paywall modal. The modal copy/design may be underperforming.

**Dependency:** PRD 1 (Analytics) must ship first or in parallel. We need `pricing_page_viewed`, `checkout_abandoned`, and revenue tracking to measure optimization impact.

## Problem Statement

Three conversion bottlenecks:

1. **Paywall modal underperforms**: 12% click-through from batch limit, but unclear conversion after click
2. **No visibility into the pricing → checkout → payment funnel**: Can't optimize what we can't measure
3. **High-engagement low-income geos dominate traffic**: PH/IN users engage heavily but don't convert, diluting metrics

## Goals

1. Increase overall paid conversion from 0.30% to 1.0%+ within 12 weeks
2. Increase paywall → checkout click-through from 12% to 25%+
3. Understand and optimize the full pricing → payment funnel
4. Test whether geo-targeted approaches improve conversion

## Non-Goals

- Changing pricing tiers or amounts (separate decision)
- PPP (Purchasing Power Parity) pricing (complexity vs. revenue at this scale)
- Enterprise sales or B2B outreach
- Free trial changes (already exists, separate PRD)

## Implementation Spec

### Phase 1: Funnel Visibility (Ships with PRD 1)

Before optimizing anything, we need to see the full funnel. This ships as part of Analytics Instrumentation V2:

```
batch_limit_modal_shown (tracked)
  → batch_limit_upgrade_clicked (tracked)
    → pricing_page_viewed (NEW - PRD 1)
      → checkout_started (tracked)
        → checkout_completed (tracked) OR checkout_abandoned (NEW - PRD 1)
```

**Action items from PRD 1:**

- `pricing_page_viewed` event with `entryPoint` property
- `checkout_abandoned` event with `timeSpentMs` and `step`

After 1-2 weeks of data, identify the biggest drop-off point and focus there.

### Phase 2: Paywall Modal Optimization

The BatchLimitModal currently fires when users hit their batch limit. Current flow:

1. User adds too many images → modal shows
2. Modal says "upgrade to process more" → 12% click "Upgrade"
3. User lands on... pricing page? Direct checkout? (unclear)

#### 2A. Audit & Improve Modal Copy

**File:** `client/components/features/workspace/BatchLimitModal.tsx`

Current problems to investigate:

- Is the value proposition clear? ("Process unlimited images" vs. "Add more to your batch")
- Is the CTA action clear? (Where does "Upgrade" take them?)
- Is there urgency or social proof?

**Proposed improvements:**

- Show what the user gets: "Upgrade to Pro: 500 images/month, premium models, priority processing"
- Add social proof: "Join 1,000+ photographers who upgraded" (when we have the numbers)
- Show the price inline: "$9/month" so they know before clicking
- Add a "Try free trial" option if available
- Track which copy variant performs better (A/B via simple flag)

#### 2B. Out of Credits Modal Optimization

**File:** `client/components/stripe/OutOfCreditsModal.tsx`

This modal fires when users run out of credits (different from batch limit). Same optimization principles:

- Show credit pack options inline
- "Buy 50 credits for $5" vs. "Upgrade your plan"
- Quick-buy option without leaving the page

#### 2C. Contextual Upgrade Prompts

Add upgrade prompts at high-intent moments (not just limits):

1. **Premium model gate**: When a free user views a premium model in the gallery → "This model is available on Pro. Try it free for 7 days."
2. **After 3rd free upscale**: Subtle banner → "You've upscaled 3 images today. Upgrade for unlimited access."
3. **After comparison view** (from PRD 2): "Love the result? Upgrade for premium quality models."

**New events:**

- `upgrade_prompt_shown` with `trigger` (batch_limit, out_of_credits, premium_model, usage_threshold, post_comparison)
- `upgrade_prompt_clicked` with same `trigger`
- `upgrade_prompt_dismissed` with same `trigger`

### Phase 3: Pricing Page Optimization

#### 3A. Entry Point Tracking

With `pricing_page_viewed` tracking `entryPoint`, we can see which paths lead to the pricing page:

- Direct (SEO/bookmark)
- Navbar click
- BatchLimitModal → Upgrade
- OutOfCreditsModal → Upgrade
- pSEO CTA
- Post-comparison prompt

Optimize the highest-traffic entry points first.

#### 3B. Pricing Page Improvements

**File:** Pricing page component (find via `app/(pages)/pricing/` or similar)

Improvements to test:

1. **Highlight the most popular plan** with a "Most Popular" badge
2. **Show savings for annual billing** prominently ("Save 20%")
3. **Add testimonials or social proof** from existing paying users
4. **Feature comparison table** showing free vs. paid clearly
5. **FAQ section** addressing common objections (refund policy, cancel anytime, etc.)
6. **Trust signals**: Stripe badge, money-back guarantee, cancel anytime

#### 3C. Reduce Checkout Friction

**File:** `client/components/stripe/CheckoutModal.tsx`

Currently uses Stripe Embedded Checkout. Potential improvements:

- Show a loading skeleton while Stripe loads (reduce perceived wait)
- Add a "secure checkout" trust indicator
- If checkout abandoned, follow up with email if captured (from PRD 2)
- Track `checkout_loaded` event (time from open to Stripe iframe ready)

### Phase 4: Geographic Targeting (Priority: MEDIUM)

#### 4A. Understand Geo Conversion Patterns

Once analytics is running, segment by country:

- Which countries have highest download rate but 0% conversion?
- Which have the highest pricing page view → checkout rate?
- Are PH/IN users hitting the paywall at similar rates to US/UK?

#### 4B. Geo-Aware Messaging (Not Pricing)

Instead of PPP pricing (complex), test messaging changes:

- For high-engagement/low-income geos: Emphasize free tier value, credit packs (lower commitment than subscriptions)
- For US/UK/EU: Emphasize premium features, quality difference, business use cases
- For returning users from paying geos who haven't upgraded: More aggressive prompts

**Implementation:** Use the `country` from Amplitude user properties (already available via IP geolocation) to determine messaging variant. Simple client-side logic, no server changes.

## Analytics Events (New)

| Event                      | Properties               | Location                |
| -------------------------- | ------------------------ | ----------------------- |
| `upgrade_prompt_shown`     | `trigger`, `currentPlan` | Various components      |
| `upgrade_prompt_clicked`   | `trigger`, `currentPlan` | Various components      |
| `upgrade_prompt_dismissed` | `trigger`, `currentPlan` | Various components      |
| `checkout_loaded`          | `loadTimeMs`, `priceId`  | CheckoutModal           |
| `pricing_plan_viewed`      | `planName`, `priceId`    | PricingCard hover/focus |

## Implementation Priority

| Phase | What                          | Effort                     | Expected Impact                       |
| ----- | ----------------------------- | -------------------------- | ------------------------------------- |
| **1** | Funnel visibility (via PRD 1) | 0 days (included in PRD 1) | See where users drop off              |
| **2** | Paywall modal improvements    | 2-3 days                   | 12% → 20%+ click-through              |
| **3** | Pricing page optimization     | 2-3 days                   | Improve pricing → checkout conversion |
| **4** | Contextual upgrade prompts    | 2-3 days                   | Surface upgrade opportunities earlier |
| **5** | Geo-aware messaging           | 1-2 days                   | Better targeting for paying geos      |

## Validation Criteria

### Key Metrics

- **Overall conversion**: 0.30% → 1.0% (target)
- **Paywall click-through**: 12% → 25% (target)
- **Pricing page → checkout**: Baseline unknown → measure then improve
- **Checkout completion rate**: Baseline unknown → measure then improve
- **Revenue per user**: Track via Amplitude Revenue (from PRD 1)

### Success Criteria

- Overall paid conversion > 0.75% within 8 weeks
- Paywall modal click-through > 20% within 4 weeks
- At least 50% of checkout sessions complete (once measured)
- Revenue growth: at least 2x current MRR within 12 weeks

## Testing

- Unit tests for upgrade prompt display logic (when to show, when not to)
- Unit tests for geo-targeting logic
- E2E test: batch limit → modal → upgrade click → pricing page → checkout
- E2E test: out of credits → modal → credit pack purchase
- A/B test framework for modal copy variants (simple localStorage flag)

## Risks

- **Over-prompting**: Too many upgrade prompts will annoy users and hurt retention. Limit to max 1 prompt per session per trigger type.
- **Geo-targeting accuracy**: IP geolocation isn't perfect. Use Amplitude's built-in geo, don't roll our own.
- **Small sample sizes**: With 6 paying users, statistical significance takes time. Focus on directional improvements, not p-values.
- **Checkout abandonment follow-up**: Requires email capture (PRD 2) to be effective. Ships independently but works better together.
