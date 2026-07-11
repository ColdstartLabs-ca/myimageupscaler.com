# Revenue Optimization Report — 2026-07-10

Analysis of production database (Supabase), monetization architecture, and conversion funnel to identify the highest-leverage revenue opportunities.

## TL;DR

The product monetizes as a **credit-pack business, not a subscription business** (249 pack buyers vs 34 subscribers ever, 5 active). Signups are growing fast (1.4k/mo in Feb → 4.8k/mo in June) but **paid conversion is collapsing** (4.8% of monthly signups bought in Feb → ~1.1% in June, and new subscriptions dropped to zero in June/July). Meanwhile, the single cheapest revenue lever — lifecycle email — is effectively offline: **93.5% of queued emails (81,539) are suppressed by the frequency cap** and 1,106 sends failed because all (free-tier) email providers were exhausted.

**Real revenue (Stripe, corp account since Apr 2026 migration):** MRR is **$95** (5 subscribers: 3× Starter, 1× Hobby, 1× Pro). One-time pack revenue is ~**$250–430/month** gross and dominated by the **$4.99 Small pack (47% of all charges)** plus regionally discounted variants ($1–4). The business is ~80% one-time purchases at low price points.

Top 3 actions: (1) fix email delivery + suppression, (2) diagnose the Feb→June conversion collapse, (3) restructure monetization around credit packs and repeat purchases instead of subscriptions — starting with the pricing incoherences in §5.

---

## 1. Business snapshot (from production data)

| Metric                                | Value                                        |
| ------------------------------------- | -------------------------------------------- |
| Total profiles                        | 19,602                                       |
| Signups/month                         | Feb 1,366 → Jun 4,791 (3.5× growth)          |
| Activation (used ≥1 credit, last 90d) | 7,831 / 12,737 = **61%**                     |
| Users who ever bought a credit pack   | 249 (491 purchases)                          |
| Repeat pack buyers                    | 87 / 249 = **35%**                           |
| Subscriptions ever                    | 34 (5 active, 29 canceled)                   |
| Avg time-to-cancel                    | ~13–25 days (most cancel within first cycle) |
| Revenue recovery intents converted    | 7 / 289 (2.4%)                               |

**Usage distribution** (13,699 users with usage): 89% used fewer than 5 credits; only 324 users used 10+. The market is overwhelmingly light users — which explains why one-time packs outsell subscriptions ~9:1 by buyer count. The 324 heavy users are the realistic subscription audience.

### The alarming trend: conversion is collapsing while traffic grows

| Month         | Signups | Pack buyers | Buyer rate | New sub credit grants |
| ------------- | ------- | ----------- | ---------- | --------------------- |
| Feb           | 1,366   | 65          | 4.8%       | 10                    |
| Mar           | 3,869   | 50          | 1.3%       | 38                    |
| Apr           | 3,434   | 46          | 1.3%       | 18                    |
| May           | 3,520   | 30          | 0.9%       | 6                     |
| Jun           | 4,791   | 51          | 1.1%       | 1                     |
| Jul (partial) | 2,612   | 22          | ~0.8%      | 0                     |

Either traffic quality shifted (pSEO/AI-referral visitors with lower intent) or something in the funnel regressed around March. **Diagnosing this is more valuable than any new feature** — restoring Feb's conversion rate at June's volume would be ~4× current buyer count.

---

## 2. Critical fixes (broken things costing money now)

### 2.1 Lifecycle email is effectively offline — highest-leverage fix

- 81,539 queued emails (93.5%) skipped with `suppressed_frequency_cap`; only 2,192 ever sent.
- 1,106 failed with "All email providers failed" — the system runs on free tiers (Brevo ~300/day, Cloudflare, Resend) and exhausts them.
- Win-back campaigns are dead on arrival: `winback-credit-holder-21d` sent 68 of 30,840; `winback-never-uploaded-14d` sent 100 of 30,421; `winback-former-buyer-45d` sent **0 of 6,805** — this last one targets proven buyers.
- The just-shipped revenue-recovery cohorts (`docs/PRDs/revenue-recovery-email-cohorts.md`) will hit the same wall.

**Action:** Pay for a real email provider (Resend/Brevo paid tier, ~$20–90/mo for this volume) and rebalance the frequency cap so revenue-critical campaigns (checkout recovery, former-buyer win-back, low/zero credits) take priority over informational ones. This is days of work against tens of thousands of unsent revenue emails.

### 2.2 Experiment reward tracking appears broken

`purchase_modal_default_selection` has ~2,800 assignments and **zero rewards** across all three arms. Either nobody converted from the purchase modal in months (contradicted by ongoing pack purchases) or the reward event isn't firing. The bandit can't learn; the experiment is burning traffic for nothing. Verify the reward hookup in `lib/experiments/experiment-bandit.service.ts` and the purchase-confirmation path.

### 2.3 Ship the winning model-gate arm

`model_gate_purchase_path`: `compact_credit_picker` converts at 0.71% (13/1,832) vs control 0.4% and `subscription_unlock` at 0% (0/115). The subscription-first arm is a proven loser — consistent with the pack-heavy buyer base. Promote `compact_credit_picker` to default and retire the subscription arm.

---

## 3. Strategic: lean into credit packs, fix or de-emphasize subscriptions

Evidence: 249 pack buyers vs 34 subscribers; 85% of subscribers cancel, most within ~2 weeks; 89% of users need <5 credits. Subscriptions as currently designed don't match usage patterns.

1. **Pack-first purchase UX everywhere.** Segment-aware funnel work already points this way; make packs the default tab/CTA for free users (the winning bandit arm confirms it).
2. **Monetize the 35% repeat-buyer behavior:**
   - "Auto top-up" opt-in at purchase (refill 200 credits when balance < 10) — subscription economics with pack psychology.
   - Post-purchase discount on the next pack ("20% off your next pack within 30 days").
   - Larger pack tier for the whales (one user bought 30 times; several bought 5–16 times).
3. **Reposition subscriptions for the 324 heavy users only.** Target the `high-usage-free-user` cohort (241 emails pending — blocked by §2.1) with a subscription pitch. Don't push subscriptions on light users; it produces 13-day cancels.
4. **Add cancel-flow retention** (currently none): offer pause, downgrade-to-credits ("keep your remaining credits as a one-time balance"), or 50% off next month. With 29 of 34 subscribers churned, even modest saves matter proportionally.

---

## 4. Funnel improvements (ordered by expected impact / effort)

1. **Diagnose the Feb→June conversion collapse** (§1). Segment buyer rate by traffic source (Amplitude/GA4), landing page, and region. Check whether pSEO/AI-search traffic growth diluted intent or whether a funnel change around March regressed conversion. Related PRD already exists: `docs/PRDs/click-to-checkout-conversion-fix.md`.
2. **Pre-checkout email capture.** Auth is forced only at checkout, so abandoners who never authenticate are unrecoverable — no email, no recovery campaign. Capture email when a guest clicks any upgrade CTA (already flagged as TODO in `docs/PRDs/checkout-recovery-system.md`).
3. **Post-first-success upsell.** The highest-intent moment (first successful upscale/download) has weak monetization. `FirstDownloadCelebration` exists — add a premium-model comparison teaser ("see this image with Clarity Pro") with a one-click small pack.
4. **Enable trials.** Trial config is fully scaffolded in `shared/config/subscription.config.ts` but `enabled: false` everywhere. A 7-day trial on Hobby for heavy users is a low-risk experiment.
5. **Annual plans.** Types support `interval: 'year'` but no yearly prices exist. Lower priority until subscription retention is fixed — an annual plan sold to users who churn in 13 days invites refund requests.
6. **Communicate regional discounts.** Regional pricing (40–65% off) is applied silently. A "pricing adjusted for your region" badge builds trust and lifts conversion in exactly the regions the bandit shows are price-sensitive. Bandit data is directionally useful but thin (~1,300 total impressions); let it keep running.

---

## 5. Pricing structure audit — credits vs subscriptions

Verified directly against `shared/config/subscription.config.ts`, `shared/config/credits.config.ts`, `server/services/model-registry.ts`, `app/api/upscale/route.ts`, and live Stripe data.

### Per-credit economics

| Offer         | Price   | Credits | $/credit    |
| ------------- | ------- | ------- | ----------- |
| Small pack    | $4.99   | 50      | $0.0998     |
| Medium pack   | $14.99  | 200     | $0.0750     |
| Large pack    | $39.99  | 600     | $0.0667     |
| Starter sub   | $9/mo   | 100     | $0.0900     |
| **Hobby sub** | $19/mo  | 200     | **$0.0950** |
| Pro sub       | $49/mo  | 1,000   | $0.0490     |
| Business sub  | $149/mo | 5,000   | $0.0298     |

### Incoherence 1: Hobby is strictly dominated by the Medium pack

Hobby ($19/mo, 200 credits) vs Medium pack ($14.99 one-time, 200 credits): the pack is $4 cheaper, has no commitment, and never expires. And because **any purchased-credit balance grants hobby-tier access** (`app/api/upscale/route.ts:363-367` — pack buyers get `userTier = 'hobby'`, unlocking all premium models and hobby batch limits), the pack buyer loses nothing on features. A rational user should never buy Hobby. Live data agrees: Hobby has 1 active subscriber.

### Incoherence 2: inverted tier ladder

Hobby ($0.095/credit) is _more expensive per credit_ than the cheaper Starter plan ($0.090/credit). Normally higher tiers get better unit pricing; here the ladder dips at Hobby, exactly the tier positioned as the entry point to premium models.

### Incoherence 3: the "11–58% cheaper" marketing claim is false for most tiers

`locales/en/pricing.json:25`, `dashboard.json:73-74`, and `stripe.json:21-22` all claim subscriptions are 11–58% cheaper per credit than packs. In reality, vs the Large pack ($0.0667): Starter is **35% more expensive**, Hobby is **42% more expensive**; only Pro (27% cheaper) and Business (55% cheaper) beat packs. Even vs the Medium pack, Starter and Hobby lose. This is a trust liability and likely depresses subscription conversion when users do the math. Fix the copy or fix the prices — currently both contradict each other.

### Incoherence 4: pack-unlocks-hobby is undocumented

Granting hobby-tier model access to any pack buyer is arguably the right call for this buyer base — but it's invisible. Nothing in the pricing page says "any credit purchase unlocks all premium models." You're giving away the subscription's main differentiator without getting the marketing benefit. Either advertise it ("every purchase unlocks all 14 models") or gate premium models behind a mid/large pack minimum to protect the ladder.

### What buyers actually choose (Stripe, Apr–Jul)

Of 135 charges: 64× $4.99 Small pack, ~35 regionally-discounted small amounts ($1–4), 8× $9 Starter, 6× $14.99 Medium, 5× $19, 3× $39.99 Large. **Demand is concentrated at the lowest price points** — regional discounting is working, and the entry pack is the product.

### Recommended restructure

1. **Fix or kill Hobby.** Either $14.99/mo, or 300 credits at $19, or fold model access into Starter and delete Hobby. Whatever the choice, no subscription should be dominated by a one-time pack.
2. **Make the honest subscription pitch:** monthly refresh + rollover (up to 6×) + batch limits — and genuinely cheaper credits only from Pro up. Correct the 11–58% copy everywhere.
3. **Lean into the entry point:** the $4.99 pack is the volume product. Add a post-purchase path from it (auto top-up, next-pack discount) rather than pushing dominated subscriptions.
4. **Decide the model-access policy deliberately** (advertise pack-unlock or restrict it), and cover it with tests either way.

---

## 6. Longer-term bets (only after the above)

- **API / bulk tier** for agencies and automation ($99–299/mo) — different buyer, higher margin, zero current coverage.
- **Referral program** ("give 10 credits, get 10") — cheap viral loop; nothing exists today.
- **Paywalled-region engagement path** — binary regional paywall likely produces 0% conversion in affected countries; an earned-access or pay-what-you-want path could recover some.

---

## 7. Suggested sequence

| #   | Action                                             | Effort | Why now                                                                   |
| --- | -------------------------------------------------- | ------ | ------------------------------------------------------------------------- |
| 1   | Paid email provider + frequency-cap rebalance      | Days   | 81k suppressed emails; unblocks all lifecycle/recovery work already built |
| 2   | Fix experiment reward tracking                     | Days   | Currently flying blind on purchase-modal optimization                     |
| 3   | Ship `compact_credit_picker` as model-gate default | Hours  | Proven winner (0.71% vs 0.4%)                                             |
| 4   | Conversion-collapse diagnosis (traffic + funnel)   | ~1 wk  | Potentially 4× buyer volume at current traffic                            |
| 5   | Pre-checkout email capture                         | Days   | Feeds recovery campaigns unblocked by #1                                  |
| 6   | Auto top-up + repeat-buyer offers                  | ~1 wk  | Monetizes proven 35% repeat behavior                                      |
| 7   | Cancel-flow retention offers                       | Days   | 85% subscriber churn, no save attempt today                               |
| 8   | Subscription pitch to heavy-usage cohort           | Days   | The only realistic subscription audience (324 users)                      |

## Data sources & caveats

- Production Supabase: `profiles`, `subscriptions`, `credit_transactions`, `email_lifecycle_queue/events`, `experiment_*`, `pricing_bandit_arms`, `revenue_recovery_intents` (queried 2026-07-10).
- Codebase: `shared/config/subscription.config.ts`, `credits.config.ts`, `pricing-regions.ts`, `client/components/stripe/PurchaseModal.tsx`, `server/services/email-lifecycle.service.ts`, PRDs in `docs/PRDs/`.
- Dollar revenue is not stored in the DB (only credits and bandit `revenue_cents`); revenue statements here are inferred from purchase counts and pack prices. Cross-check exact MRR/LTV in the Stripe dashboard.
- July figures are partial-month.
