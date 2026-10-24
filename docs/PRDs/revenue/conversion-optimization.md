# Conversion Optimization — From 0.30% to 1%+ Paid Conversion

## Context

**Current conversion funnel (Feb 2026):**

- 2,020 total users → 6 paying = **0.30% overall conversion**
- US: 1.18% (5/424) — strongest geo
- UK: 1.56% (1/64) — small sample, encouraging
- Philippines: 0% (617 users, 37% download rate) — high engagement, zero revenue
- India: 0% (161 users, 28% download rate) — same pattern

**What Stripe data tells us (Feb 2026):**

> **Most paying users buy the $5 credit pack — not subscriptions.**

This is the single most important signal in the dataset. Users prefer a low-commitment, pay-as-you-go purchase over a recurring subscription. Implications:

- The `OutOfCreditsModal` already defaults to the **Buy Credits** tab — this is correct, keep it.
- The `PremiumUpsellModal` sends users to `/pricing` (subscription-first) — this may be the wrong destination. Consider sending to `/dashboard/billing` (credit-first) or showing an inline credit purchase.
- Pricing page messaging should lead with credits, surface subscriptions as "save more when you use us regularly."

**Paywall performance:**

- ~6% of active users hit the batch limit
- 12% of limit-hitters click "Upgrade"
- Drop-off after that: unknown (Phase 1 now answered this)

**Key insight:** Users who paid likely converted via direct paths (pSEO CTA, pricing page), not the paywall modal. The modal copy and destination need work.

---

## Problem Statement

Three conversion bottlenecks:

1. **PremiumUpsellModal underperforms** — fires randomly for free users mid-session, shows the same 2 images every time, no tracking of which variant drives action
2. **Modal sends users to the wrong place** — `/pricing` is subscription-first; most buyers want credits
3. **No measurement** — can't improve what we can't see

---

## Goals

1. Increase overall paid conversion from 0.30% → 1.0%+ within 12 weeks
2. Increase modal → purchase click-through from ~12% → 25%+
3. Learn which before/after image variant drives the most upgrades
4. Redirect high-intent modal clicks toward the credit purchase path

---

## Non-Goals

- Changing pricing tiers or amounts
- PPP pricing
- Enterprise sales or B2B
- Free trial changes (separate PRD)

---

## Implementation Spec

### ✅ Phase 1: Funnel Visibility (DONE — Analytics PRD shipped)

The full funnel is now instrumented:

```
batch_limit_modal_shown
  → batch_limit_upgrade_clicked
    → pricing_page_viewed (entryPoint tracked)
      → checkout_started
        → checkout_completed OR checkout_abandoned (timeSpentMs, step)
```

**What to do now:** Pull 1–2 weeks of Amplitude data. Find the biggest drop-off step and focus Phase 2–3 there.

---

### Phase 2: PremiumUpsellModal — Before/After A/B Test

**File:** `client/components/features/workspace/PremiumUpsellModal.tsx`

**Current state:** Modal shows one of 2 static images (bird, girl) at random. No tracking. Sends users to `/pricing`.

**What to change:**

#### 2A. Expand Image Variants

Add two new before/after image sets. Each variant gets a stable `label` used as the Amplitude property:

| Variant       | Before                                  | After                                  | Label         |
| ------------- | --------------------------------------- | -------------------------------------- | ------------- |
| `bird`        | `/before-after/bird-before.webp`        | `/before-after/bird-after.webp`        | `bird`        |
| `girl`        | `/before-after/girl-before.webp`        | `/before-after/girl-after.webp`        | `girl`        |
| `face-pro`    | `/before-after/face-pro/before.webp`    | `/before-after/face-pro/after.webp`    | `face-pro`    |
| `budget-edit` | `/before-after/budget-edit/before.webp` | `/before-after/budget-edit/after.webp` | `budget-edit` |

The starting variant is chosen randomly each time the modal opens. This gives us a ~25% split per variant.

#### 2B. Add Amplitude Tracking

Track three events from the modal, always including `imageVariant`:

| Event                      | When                              | Properties                                  |
| -------------------------- | --------------------------------- | ------------------------------------------- |
| `upgrade_prompt_shown`     | Modal opens                       | `imageVariant`, `trigger: 'premium_upsell'` |
| `upgrade_prompt_clicked`   | "View Premium Plans" clicked      | `imageVariant`, `trigger`, `destination`    |
| `upgrade_prompt_dismissed` | "Continue with Free" or X clicked | `imageVariant`, `trigger`                   |

In Amplitude, filter by `upgrade_prompt_shown` → `upgrade_prompt_clicked` per `imageVariant` to get conversion rate per variant. After ~200 modal views, we'll have directional signal.

Add these three event names to `server/analytics/types.ts`:

- `upgrade_prompt_shown`
- `upgrade_prompt_clicked`
- `upgrade_prompt_dismissed`

#### 2C. Fix the Destination

"View Premium Plans" currently goes to `/pricing`. Based on Stripe data (users buy credits, not subscriptions), change destination to `/dashboard/billing` — the billing page shows the credit pack selector inline.

Track `destination: 'billing'` on the `upgrade_prompt_clicked` event so we can revert if it hurts conversion.

---

### Phase 3: OutOfCreditsModal Optimization

**File:** `client/components/stripe/OutOfCreditsModal.tsx`

**Current state:** Already defaults to "Buy Credits" tab — correct. Subscription option is secondary.

**What to improve:**

- Show the most popular pack with a "Most Popular" badge (the $5 pack, per Stripe data)
- Add inline quick-buy without leaving the page (already done via `CreditPackSelector`)
- Track `upgrade_prompt_shown` / `upgrade_prompt_clicked` here too, with `trigger: 'out_of_credits'`

---

### Phase 4: Pricing Page — Credits First

**File:** Pricing page component (`app/(pages)/pricing/` or similar)

Stripe data says credits convert better than subscriptions. Reorder the page:

1. **Credits section first** — "Need just a few upscales? Buy credits, no commitment."
2. **Subscription section second** — "Upscale regularly? A plan saves you money."
3. Highlight the $5 pack with "Most Popular" (it's what people actually buy)
4. Add trust signals: Stripe badge, "cancel anytime," money-back note

---

### Phase 5: Contextual Upgrade Prompts

Add upgrade prompts at high-intent moments beyond the batch limit:

1. **Premium model gate** — free user hovers a premium model in gallery → "Available on Pro. Try it free."
2. **After 3rd free upscale** — subtle banner → "You've upscaled 3 images. Upgrade for unlimited."
3. **After comparison view** — "Love the result? Unlock premium quality."

All three fire `upgrade_prompt_shown` with the appropriate `trigger` value.

---

### Phase 6: Geographic Targeting (Priority: MEDIUM)

Once analytics is running for 2+ weeks, segment by country:

- Which geos convert pricing page views → checkout at highest rates?
- Are PH/IN users hitting the paywall at similar rates to US/UK?

**Messaging approach (not pricing):**

- High-engagement/low-income geos: Lead with credit packs, downplay subscriptions
- US/UK/EU: Lead with quality difference, business use cases, subscription value

Implementation: Client-side using `country` from Amplitude user properties. No server changes.

---

## Analytics Events

| Event                      | Properties                                              | Location                                                  |
| -------------------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| `upgrade_prompt_shown`     | `trigger`, `imageVariant`, `currentPlan`                | PremiumUpsellModal, OutOfCreditsModal, contextual prompts |
| `upgrade_prompt_clicked`   | `trigger`, `imageVariant`, `destination`, `currentPlan` | Same                                                      |
| `upgrade_prompt_dismissed` | `trigger`, `imageVariant`, `currentPlan`                | Same                                                      |
| `checkout_loaded`          | `loadTimeMs`, `priceId`                                 | CheckoutModal                                             |
| `pricing_plan_viewed`      | `planName`, `priceId`                                   | PricingCard hover/focus                                   |

---

## Implementation Priority

| Phase | What                                                         | Effort   | Expected Impact                          |
| ----- | ------------------------------------------------------------ | -------- | ---------------------------------------- |
| **1** | ~~Funnel visibility~~                                        | ✅ Done  | Baseline established                     |
| **2** | PremiumUpsellModal — A/B images + tracking + destination fix | 1 day    | Learn what converts; fix credits routing |
| **3** | OutOfCreditsModal — badge + tracking                         | 0.5 days | Directional signal on credits path       |
| **4** | Pricing page — credits first                                 | 1 day    | Align page to buying behavior            |
| **5** | Contextual upgrade prompts                                   | 2 days   | Surface upgrade opportunities earlier    |
| **6** | Geo-aware messaging                                          | 1 day    | Better targeting for paying geos         |

---

## Validation Criteria

### Key Metrics

- **Overall conversion**: 0.30% → 1.0% (target)
- **Modal click-through**: 12% → 25%+ (target)
- **Best-performing image variant**: Identified after 200+ modal views
- **Credits vs. subscription revenue split**: Track monthly via Stripe dashboard

### Success Criteria

- Overall paid conversion > 0.75% within 8 weeks
- PremiumUpsellModal click-through > 20% within 4 weeks
- Image variant with highest conversion identified within 3 weeks
- Revenue 2x current MRR within 12 weeks

---

## Testing

- Unit tests for `upgrade_prompt_shown` trigger logic (when modal fires, frequency cap)
- Unit tests for image variant selection (random, all 4 variants accessible)
- E2E: batch limit → PremiumUpsellModal → "View Plans" → billing page → credit purchase
- E2E: out of credits → modal → credit pack purchase

---

## Risks

- **Over-prompting**: Cap to 1 prompt per session per trigger type. `hasSeenPremiumUpsell` already prevents repeat within a session.
- **Wrong destination**: If billing page hurts conversion vs. pricing, revert via `destination` tracking.
- **Small sample sizes**: With ~6 paying users baseline, significance takes time. Optimize for directional signal, not p-values.
- **Checkout abandonment follow-up**: Requires email capture (separate PRD) to be effective.
